import type {
  CandidatePage,
  CrawlContextLike,
  SourceAdapter,
  SourceDefinition,
} from '../types';
import { extractDocumentsFromHtml, harvestCandidateLinks } from './html';

/** Two-stage category/search discovery; it never submits credentials or forms. */
export class SearchFormAdapter implements SourceAdapter {
  readonly id: string;

  constructor(readonly source: SourceDefinition) {
    this.id = source.id;
  }

  async *discover(ctx: CrawlContextLike): AsyncGenerator<CandidatePage> {
    const seen = new Set<string>();
    for (const model of this.source.models) {
      const url =
        model.supportUrl ||
        (this.source.discovery.searchUrlTemplate
          ? this.source.discovery.searchUrlTemplate.replace(
              '{query}',
              encodeURIComponent(model.canonicalName),
            )
          : undefined);
      if (!url || seen.has(url) || !ctx.isAllowedUrl(url)) continue;
      seen.add(url);
      yield {
        sourceId: this.id,
        url,
        modelHint: model.canonicalName,
      };
    }

    const selector = this.source.discovery.productLinkSelector;
    if (!selector) return;
    for (const seed of this.source.discovery.seeds) {
      const body = await ctx.fetchText(seed);
      for (const candidate of harvestCandidateLinks(
        this.source,
        seed,
        body,
        selector,
        ctx,
      )) {
        if (seen.has(candidate.url)) continue;
        seen.add(candidate.url);
        yield candidate;
      }
    }
  }

  async extract(page: CandidatePage, html: string, ctx: CrawlContextLike) {
    const documents = extractDocumentsFromHtml(this.source, page, html, ctx);
    if (this.source.id !== 'yamaha') return documents;
    return documents.map((document) => {
      const filename = new URL(document.url).pathname.split('/').at(-1) ?? '';
      const parsed = parseYamahaFilename(filename);
      if (!parsed.parsed) {
        return {
          ...document,
          reviewHints: [
            ...(document.reviewHints ?? []),
            'yamaha_filename_unparsed',
          ],
        };
      }
      const typeByCode: Record<string, string> = {
        om: 'owners_manual',
        operation_manual: 'owners_manual',
        rm: 'reference_manual',
        dg: 'data_list',
        dl: 'data_list',
        midi: 'midi_chart',
        sm: 'supplementary',
      };
      return {
        ...document,
        modelHints: parsed.model
          ? [parsed.model, ...document.modelHints]
          : document.modelHints,
        docTypeHint: parsed.documentCode
          ? typeByCode[parsed.documentCode]
          : document.docTypeHint,
        languageHint: parsed.language ?? document.languageHint,
        versionHint: parsed.revision ?? document.versionHint,
      };
    });
  }
}

export type YamahaFilename = {
  model?: string;
  documentCode?: string;
  language?: string;
  revision?: string;
  parsed: boolean;
};

/** Observational parser: a miss is review work, never a guessed association. */
export function parseYamahaFilename(filename: string): YamahaFilename {
  const stem = decodeURIComponent(filename).replace(/\.pdf$/i, '');
  const match = stem.match(
    /^([A-Z0-9-]+)[_-](om|rm|dg|dl|sm|midi|operation[_-]manual)(?:[_-](en|ja|jp|ko|de|fr|es))?(?:[_-]([a-z]\d+))?$/i,
  );
  if (!match) return { parsed: false };
  return {
    model: match[1],
    documentCode: match[2].toLowerCase().replace(/-/g, '_'),
    language: match[3]?.toLowerCase().replace('jp', 'ja'),
    revision: match[4]?.toLowerCase(),
    parsed: true,
  };
}
