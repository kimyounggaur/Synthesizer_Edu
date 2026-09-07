import { PROFILE_ID } from '@/lib/content';
import { json } from '@/lib/server';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return id === PROFILE_ID
    ? json({
        profileId: id,
        learningStatus: 'preparing',
        hardwareVerified: false,
        activeHardwareRelease: null,
        demoPackage: '/api/demo/package',
        offlinePolicy: { mode: 'screen_practice_only', maxHardwareRisk: 'R0' },
      })
    : json({ code: 'PROFILE_NOT_FOUND' }, 404);
}
