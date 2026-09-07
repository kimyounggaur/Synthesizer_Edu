import { guest, json } from '@/lib/server';
export function GET(request: Request) {
  return json({ ready: true }, 200, guest(request).headers);
}
