import { database, failure, json } from '@/lib/server';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const row = await database()
      .prepare('SELECT payload,status FROM releases WHERE id=?')
      .bind(id)
      .first<{ payload: string; status: string }>();
    if (!row || row.status === 'draft')
      return json({ code: 'RELEASE_NOT_FOUND' }, 404);
    if (row.status === 'revoked')
      return json(
        { code: 'RELEASE_REVOKED', message: '이 자료는 회수됐어요.' },
        410,
      );
    return json({
      ...JSON.parse(row.payload),
      releaseId: id,
      hardwareVerified: false,
      mode: 'screen_practice',
    });
  } catch (e) {
    return failure(e);
  }
}
