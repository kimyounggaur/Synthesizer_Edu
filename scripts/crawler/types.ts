export const PIPELINE_STAGES = [
  'seed',
  'discover',
  'extract',
  'normalize',
  'fetch',
  'validate',
  'derive',
  'publish',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type SourceArchetype = 'A' | 'B' | 'C' | 'D' | 'E' | 'X';
export type SourceStatus = 'active' | 'blocked' | 'suspended' | 'excluded';
export type Region = 'asia' | 'europe' | 'north-america';

export type ModelSeed = {
  id: string;
  appModelId?: string;
  canonicalName: string;
  family?: string;
  suffix?: string;
  aliases: string[];
  productUrl?: string;
  supportUrl?: string;
  category?: string;
  discontinued?: boolean;
};

export type SourceDefinition = {
  id: string;
  displayName: string;
  archetype: SourceArchetype;
  status: SourceStatus;
  region: Region;
  hosts: {
    base: string[];
    assets: string[];
    excluded?: string[];
  };
  locale?: {
    canonical?: string;
    variants?: string[];
  };
  policy: {
    rateLimitMs: number;
    pdfRateLimitMs?: number;
    crawlBudget: number;
    timezone: string;
    preferredWindow: string;
  };
  discovery: {
    strategy: string;
    seeds: string[];
    productLinkSelector?: string;
    downloadLinkSelector?: string;
    supportUrlTemplate?: string;
    searchUrlTemplate?: string;
    jsonEndpoints?: string[];
  };
  extraction: {
    documentLinkSelector: string;
    titleSelector?: string;
    languageAttr?: string;
    dateSelector?: string;
  };
  normalization?: {
    localeReplacements?: Record<string, string>;
    suffixExpansion?: Record<string, string[]>;
    versionPattern?: string;
  };
  models: ModelSeed[];
  healthCheck?: {
    url: string;
    minDocuments: number;
  };
  evidenceUrls: string[];
  verifiedAt?: string;
  verifiedBy?: string;
  notes?: string;
};

export type CandidatePage = {
  url: string;
  sourceId: string;
  modelHint?: string;
  metadata?: Record<string, string>;
};

export type RawDocument = {
  sourceId: string;
  sourcePageUrl: string;
  url: string;
  title: string;
  modelHints: string[];
  docTypeHint?: string;
  languageHint?: string;
  languageText?: string;
  versionHint?: string;
  publishedAt?: string;
  mimeTypeHint?: string;
  reviewHints?: string[];
};

export const DOCUMENT_TYPES = [
  'owners_manual',
  'reference_manual',
  'parameter_guide',
  'data_list',
  'quick_start',
  'supplementary',
  'midi_chart',
  'safety',
  'unknown',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export type ModelMatch = {
  modelIds: string[];
  primaryModelId?: string;
  suffixAmbiguous: boolean;
  certainty: 'exact' | 'alias' | 'family' | 'none';
};

export type NormalizedDocument = RawDocument & {
  id: string;
  canonicalUrl: string;
  originalUrls: string[];
  modelMatch: ModelMatch;
  docType: DocumentType;
  language: string;
  version?: string;
  mimeType: 'application/pdf' | 'text/html';
  needsReview: boolean;
  reviewReasons: string[];
};

export type FetchMetadata = {
  status: number;
  etag?: string;
  lastModified?: string;
  contentType?: string;
  contentLength?: number;
  finalUrl: string;
};

export type ValidationResult = {
  valid: boolean;
  checks: Record<string, boolean>;
  errors: string[];
  sha256?: string;
  byteSize: number;
  pageCount?: number;
  textLayer: boolean;
  outline: OutlineItem[];
  /** In-memory only and discarded after language/control derivation. */
  textSample?: string;
  controlCandidates: string[];
};

export type OutlineItem = {
  id: string;
  depth: number;
  order: number;
  heading: string;
  pageStart?: number;
  sectionKind?: SectionKind;
};

export type SectionKind =
  | 'panel_description'
  | 'operation'
  | 'troubleshooting'
  | 'spec'
  | 'appendix';

export type CrawlError = {
  code: string;
  message: string;
  url?: string;
  status?: number;
};

export type RunMetrics = {
  id: string;
  sourceId: string;
  startedAt: Date;
  finishedAt?: Date;
  requestCount: number;
  bytesFetched: number;
  averageResponseMs: number;
  http4xx: number;
  docsFound: number;
  docsNew: number;
  docsChanged: number;
  docsDead: number;
  needsReview: number;
  errors: CrawlError[];
  outcome: 'ok' | 'partial' | 'failed' | 'blocked';
};

export type CrawlRequestOptions = {
  resource?: 'html' | 'pdf' | 'json';
  etag?: string;
  lastModified?: string;
  accept?: string;
};

export interface SourceAdapter {
  readonly id: string;
  readonly source: SourceDefinition;
  discover(ctx: CrawlContextLike): AsyncGenerator<CandidatePage>;
  extract(
    page: CandidatePage,
    body: string,
    ctx: CrawlContextLike,
  ): Promise<RawDocument[]>;
}

export interface CrawlContextLike {
  fetch(url: string, options?: CrawlRequestOptions): Promise<Response>;
  fetchText(url: string, options?: CrawlRequestOptions): Promise<string>;
  fetchJson<T>(url: string, options?: CrawlRequestOptions): Promise<T>;
  isAllowedUrl(url: string): boolean;
}

export type CrawlCliOptions = {
  all: boolean;
  source?: string;
  region?: Region;
  model?: string;
  until: PipelineStage;
  dryRun: boolean;
  force: boolean;
};
