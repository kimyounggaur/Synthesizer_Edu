import { catalog } from '@/lib/content';
import { matchModels } from '@/lib/engine';
import { json } from '@/lib/server';
export function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q');
  return json(
    q ? matchModels(q) : { candidates: catalog, automaticConfirmation: false },
  );
}
