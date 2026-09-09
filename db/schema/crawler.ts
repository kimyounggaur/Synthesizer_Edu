import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export type CrawlErrorRecord = {
  code: string;
  message: string;
  url?: string;
  status?: number;
};

/** One row for every allowlisted manufacturer source definition. */
export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  archetype: text('archetype').notNull(),
  baseHosts: text('base_hosts', { mode: 'json' }).$type<string[]>().notNull(),
  assetHosts: text('asset_hosts', { mode: 'json' })
    .$type<string[]>()
    .notNull(),
  status: text('status').notNull().default('active'),
  robotsCheckedAt: integer('robots_checked_at', { mode: 'timestamp' }),
  robotsAllows: integer('robots_allows', { mode: 'boolean' }),
  rateLimitMs: integer('rate_limit_ms').notNull().default(2000),
  crawlBudget: integer('crawl_budget').notNull().default(200),
  lastRunAt: integer('last_run_at', { mode: 'timestamp' }),
  notes: text('notes'),
});

/** A concrete, suffix-aware instrument model. */
export const manualModels = sqliteTable(
  'models',
  {
    id: text('id').primaryKey(),
    appModelId: text('app_model_id'),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    canonicalName: text('canonical_name').notNull(),
    family: text('family'),
    suffix: text('suffix'),
    aliases: text('aliases', { mode: 'json' }).$type<string[]>().notNull(),
    productUrl: text('product_url'),
    supportUrl: text('support_url'),
    category: text('category'),
    discontinued: integer('discontinued', { mode: 'boolean' }).default(false),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('models_app_id_uniq').on(table.appModelId),
    index('models_source_idx').on(table.sourceId),
    index('models_name_idx').on(table.canonicalName),
  ],
);

/** L1 bibliography only. Original manual bytes never enter D1. */
export const manualDocuments = sqliteTable(
  'manual_documents',
  {
    id: text('id').primaryKey(),
    modelId: text('model_id')
      .notNull()
      .references(() => manualModels.id),
    docType: text('doc_type').notNull(),
    language: text('language').notNull(),
    title: text('title').notNull(),
    version: text('version'),
    publishedAt: integer('published_at', { mode: 'timestamp' }),
    canonicalUrl: text('canonical_url').notNull(),
    mirrorUrls: text('mirror_urls', { mode: 'json' }).$type<string[]>(),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size'),
    sha256: text('sha256'),
    pageCount: integer('page_count'),
    status: text('status').notNull().default('draft'),
    httpEtag: text('http_etag'),
    httpLastMod: text('http_last_modified'),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp' }).notNull(),
    lastCheckedAt: integer('last_checked_at', { mode: 'timestamp' }).notNull(),
    lastChangedAt: integer('last_changed_at', { mode: 'timestamp' }),
    deadSince: integer('dead_since', { mode: 'timestamp' }),
  },
  (table) => [
    uniqueIndex('docs_url_uniq').on(table.canonicalUrl),
    index('docs_model_idx').on(table.modelId),
    index('docs_status_idx').on(table.status),
  ],
);

/**
 * A shared family manual can cover several concrete models. The design prose
 * requires that relationship without duplicating the document, so this join
 * table complements the single primary model_id from the reference schema.
 */
export const manualDocumentModels = sqliteTable(
  'manual_document_models',
  {
    documentId: text('document_id')
      .notNull()
      .references(() => manualDocuments.id),
    modelId: text('model_id')
      .notNull()
      .references(() => manualModels.id),
    suffixAmbiguous: integer('suffix_ambiguous', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  (table) => [
    primaryKey({ columns: [table.documentId, table.modelId] }),
    index('document_models_model_idx').on(table.modelId),
  ],
);

/** L3 headings and page anchors only; never extracted body text. */
export const manualOutline = sqliteTable(
  'manual_outline',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => manualDocuments.id),
    depth: integer('depth').notNull(),
    order: integer('order').notNull(),
    heading: text('heading').notNull(),
    pageStart: integer('page_start'),
    sectionKind: text('section_kind'),
  },
  (table) => [
    uniqueIndex('outline_document_order_uniq').on(
      table.documentId,
      table.order,
    ),
    index('outline_document_idx').on(table.documentId),
  ],
);

/** Auditable execution and drift metrics. */
export const crawlRuns = sqliteTable(
  'crawl_runs',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id').notNull(),
    startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp' }),
    requestCount: integer('request_count').notNull().default(0),
    bytesFetched: integer('bytes_fetched').notNull().default(0),
    docsFound: integer('docs_found').notNull().default(0),
    docsNew: integer('docs_new').notNull().default(0),
    docsChanged: integer('docs_changed').notNull().default(0),
    errors: text('errors', { mode: 'json' }).$type<CrawlErrorRecord[]>(),
    outcome: text('outcome').notNull(),
  },
  (table) => [
    index('crawl_runs_source_started_idx').on(
      table.sourceId,
      table.startedAt,
    ),
  ],
);

/** L3 control-name candidates. No surrounding copyrighted body text is kept. */
export const manualControlCandidates = sqliteTable(
  'manual_control_candidates',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => manualDocuments.id),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    reviewStatus: text('review_status').notNull().default('candidate'),
  },
  (table) => [
    uniqueIndex('control_candidate_document_name_uniq').on(
      table.documentId,
      table.normalizedName,
    ),
    index('control_candidate_review_idx').on(table.reviewStatus),
  ],
);

/** Internal review queue for records that fail any automatic draft gate. */
export const crawlIssues = sqliteTable(
  'crawl_issues',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    documentId: text('document_id'),
    url: text('url'),
    reasons: text('reasons', { mode: 'json' }).$type<string[]>().notNull(),
    status: text('status').notNull().default('open'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  },
  (table) => [index('crawl_issues_status_idx').on(table.status, table.sourceId)],
);

/** robots status is host-scoped because one source can use several asset hosts. */
export const sourceRobotsChecks = sqliteTable(
  'source_robots_checks',
  {
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    host: text('host').notNull(),
    checkedAt: integer('checked_at', { mode: 'timestamp' }).notNull(),
    statusCode: integer('status_code').notNull(),
    allowsRoot: integer('allows_root', { mode: 'boolean' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.sourceId, table.host] })],
);

/** Reverse index used to flag published learning content after a manual changes. */
export const contentSources = sqliteTable(
  'content_sources',
  {
    contentId: text('content_id').notNull(),
    documentId: text('document_id')
      .notNull()
      .references(() => manualDocuments.id),
    page: integer('page'),
  },
  (table) => [
    primaryKey({ columns: [table.contentId, table.documentId] }),
    index('content_sources_document_idx').on(table.documentId),
  ],
);
