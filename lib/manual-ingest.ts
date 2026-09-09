export const CRAWLER_MUTABLE_STATUSES = [
  'draft',
  'stale',
  'dead',
  'invalid',
] as const;

export type CrawlerMutableStatus = (typeof CRAWLER_MUTABLE_STATUSES)[number];

export type ManualIngestOutline = {
  id: string;
  depth: number;
  order: number;
  heading: string;
  pageStart?: number;
  sectionKind?: string;
};

export type ManualIngestDocument = {
  id: string;
  primaryModelId: string;
  modelIds: string[];
  suffixAmbiguous: boolean;
  docType: string;
  language: string;
  title: string;
  version?: string;
  publishedAt?: string;
  canonicalUrl: string;
  mirrorUrls: string[];
  mimeType: 'application/pdf' | 'text/html';
  byteSize?: number;
  sha256?: string;
  pageCount?: number;
  status: CrawlerMutableStatus;
  etag?: string;
  lastModified?: string;
  outline: ManualIngestOutline[];
  controlCandidates: string[];
};

export type ManualIngestPayload = {
  actor: 'crawler';
  source: {
    id: string;
    displayName: string;
    archetype: string;
    baseHosts: string[];
    assetHosts: string[];
    status: string;
    rateLimitMs: number;
    crawlBudget: number;
    notes?: string;
  };
  models: Array<{
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
  }>;
  documents: ManualIngestDocument[];
  issues: Array<{
    id: string;
    documentId?: string;
    url?: string;
    reasons: string[];
  }>;
  robots: Array<{
    host: string;
    checkedAt: string;
    statusCode: number;
    allowsRoot: boolean;
  }>;
  notModifiedUrls: string[];
  run: {
    id: string;
    startedAt: string;
    finishedAt: string;
    requestCount: number;
    bytesFetched: number;
    docsFound: number;
    docsNew: number;
    docsChanged: number;
    errors: Array<{
      code: string;
      message: string;
      url?: string;
      status?: number;
    }>;
    outcome: string;
  };
};

/** The crawler identity can never request a human-owned publication state. */
export function assertNotCrawler(actor: string, nextStatus: string) {
  if (
    actor === 'crawler' &&
    !CRAWLER_MUTABLE_STATUSES.includes(nextStatus as CrawlerMutableStatus)
  ) {
    throw new Error(`crawler actor cannot set status '${nextStatus}'`);
  }
}

export function validateIngestPayload(value: unknown): string[] {
  if (!value || typeof value !== 'object') return ['payload must be an object'];
  const input = value as Partial<ManualIngestPayload>;
  const errors: string[] = [];
  if (input.actor !== 'crawler') errors.push('actor must be crawler');
  if (!input.source?.id || !/^[a-z][a-z0-9-]*$/.test(input.source.id)) {
    errors.push('source.id is invalid');
  }
  if (!Array.isArray(input.models)) errors.push('models must be an array');
  if (!Array.isArray(input.documents)) errors.push('documents must be an array');
  if (!Array.isArray(input.issues)) errors.push('issues must be an array');
  if (!Array.isArray(input.robots)) errors.push('robots must be an array');
  if (!Array.isArray(input.notModifiedUrls)) {
    errors.push('notModifiedUrls must be an array');
  }
  if (!input.run?.id || !input.run.finishedAt) errors.push('run is incomplete');
  for (const document of input.documents ?? []) {
    try {
      assertNotCrawler('crawler', document.status);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    if (!document.id || !document.primaryModelId) errors.push('document identity is incomplete');
    if (!Array.isArray(document.modelIds) || !document.modelIds.length) {
      errors.push(`${document.id}: modelIds is empty`);
    }
    if (!document.canonicalUrl.startsWith('https://')) {
      errors.push(`${document.id}: canonicalUrl must use HTTPS`);
    }
    if (document.status === 'draft') {
      if (!document.sha256) errors.push(`${document.id}: draft requires sha256`);
      if (document.docType === 'unknown') errors.push(`${document.id}: draft docType is unknown`);
      if (document.language === 'und') errors.push(`${document.id}: draft language is und`);
    }
    if (document.outline.some((item) => item.heading.length > 500)) {
      errors.push(`${document.id}: outline heading is too long`);
    }
    if (!Array.isArray(document.controlCandidates)) {
      errors.push(`${document.id}: controlCandidates must be an array`);
    }
  }
  return [...new Set(errors)];
}
