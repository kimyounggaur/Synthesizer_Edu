import { json } from '@/lib/server';
export function GET() {
  return json(
    { code: 'ENDPOINT_NOT_FOUND', message: '이 요청 경로는 지원하지 않아요.' },
    404,
  );
}
export const POST = GET;
