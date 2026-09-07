import {
  admin,
  ApiError,
  bodyJson,
  database,
  failure,
  json,
  sameOrigin,
} from '@/lib/server';
import {
  validateDraft,
  publicationBlockers,
  type ReviewEvidence,
} from '@/lib/publication';
type ReleaseRow = {
  id: string;
  payload: string;
  status: string;
  author: string;
  revision: number;
};
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const actor = admin(request);
    const input = await bodyJson(request, 250000);
    const db = database();
    const now = new Date().toISOString();
    if (input.action === 'validate') {
      const errors = validateDraft(input.payload);
      return json({
        valid: !errors.length,
        errors,
        publicationBlockers: [
          '실물 검수 미완료',
          '독립 검토 미완료',
          '실제 조작 안내는 공개되지 않아요.',
        ],
      });
    }
    if (input.action === 'save') {
      const errors = validateDraft(input.payload);
      if (errors.length)
        return json(
          { code: 'INVALID_DRAFT', message: '초안 검사에 실패했어요.', errors },
          422,
        );
      const id = input.id || crypto.randomUUID();
      if (typeof id !== 'string' || id.length > 80)
        throw new ApiError(400, 'INVALID_ID', '초안 ID를 확인해 주세요.');
      const previous = await db
        .prepare('SELECT id,status,revision FROM releases WHERE id=?')
        .bind(id)
        .first<ReleaseRow>();
      if (previous) {
        if (previous.status !== 'draft')
          throw new ApiError(
            409,
            'IMMUTABLE_RELEASE',
            '검수·게시된 버전은 새 초안으로 복사해 주세요.',
          );
        if (input.revision !== previous.revision)
          throw new ApiError(
            409,
            'REVISION_CONFLICT',
            '다른 변경이 있어요. 목록을 새로 확인해 주세요.',
          );
        const result = await db
          .prepare(
            'UPDATE releases SET payload=?,revision=revision+1,updated_at=?,author=? WHERE id=? AND revision=? AND status=?',
          )
          .bind(
            JSON.stringify({
              ...input.payload,
              releaseId: id,
              hardwareVerified: false,
              verification: 'literature_checked',
              mode: 'screen_practice',
            }),
            now,
            actor.id,
            id,
            previous.revision,
            'draft',
          )
          .run();
        if (!result.meta.changes)
          throw new ApiError(
            409,
            'REVISION_CONFLICT',
            '초안이 변경됐어요. 다시 불러와 주세요.',
          );
      } else
        await db
          .prepare(
            'INSERT INTO releases(id,status,payload,author,revision,created_at,updated_at) VALUES (?,?,?,?,1,?,?)',
          )
          .bind(
            id,
            'draft',
            JSON.stringify({
              ...input.payload,
              releaseId: id,
              hardwareVerified: false,
              verification: 'literature_checked',
              mode: 'screen_practice',
            }),
            actor.id,
            now,
            now,
          )
          .run();
      await db
        .prepare(
          'INSERT INTO audit_log(id,actor,action,release_id,detail,created_at) VALUES (?,?,?,?,?,?)',
        )
        .bind(
          crypto.randomUUID(),
          actor.id,
          'draft_saved',
          id,
          '초안 저장',
          now,
        )
        .run();
      return json(
        { id, status: 'draft', revision: previous ? previous.revision + 1 : 1 },
        201,
      );
    }
    const release = await db
      .prepare('SELECT * FROM releases WHERE id=?')
      .bind(String(input.id || ''))
      .first<ReleaseRow>();
    if (!release)
      throw new ApiError(
        404,
        'RELEASE_NOT_FOUND',
        '검수할 초안을 먼저 저장해 주세요.',
      );
    if (input.action === 'review') {
      if (release.status !== 'draft')
        throw new ApiError(
          409,
          'INVALID_STATUS',
          '초안 상태에서 검수 기록을 추가해 주세요.',
        );
      const e = input.evidence as ReviewEvidence;
      if (
        !e ||
        typeof e.firmware !== 'string' ||
        typeof e.panelVersion !== 'string' ||
        typeof e.evidenceUrl !== 'string' ||
        typeof e.rightsUrl !== 'string'
      )
        throw new ApiError(
          400,
          'INVALID_REVIEW',
          '모델·펌웨어·패널·검수와 권리 근거를 입력해 주세요.',
        );
      const errors = publicationBlockers(
        JSON.parse(release.payload),
        release.author,
        [{ reviewer: actor.id, evidence: e }],
      );
      if (errors.length)
        return json(
          {
            code: 'REVIEW_INCOMPLETE',
            message: '검수 조건을 충족하지 않았어요.',
            errors,
          },
          422,
        );
      await db.batch([
        db
          .prepare(
            'INSERT INTO reviews(id,release_id,release_revision,reviewer,evidence,created_at) VALUES (?,?,?,?,?,?)',
          )
          .bind(
            crypto.randomUUID(),
            release.id,
            release.revision,
            actor.id,
            JSON.stringify(e),
            now,
          ),
        db
          .prepare(
            'INSERT INTO audit_log(id,actor,action,release_id,detail,created_at) VALUES (?,?,?,?,?,?)',
          )
          .bind(
            crypto.randomUUID(),
            actor.id,
            'review_recorded',
            release.id,
            '독립 검수 기록',
            now,
          ),
      ]);
      return json({ reviewed: true });
    }
    if (input.action === 'publish') {
      if (release.status !== 'draft')
        throw new ApiError(
          409,
          'INVALID_STATUS',
          '게시할 수 있는 초안 상태가 아니에요.',
        );
      const rows = await db
        .prepare(
          'SELECT reviewer,evidence FROM reviews WHERE release_id=? AND release_revision=?',
        )
        .bind(release.id, release.revision)
        .all<{ reviewer: string; evidence: string }>();
      const errors = publicationBlockers(
        JSON.parse(release.payload),
        release.author,
        rows.results.map((r) => ({ ...r, evidence: JSON.parse(r.evidence) })),
      );
      if (errors.length)
        return json(
          {
            code: 'PUBLICATION_BLOCKED',
            message: '검수되지 않은 자료는 게시할 수 없어요.',
            errors,
          },
          422,
        );
      const updated = await db
        .prepare(
          "UPDATE releases SET status='published',updated_at=? WHERE id=? AND status='draft' AND revision=?",
        )
        .bind(now, release.id, release.revision)
        .run();
      if (!updated.meta.changes)
        throw new ApiError(
          409,
          'REVISION_CONFLICT',
          '검수 후 내용이 변경됐어요.',
        );
      await db
        .prepare(
          'INSERT INTO audit_log(id,actor,action,release_id,detail,created_at) VALUES (?,?,?,?,?,?)',
        )
        .bind(
          crypto.randomUUID(),
          actor.id,
          'published',
          release.id,
          '검수한 화면 연습 게시',
          now,
        )
        .run();
      return json({
        published: true,
        mode: 'screen_practice',
        hardwareLearningAllowed: false,
      });
    }
    if (input.action === 'revoke') {
      if (typeof input.reason !== 'string' || input.reason.trim().length < 5)
        throw new ApiError(
          400,
          'REASON_REQUIRED',
          '회수 사유를 5자 이상 기록해 주세요.',
        );
      await db.batch([
        db
          .prepare(
            "UPDATE releases SET status='revoked',updated_at=? WHERE id=?",
          )
          .bind(now, release.id),
        db
          .prepare(
            'INSERT INTO audit_log(id,actor,action,release_id,detail,created_at) VALUES (?,?,?,?,?,?)',
          )
          .bind(
            crypto.randomUUID(),
            actor.id,
            'revoked',
            release.id,
            input.reason.slice(0, 500),
            now,
          ),
      ]);
      return json({ revoked: true });
    }
    throw new ApiError(400, 'INVALID_ACTION', '허용되지 않은 작업이에요.');
  } catch (e) {
    return failure(e);
  }
}
