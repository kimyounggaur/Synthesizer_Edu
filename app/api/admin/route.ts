import { admin, database, failure, json } from '@/lib/server';
import { lessons, MODEL_ID, PROFILE_ID, RELEASE_ID } from '@/lib/content';
export async function GET(request: Request) {
  try {
    const user = admin(request);
    const db = database();
    const [releases, feedback, audit] = await Promise.all([
      db
        .prepare(
          'SELECT id,status,author,revision,created_at,updated_at FROM releases ORDER BY updated_at DESC LIMIT 30',
        )
        .all(),
      db
        .prepare('SELECT * FROM feedback ORDER BY created_at DESC LIMIT 30')
        .all(),
      db
        .prepare(
          'SELECT action,release_id,created_at FROM audit_log ORDER BY created_at DESC LIMIT 30',
        )
        .all(),
    ]);
    return json({
      authorized: true,
      user: { email: user.email },
      releases: releases.results,
      feedback: feedback.results,
      audit: audit.results,
      draft: {
        schemaVersion: 1,
        modelId: MODEL_ID,
        profileId: PROFILE_ID,
        releaseId: RELEASE_ID,
        mode: 'screen_practice',
        hardwareVerified: false,
        verification: 'literature_checked',
        lessons,
      },
    });
  } catch (e) {
    return failure(e);
  }
}
