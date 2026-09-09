import * as cheerio from 'cheerio';
import type {
  CandidatePage,
  CrawlContextLike,
  RawDocument,
  SourceAdapter,
  SourceDefinition,
} from '../types';
import { extractDocumentsFromHtml } from './html';

type JsonRecord = Record<string, unknown>;

const asString = (value: unknown) => (typeof value === 'string' ? value : '');

function walkJson(value: unknown, output: JsonRecord[]) {
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, output);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as JsonRecord;
  const candidateUrl = ['url', 'href', 'downloadUrl', 'download_url', 'file'].find(
    (key) => typeof record[key] === 'string',
  );
  if (candidateUrl && /\.pdf(?:$|\?)/i.test(String(record[candidateUrl]))) {
    output.push(record);
  }
  for (const child of Object.values(record)) walkJson(child, output);
}

export class JsonApiAdapter implements SourceAdapter {
  readonly id: string;

  constructor(readonly source: SourceDefinition) {
    this.id = source.id;
  }

  async *discover(ctx: CrawlContextLike): AsyncGenerator<CandidatePage> {
    const seen = new Set<string>();
    for (const model of this.source.models) {
      if (!model.supportUrl || seen.has(model.supportUrl)) continue;
      seen.add(model.supportUrl);
      yield {
        sourceId: this.id,
        url: model.supportUrl,
        modelHint: model.canonicalName,
      };
    }
    for (const url of this.source.discovery.jsonEndpoints ?? []) {
      if (seen.has(url) || !ctx.isAllowedUrl(url)) continue;
      seen.add(url);
      yield { sourceId: this.id, url, metadata: { format: 'json' } };
    }
  }

  async extract(page: CandidatePage, body: string, ctx: CrawlContextLike) {
    const records: JsonRecord[] = [];
    if (page.metadata?.format === 'json') {
      try {
        walkJson(JSON.parse(body), records);
      } catch {
        return [];
      }
    } else {
      const $ = cheerio.load(body);
      $('script[type="application/ld+json"], script[type="application/json"], script#__NEXT_DATA__').each(
        (_, element) => {
          try {
            walkJson(JSON.parse($(element).text()), records);
          } catch {
            // A malformed inline script is ignored; HTML links remain available.
          }
        },
      );
    }
    const jsonDocuments: RawDocument[] = [];
    for (const record of records) {
      const rawUrl =
        record.url ?? record.href ?? record.downloadUrl ?? record.download_url ?? record.file;
      if (typeof rawUrl !== 'string') continue;
      const url = new URL(rawUrl, page.url).href;
      if (!ctx.isAllowedUrl(url)) continue;
      const title =
        asString(record.title) || asString(record.name) || asString(record.label) || url;
      const model =
        asString(record.product) || asString(record.model) || page.modelHint || '';
      jsonDocuments.push({
        sourceId: this.id,
        sourcePageUrl: page.url,
        url,
        title,
        modelHints: model ? [model] : [],
        languageHint:
          typeof record.language === 'string' ? record.language : undefined,
        versionHint:
          typeof record.version === 'string' ? record.version : undefined,
        mimeTypeHint: 'application/pdf',
      });
    }
    return [
      ...jsonDocuments,
      ...extractDocumentsFromHtml(this.source, page, body, ctx),
    ];
  }
}
