import { catalog } from '@/lib/content';
import { json } from '@/lib/server';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const model = catalog.find((m) => m.id === id);
  return model
    ? json({ ...model, hardwareVerified: false, learningStatus: 'preparing' })
    : json({ code: 'MODEL_NOT_FOUND' }, 404);
}
