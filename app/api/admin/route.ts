import { admin, database, failure, json } from '@/lib/server';
import { lessons, MODEL_ID, PROFILE_ID, RELEASE_ID } from '@/lib/content';
export async function GET(request: Request) {
  try {
    const user = admin(request);
    const db = database();
    const [releases, manuals, crawlIssues, feedback, audit] = await Promise.all([
      db
        .prepare(
          'SELECT id,status,author,revision,created_at,updated_at FROM releases ORDER BY updated_at DESC LIMIT 30',
        )
        .all(),
      db
        .prepare(
          `SELECT d.id,d.status,d.title,d.doc_type,d.language,d.version,
             d.canonical_url,d.last_checked_at,m.canonical_name,s.id AS source_id,
             s.display_name,
             COALESCE((SELECT group_concat(cs.content_id) FROM content_sources cs
               WHERE cs.document_id=d.id),'') AS affected_content
           FROM manual_documents d
           JOIN models m ON m.id=d.model_id
           JOIN sources s ON s.id=m.source_id
           WHERE d.status!='published'
           ORDER BY d.last_checked_at DESC LIMIT 100`,
        )
        .all(),
      db
        .prepare(
          `SELECT id,source_id,document_id,url,reasons,created_at
           FROM crawl_issues WHERE status='open'
           ORDER BY created_at DESC LIMIT 100`,
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
      manuals: manuals.results,
      crawlIssues: crawlIssues.results,
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
