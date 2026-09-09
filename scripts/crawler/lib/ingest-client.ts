import type { ManualIngestPayload } from '../../../lib/manual-ingest';

export interface DraftSink {
  write(payload: ManualIngestPayload): Promise<void>;
  readState(sourceId: string): Promise<Map<string, ExistingDocumentState>>;
}

export type ExistingDocumentState = {
  canonicalUrl: string;
  etag?: string;
  lastModified?: string;
  sha256?: string;
  byteSize?: number;
  status: string;
};

export class RemoteDraftSink implements DraftSink {
  constructor(
    private readonly endpoint: string,
    private readonly token: string,
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async write(payload: ManualIngestPayload) {
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'SynthCoachCrawlerIngest/1.0',
      },
      body: JSON.stringify(payload),
      redirect: 'error',
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1000);
      throw new Error(`draft ingest failed (${response.status}): ${detail}`);
    }
  }

  async readState(sourceId: string) {
    const url = new URL(this.endpoint);
    url.searchParams.set('source', sourceId);
    const response = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        'User-Agent': 'SynthCoachCrawlerIngest/1.0',
      },
      redirect: 'error',
    });
    if (!response.ok) {
      throw new Error(`failed to read crawl state (${response.status})`);
    }
    const payload = (await response.json()) as {
      documents: ExistingDocumentState[];
    };
    return new Map(
      payload.documents.map((document) => [document.canonicalUrl, document]),
    );
  }
}

export function draftSinkFromEnv(): DraftSink {
  const endpoint = process.env.CRAWLER_INGEST_URL;
  const token = process.env.CRAWLER_INGEST_TOKEN;
  if (!endpoint || !token) {
    throw new Error(
      'CRAWLER_INGEST_URL과 CRAWLER_INGEST_TOKEN이 필요합니다. 쓰기 없이 확인하려면 --dry-run을 사용하세요.',
    );
  }
  if (!endpoint.startsWith('https://')) {
    throw new Error('CRAWLER_INGEST_URL은 HTTPS여야 합니다.');
  }
  return new RemoteDraftSink(endpoint, token);
}
