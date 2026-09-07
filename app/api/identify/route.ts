import {
  ApiError,
  database,
  failure,
  guest,
  jpegDimensions,
  json,
  limit,
  readLimited,
  runtime,
  sameOrigin,
} from '@/lib/server';
import { extractText } from '@/lib/ocr';
import { matchModels } from '@/lib/engine';
export async function POST(request: Request) {
  const session = guest(request);
  try {
    sameOrigin(request);
    if (!runtime().GOOGLE_VISION_API_KEY || runtime().OCR_DISABLED === 'true')
      throw new ApiError(
        503,
        'OCR_NOT_CONFIGURED',
        '사진 인식 서비스 연결 전이에요. 모델명을 직접 입력해 주세요.',
      );
    await limit(request, 'ocr', 6);
    const bytes = await readLimited(request, 3 * 1024 * 1024);
    const form = await new Response(bytes, {
      headers: { 'Content-Type': request.headers.get('content-type') || '' },
    }).formData();
    if (form.get('consent') !== 'true')
      throw new ApiError(
        400,
        'CONSENT_REQUIRED',
        '전송할 영역과 사진 처리 안내를 먼저 확인해 주세요.',
      );
    const requestId = form.get('client_request_id');
    if (typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(requestId))
      throw new ApiError(
        400,
        'INVALID_REQUEST_ID',
        '요청 정보를 확인하지 못했어요.',
      );
    const file = form.get('image');
    if (
      !(file instanceof File) ||
      file.type !== 'image/jpeg' ||
      file.size > 2 * 1024 * 1024
    )
      throw new ApiError(
        415,
        'INVALID_IMAGE',
        '2MB 이하의 잘라낸 JPG 사진을 선택해 주세요.',
      );
    const image = new Uint8Array(await file.arrayBuffer());
    jpegDimensions(image);
    const db = database();
    await db
      .prepare('DELETE FROM scans WHERE expires_at < ?')
      .bind(Date.now())
      .run();
    const existing = await db
      .prepare(
        'SELECT id,status,result FROM scans WHERE owner=? AND request_id=?',
      )
      .bind(session.id, requestId)
      .first<{ id: string; status: string; result: string | null }>();
    if (existing) {
      if (existing.status === 'processing')
        return json(
          {
            code: 'REQUEST_IN_PROGRESS',
            message: '같은 사진을 분석 중이에요.',
            scanId: existing.id,
          },
          409,
          session.headers,
        );
      if (existing.result)
        return json(JSON.parse(existing.result), 200, session.headers);
      throw new ApiError(
        409,
        'REQUEST_ALREADY_PROCESSED',
        '이 요청은 이미 처리됐어요. 새 요청으로 다시 시도해 주세요.',
      );
    }
    const id = crypto.randomUUID();
    const inserted = await db
      .prepare(
        "INSERT OR IGNORE INTO scans(id,owner,request_id,status,expires_at) VALUES (?,?,?,'processing',?)",
      )
      .bind(id, session.id, requestId, Date.now() + 900000)
      .run();
    if (inserted.meta.changes === 0) {
      const concurrent = await db
        .prepare('SELECT id FROM scans WHERE owner=? AND request_id=?')
        .bind(session.id, requestId)
        .first<{ id: string }>();
      return json(
        {
          code: 'REQUEST_IN_PROGRESS',
          message: '같은 요청을 이미 처리하고 있어요.',
          scanId: concurrent?.id,
        },
        409,
        session.headers,
      );
    }
    try {
      const raw = await extractText(image);
      const name =
        raw
          .match(/(?:JUNO\s*[- ]?DS\s*\d*|MODX\s*\d*\s*(?:\+|PLUS)?)/i)?.[0]
          ?.trim() || '';
      const brands = raw.match(/\b(?:ROLAND|YAMAHA)\b/gi) || [];
      const text = name ? [...new Set(brands), name].join(' ') : '';
      const result = {
        scanId: id,
        ...matchModels(text),
        state: 'RESULT_READY',
        automaticConfirmation: false,
      };
      await db
        .prepare('UPDATE scans SET status=?,result=? WHERE id=? AND owner=?')
        .bind('ready', JSON.stringify(result), id, session.id)
        .run();
      return json(result, 200, session.headers);
    } catch (e) {
      await db
        .prepare("UPDATE scans SET status='failed' WHERE id=? AND owner=?")
        .bind(id, session.id)
        .run();
      throw e;
    }
  } catch (e) {
    const r = failure(e);
    for (const [k, v] of Object.entries(session.headers)) r.headers.set(k, v);
    return r;
  }
}
