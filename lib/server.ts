import { env } from 'cloudflare:workers';
export type RuntimeEnv = {
  DB: D1Database;
  GOOGLE_VISION_API_KEY?: string;
  ADMIN_EMAILS?: string;
  OCR_DISABLED?: string;
};
export function runtime() {
  return env as unknown as RuntimeEnv;
}
export function database() {
  const db = runtime().DB;
  if (!db)
    throw new ApiError(
      503,
      'STORAGE_UNAVAILABLE',
      '저장 서비스를 연결하지 못했어요.',
    );
  return db;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function json(
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
}
export function failure(error: unknown) {
  if (error instanceof ApiError)
    return json(
      {
        code: error.code,
        message: error.message,
        request_id: crypto.randomUUID(),
      },
      error.status,
    );
  return json(
    {
      code: 'SERVICE_UNAVAILABLE',
      message:
        '지금 요청을 처리하지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
      request_id: crypto.randomUUID(),
    },
    503,
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError(403, 'INVALID_ORIGIN', '요청 출처를 확인하지 못했어요.');
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new ApiError(
      403,
      'INVALID_ORIGIN',
      '이 사이트에서 다시 시도해 주세요.',
    );
}
export function guest(request: Request): {
  id: string;
  headers: Record<string, string>;
} {
  const old = request.headers
    .get('cookie')
    ?.match(/(?:^|;\s*)synth_guest=([a-f0-9-]{36})(?:;|$)/)?.[1];
  const id = old || crypto.randomUUID();
  return {
    id,
    headers: old
      ? {}
      : {
          'Set-Cookie': `synth_guest=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=900${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`,
        },
  };
}
export async function readLimited(request: Request, limit: number) {
  if (Number(request.headers.get('content-length') || 0) > limit)
    throw new ApiError(413, 'TOO_LARGE', '보낼 내용이 너무 커요.');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError(413, 'TOO_LARGE', '보낼 내용이 너무 커요.');
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
export async function bodyJson(request: Request, limit = 100_000) {
  try {
    return JSON.parse(
      new TextDecoder().decode(await readLimited(request, limit)),
    );
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, 'INVALID_JSON', '입력 내용을 확인해 주세요.');
  }
}
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function limit(request: Request, kind: string, count = 10) {
  const db = database();
  const now = Date.now();
  const bucket = Math.floor(now / 60000);
  const key = await hash(
    `${kind}:${request.headers.get('cf-connecting-ip') || 'local'}:${bucket}`,
  );
  await db
    .prepare('DELETE FROM rate_limits WHERE expires_at < ?')
    .bind(now)
    .run();
  const row = await db
    .prepare(
      'INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
    )
    .bind(key, now + 120000)
    .first<{ count: number }>();
  if (row && row.count > count)
    throw new ApiError(
      429,
      'RATE_LIMITED',
      '요청이 많아요. 1분 뒤 다시 시도해 주세요.',
    );
}
export function admin(request: Request) {
  const email = request.headers.get('oai-authenticated-user-email');
  const user = request.headers.get('oai-authenticated-user-id');
  const allow = (runtime().ADMIN_EMAILS || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (!user || !email)
    throw new ApiError(
      401,
      'AUTH_REQUIRED',
      '콘텐츠 검수는 관리자 로그인이 필요해요.',
    );
  if (!allow.includes(email.toLowerCase()))
    throw new ApiError(
      403,
      'ADMIN_REQUIRED',
      '이 계정에는 콘텐츠 검수 권한이 없어요.',
    );
  return { id: user, email };
}
export function jpegDimensions(bytes: Uint8Array) {
  if (
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes.at(-2) !== 255 ||
    bytes.at(-1) !== 217
  )
    throw new ApiError(
      415,
      'INVALID_IMAGE',
      '손상되지 않은 JPG 사진을 선택해 주세요.',
    );
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 255) {
      i++;
      continue;
    }
    let marker = bytes[i + 1];
    while (marker === 255) {
      i++;
      marker = bytes[i + 1];
    }
    if (marker === 217 || marker === 218) break;
    const length = (bytes[i + 2] << 8) + bytes[i + 3];
    if (length < 2 || i + 2 + length > bytes.length) break;
    if ([192, 193, 194].includes(marker)) {
      const height = (bytes[i + 5] << 8) + bytes[i + 6];
      const width = (bytes[i + 7] << 8) + bytes[i + 8];
      if (
        width < 1 ||
        height < 1 ||
        width * height > 4_000_000 ||
        Math.max(width, height) > 2400
      )
        throw new ApiError(
          413,
          'IMAGE_DIMENSIONS',
          '사진 영역을 더 작게 선택해 주세요.',
        );
      return { width, height };
    }
    i += length + 2;
  }
  throw new ApiError(
    415,
    'INVALID_IMAGE',
    '사진을 읽을 수 없어요. 다른 JPG 사진을 선택해 주세요.',
  );
}
