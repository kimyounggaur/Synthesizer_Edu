import {
  ApiError,
  bodyJson,
  database,
  failure,
  json,
  runtime,
} from '@/lib/server';
import {
  assertNotCrawler,
  validateIngestPayload,
  type ManualIngestPayload,
} from '@/lib/manual-ingest';
import { lessons } from '@/lib/content';

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function authorize(request: Request) {
  const configured = runtime().CRAWLER_INGEST_TOKEN;
  const authorization = request.headers.get('authorization') ?? '';
  const provided = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';
  if (!configured || !provided) {
    throw new ApiError(401, 'CRAWLER_AUTH_REQUIRED', '크롤러 인증이 필요합니다.');
  }
  const [expectedHash, providedHash] = await Promise.all([
    sha256(configured),
    sha256(provided),
  ]);
  if (expectedHash !== providedHash) {
    throw new ApiError(403, 'CRAWLER_AUTH_FAILED', '크롤러 인증을 확인하지 못했습니다.');
  }
}

function isoMillis(value?: string) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function GET(request: Request) {
  try {
    await authorize(request);
    const sourceId = new URL(request.url).searchParams.get('source') ?? '';
    if (!/^[a-z][a-z0-9-]*$/.test(sourceId)) {
      throw new ApiError(400, 'INVALID_SOURCE', '소스 ID를 확인해 주세요.');
    }
    const result = await database()
      .prepare(
        `SELECT d.canonical_url,d.http_etag,d.http_last_modified,d.sha256,
           d.byte_size,d.status
         FROM manual_documents d
         JOIN models m ON m.id=d.model_id
         WHERE m.source_id=?`,
      )
      .bind(sourceId)
      .all<{
        canonical_url: string;
        http_etag: string | null;
        http_last_modified: string | null;
        sha256: string | null;
        byte_size: number | null;
        status: string;
      }>();
    return json({
      documents: result.results.map((row) => ({
        canonicalUrl: row.canonical_url,
        etag: row.http_etag ?? undefined,
        lastModified: row.http_last_modified ?? undefined,
        sha256: row.sha256 ?? undefined,
        byteSize: row.byte_size ?? undefined,
        status: row.status,
      })),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    await authorize(request);
    const raw = await bodyJson(request, 2_000_000);
    const errors = validateIngestPayload(raw);
    if (errors.length) {
      return json(
        { code: 'INVALID_CRAWL_DRAFT', message: '수집 초안 형식이 올바르지 않습니다.', errors },
        422,
      );
    }
    const input = raw as ManualIngestPayload;
    const allowedHosts = new Set([
      ...input.source.baseHosts,
      ...input.source.assetHosts,
    ]);
    for (const document of input.documents) {
      assertNotCrawler(input.actor, document.status);
      if (!allowedHosts.has(new URL(document.canonicalUrl).hostname)) {
        throw new ApiError(
          422,
          'HOST_NOT_ALLOWED',
          `허용 목록 밖 문서입니다: ${document.canonicalUrl}`,
        );
      }
    }

    const db = database();
    const now = Date.now();
    const statements: D1PreparedStatement[] = [];
    statements.push(
      db
        .prepare(
          `INSERT INTO sources (
            id,display_name,archetype,base_hosts,asset_hosts,status,
            rate_limit_ms,crawl_budget,last_run_at,notes
          ) VALUES (?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET
            display_name=excluded.display_name,
            archetype=excluded.archetype,
            base_hosts=excluded.base_hosts,
            asset_hosts=excluded.asset_hosts,
            status=CASE
              WHEN excluded.status='blocked' THEN 'blocked'
              ELSE sources.status
            END,
            rate_limit_ms=excluded.rate_limit_ms,
            crawl_budget=excluded.crawl_budget,
            last_run_at=excluded.last_run_at,
            notes=excluded.notes`,
        )
        .bind(
          input.source.id,
          input.source.displayName,
          input.source.archetype,
          JSON.stringify(input.source.baseHosts),
          JSON.stringify(input.source.assetHosts),
          input.source.status,
          input.source.rateLimitMs,
          input.source.crawlBudget,
          isoMillis(input.run.finishedAt),
          input.source.notes ?? null,
        ),
    );

    for (const model of input.models) {
      statements.push(
        db
          .prepare(
            `INSERT INTO models (
              id,app_model_id,source_id,canonical_name,family,suffix,aliases,
              product_url,support_url,category,discontinued,first_seen_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
              app_model_id=excluded.app_model_id,
              canonical_name=excluded.canonical_name,
              family=excluded.family,
              suffix=excluded.suffix,
              aliases=excluded.aliases,
              product_url=excluded.product_url,
              support_url=excluded.support_url,
              category=excluded.category,
              discontinued=excluded.discontinued`,
          )
          .bind(
            model.id,
            model.appModelId ?? null,
            input.source.id,
            model.canonicalName,
            model.family ?? null,
            model.suffix ?? null,
            JSON.stringify(model.aliases),
            model.productUrl ?? null,
            model.supportUrl ?? null,
            model.category ?? null,
            model.discontinued ? 1 : 0,
            now,
          ),
      );
    }

    for (const document of input.documents) {
      statements.push(
        db
          .prepare(
            `INSERT INTO manual_documents (
              id,model_id,doc_type,language,title,version,published_at,
              canonical_url,mirror_urls,mime_type,byte_size,sha256,page_count,
              status,http_etag,http_last_modified,first_seen_at,last_checked_at,
              last_changed_at,dead_since
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(canonical_url) DO UPDATE SET
              model_id=excluded.model_id,
              doc_type=excluded.doc_type,
              language=excluded.language,
              title=excluded.title,
              version=excluded.version,
              published_at=excluded.published_at,
              mirror_urls=excluded.mirror_urls,
              mime_type=excluded.mime_type,
              byte_size=excluded.byte_size,
              page_count=excluded.page_count,
              http_etag=excluded.http_etag,
              http_last_modified=excluded.http_last_modified,
              last_checked_at=excluded.last_checked_at,
              last_changed_at=CASE
                WHEN manual_documents.sha256 IS NOT excluded.sha256 THEN excluded.last_checked_at
                ELSE manual_documents.last_changed_at
              END,
              sha256=excluded.sha256,
              status=CASE
                WHEN manual_documents.status IN ('published','verified')
                     AND manual_documents.sha256 IS NOT excluded.sha256 THEN 'stale'
                WHEN manual_documents.status IN ('published','verified','rejected')
                     THEN manual_documents.status
                ELSE excluded.status
              END,
              dead_since=excluded.dead_since`,
          )
          .bind(
            document.id,
            document.primaryModelId,
            document.docType,
            document.language,
            document.title,
            document.version ?? null,
            isoMillis(document.publishedAt),
            document.canonicalUrl,
            JSON.stringify(document.mirrorUrls),
            document.mimeType,
            document.byteSize ?? null,
            document.sha256 ?? null,
            document.pageCount ?? null,
            document.status,
            document.etag ?? null,
            document.lastModified ?? null,
            now,
            now,
            now,
            document.status === 'dead' ? now : null,
          ),
      );
      statements.push(
        db
          .prepare('DELETE FROM manual_document_models WHERE document_id=?')
          .bind(document.id),
      );
      statements.push(
        db
          .prepare(
            "UPDATE crawl_issues SET status='resolved',resolved_at=? WHERE url=? AND status='open'",
          )
          .bind(now, document.canonicalUrl),
      );
      for (const modelId of document.modelIds) {
        statements.push(
          db
            .prepare(
              'INSERT INTO manual_document_models(document_id,model_id,suffix_ambiguous) VALUES (?,?,?)',
            )
            .bind(document.id, modelId, document.suffixAmbiguous ? 1 : 0),
        );
      }
      const documentUrls = new Set([
        document.canonicalUrl,
        ...document.mirrorUrls,
      ]);
      for (const lesson of lessons) {
        for (const citation of lesson.sources) {
          if (!documentUrls.has(citation.url)) continue;
          statements.push(
            db
              .prepare(
                `INSERT INTO content_sources(content_id,document_id,page)
                 VALUES (?,?,?)
                 ON CONFLICT(content_id,document_id) DO UPDATE SET page=excluded.page`,
              )
              .bind(lesson.id, document.id, citation.page),
          );
        }
      }
      statements.push(
        db.prepare('DELETE FROM manual_outline WHERE document_id=?').bind(document.id),
      );
      for (const item of document.outline) {
        statements.push(
          db
            .prepare(
              'INSERT INTO manual_outline(id,document_id,depth,"order",heading,page_start,section_kind) VALUES (?,?,?,?,?,?,?)',
            )
            .bind(
              item.id,
              document.id,
              item.depth,
              item.order,
              item.heading,
              item.pageStart ?? null,
              item.sectionKind ?? null,
          ),
        );
      }
      statements.push(
        db
          .prepare('DELETE FROM manual_control_candidates WHERE document_id=?')
          .bind(document.id),
      );
      for (const name of document.controlCandidates) {
        statements.push(
          db
            .prepare(
              'INSERT INTO manual_control_candidates(id,document_id,name,normalized_name,review_status) VALUES (?,?,?,?,?)',
            )
            .bind(
              crypto.randomUUID(),
              document.id,
              name,
              name.toUpperCase().replace(/[^A-Z0-9가-힣]+/g, ' ').trim(),
              'candidate',
            ),
        );
      }
    }
    for (const issue of input.issues) {
      if (issue.url && issue.reasons.includes('http_404')) {
        const previous = await db
          .prepare(
            "SELECT count(*) AS count FROM crawl_issues WHERE url=? AND status='open' AND reasons LIKE '%http_404%'",
          )
          .bind(issue.url)
          .first<{ count: number }>();
        statements.push(
          db
            .prepare(
              `UPDATE manual_documents
               SET dead_since=COALESCE(dead_since,?),
                   status=CASE WHEN ? >= 2 THEN 'dead' ELSE status END
               WHERE canonical_url=?`,
            )
            .bind(now, previous?.count ?? 0, issue.url),
        );
      }
      statements.push(
        db
          .prepare(
            `INSERT INTO crawl_issues(id,source_id,document_id,url,reasons,status,created_at)
             VALUES (?,?,?,?,?,'open',?)
             ON CONFLICT(id) DO NOTHING`,
          )
          .bind(
            issue.id,
            input.source.id,
            issue.documentId ?? null,
            issue.url ?? null,
            JSON.stringify(issue.reasons),
            now,
          ),
      );
    }
    for (const robots of input.robots) {
      statements.push(
        db
          .prepare(
            `INSERT INTO source_robots_checks(source_id,host,checked_at,status_code,allows_root)
             VALUES (?,?,?,?,?)
             ON CONFLICT(source_id,host) DO UPDATE SET
               checked_at=excluded.checked_at,
               status_code=excluded.status_code,
               allows_root=excluded.allows_root`,
          )
          .bind(
            input.source.id,
            robots.host,
            isoMillis(robots.checkedAt),
            robots.statusCode,
            robots.allowsRoot ? 1 : 0,
          ),
      );
    }
    if (input.robots.length) {
      statements.push(
        db
          .prepare(
            'UPDATE sources SET robots_checked_at=?,robots_allows=? WHERE id=?',
          )
          .bind(
            Math.max(...input.robots.map((item) => isoMillis(item.checkedAt) ?? 0)),
            input.robots.every((item) => item.allowsRoot) ? 1 : 0,
            input.source.id,
          ),
      );
    }
    for (const canonicalUrl of input.notModifiedUrls) {
      statements.push(
        db
          .prepare(
            'UPDATE manual_documents SET last_checked_at=? WHERE canonical_url=?',
          )
          .bind(now, canonicalUrl),
      );
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO crawl_runs (
            id,source_id,started_at,finished_at,request_count,bytes_fetched,
            docs_found,docs_new,docs_changed,errors,outcome
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          input.run.id,
          input.source.id,
          isoMillis(input.run.startedAt),
          isoMillis(input.run.finishedAt),
          input.run.requestCount,
          input.run.bytesFetched,
          input.run.docsFound,
          input.run.docsNew,
          input.run.docsChanged,
          JSON.stringify(input.run.errors),
          input.run.outcome,
        ),
    );

    for (let offset = 0; offset < statements.length; offset += 50) {
      await db.batch(statements.slice(offset, offset + 50));
    }
    return json({ accepted: input.documents.length, runId: input.run.id }, 202);
  } catch (error) {
    return failure(error);
  }
}
