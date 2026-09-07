import {
  controls,
  lessons,
  helpTopics,
  MODEL_ID,
  PROFILE_ID,
  RELEASE_ID,
} from '@/lib/content';
import { hash, json } from '@/lib/server';
export async function GET() {
  const payload = {
    schemaVersion: 1,
    modelId: MODEL_ID,
    profileId: PROFILE_ID,
    releaseId: RELEASE_ID,
    mode: 'screen_practice',
    hardwareVerified: false,
    verification: 'literature_checked',
    controls,
    lessons,
    helpTopics,
  };
  return json({ payload, hash: await hash(JSON.stringify(payload)) });
}
