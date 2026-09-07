import {
  ApiError,
  database,
  failure,
  guest,
  json,
  sameOrigin,
} from '@/lib/server';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const owner = guest(request).id;
    const row = await database()
      .prepare(
        'SELECT status,result FROM scans WHERE id=? AND owner=? AND expires_at>?',
      )
      .bind(id, owner, Date.now())
      .first<{ status: string; result: string | null }>();
    if (!row)
      throw new ApiError(
        404,
        'SCAN_NOT_FOUND',
        '인식 결과가 없거나 보관 시간이 지났어요.',
      );
    return json(row.result ? JSON.parse(row.result) : { state: row.status });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const { id } = await params;
    await database()
      .prepare('DELETE FROM scans WHERE id=? AND owner=?')
      .bind(id, guest(request).id)
      .run();
    return json({ deleted: true });
  } catch (e) {
    return failure(e);
  }
}
