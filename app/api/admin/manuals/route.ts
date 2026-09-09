import {
  admin,
  ApiError,
  bodyJson,
  database,
  failure,
  json,
  runtime,
  sameOrigin,
} from '@/lib/server';

type ManualRow = {
  id: string;
  status: string;
  sha256: string | null;
  mime_type: string;
  source_id: string;
};

function reasonFrom(input: Record<string, unknown>) {
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < 5) {
    throw new ApiError(400, 'REASON_REQUIRED', '사유를 5자 이상 기록해 주세요.');
  }
  return reason.slice(0, 500);
}

function stringField(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === 'string' ? value : '';
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const actor = admin(request);
    const input = (await bodyJson(request, 50_000)) as Record<string, unknown>;
    const action = stringField(input, 'action');
    const id = stringField(input, 'id');
    const db = database();
    const now = new Date().toISOString();

    if (action === 'suspend_source') {
      const sourceId = stringField(input, 'sourceId');
      const reason = reasonFrom(input);
      const result = await db
        .prepare("UPDATE sources SET status='suspended',notes=COALESCE(notes,'') || ? WHERE id=?")
        .bind(`\n[${now}] suspended: ${reason}`, sourceId)
        .run();
      if (!result.meta.changes) {
        throw new ApiError(404, 'SOURCE_NOT_FOUND', '소스를 찾지 못했습니다.');
      }
      await db
        .prepare(
          'INSERT INTO audit_log(id,actor,action,release_id,detail,created_at) VALUES (?,?,?,?,?,?)',
        )
        .bind(crypto.randomUUID(), actor.id, 'manual_source_suspended', `source:${sourceId}`, reason, now)
        .run();
      return json({ suspended: true, sourceId });
    }

    const manual = await db
      .prepare(
        `SELECT d.id,d.status,d.sha256,d.mime_type,m.source_id
         FROM manual_documents d JOIN models m ON m.id=d.model_id WHERE d.id=?`,
      )
      .bind(id)
      .first<ManualRow>();
    if (!manual) throw new ApiError(404, 'MANUAL_NOT_FOUND', '매뉴얼을 찾지 못했습니다.');

    if (action === 'verify') {
      if (!['draft', 'stale'].includes(manual.status)) {
        throw new ApiError(409, 'INVALID_STATUS', 'draft 또는 stale 상태만 검증할 수 있습니다.');
      }
      if (!manual.sha256) {
        throw new ApiError(422, 'HASH_REQUIRED', 'SHA-256이 없는 문서는 검증할 수 없습니다.');
      }
      await db.batch([
        db
          .prepare("UPDATE manual_documents SET status='verified' WHERE id=? AND status IN ('draft','stale')")
          .bind(id),
        db
          .prepare(
            'INSERT INTO audit_log(id,actor,action,release_id,detail,created_at) VALUES (?,?,?,?,?,?)',
          )
          .bind(crypto.randomUUID(), actor.id, 'manual_verified', `manual:${id}`, reasonFrom(input), now),
      ]);
      return json({ verified: true, id });
    }

    if (action === 'publish') {
      if (manual.status !== 'verified') {
        throw new ApiError(409, 'INVALID_STATUS', 'verified 상태만 게시할 수 있습니다.');
      }
      const verification = await db
        .prepare(
          "SELECT actor FROM audit_log WHERE release_id=? AND action='manual_verified' ORDER BY created_at DESC LIMIT 1",
        )
        .bind(`manual:${id}`)
        .first<{ actor: string }>();
      if (!verification || verification.actor === actor.id) {
        throw new ApiError(
          422,
          'INDEPENDENT_REVIEW_REQUIRED',
          '검증자와 다른 관리자가 게시해야 합니다.',
        );
      }
      const updated = await db
        .prepare("UPDATE manual_documents SET status='published' WHERE id=? AND status='verified'")
        .bind(id)
        .run();
      if (!updated.meta.changes) throw new ApiError(409, 'STATUS_CHANGED', '문서 상태가 변경됐습니다.');
      await db
        .prepare(
          'INSERT INTO audit_log(id,actor,action,release_id,detail,created_at) VALUES (?,?,?,?,?,?)',
        )
        .bind(crypto.randomUUID(), actor.id, 'manual_published', `manual:${id}`, reasonFrom(input), now)
        .run();
      return json({ published: true, id });
    }

    if (action === 'reject') {
      const reason = reasonFrom(input);
      await db.batch([
        db.prepare("UPDATE manual_documents SET status='rejected' WHERE id=?").bind(id),
        db
          .prepare(
            'INSERT INTO audit_log(id,actor,action,release_id,detail,created_at) VALUES (?,?,?,?,?,?)',
          )
          .bind(crypto.randomUUID(), actor.id, 'manual_rejected', `manual:${id}`, reason, now),
      ]);
      return json({ rejected: true, id });
    }

    if (action === 'takedown') {
      const reason = reasonFrom(input);
      await db.batch([
        db.prepare("UPDATE sources SET status='suspended' WHERE id=?").bind(manual.source_id),
        db
          .prepare("UPDATE manual_documents SET status='dead',dead_since=? WHERE id=?")
          .bind(Date.now(), id),
        db
          .prepare(
            'INSERT INTO audit_log(id,actor,action,release_id,detail,created_at) VALUES (?,?,?,?,?,?)',
          )
          .bind(crypto.randomUUID(), actor.id, 'manual_takedown', `manual:${id}`, reason, now),
      ]);
      const extension = manual.mime_type === 'application/pdf' ? '.pdf' : '.html';
      await runtime().MANUAL_CACHE?.delete(`${manual.source_id}/${id}${extension}`);
      return json({ takenDown: true, id, sourceSuspended: manual.source_id });
    }

    throw new ApiError(400, 'INVALID_ACTION', '허용되지 않은 매뉴얼 작업입니다.');
  } catch (error) {
    return failure(error);
  }
}
