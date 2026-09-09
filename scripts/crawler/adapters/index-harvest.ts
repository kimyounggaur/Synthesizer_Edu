import type {
  CandidatePage,
  CrawlContextLike,
  SourceAdapter,
  SourceDefinition,
} from '../types';
import { extractDocumentsFromHtml, harvestCandidateLinks } from './html';

/**
 * Harvests only links that the official index actually exposes. It never
 * increments or guesses numeric document/product ids.
 */
export class IndexHarvestAdapter implements SourceAdapter {
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
    const selector =
      this.source.discovery.downloadLinkSelector ??
      this.source.discovery.productLinkSelector;
    if (!selector) return;
    for (const seed of this.source.discovery.seeds) {
      const html = await ctx.fetchText(seed);
      for (const candidate of harvestCandidateLinks(
        this.source,
        seed,
        html,
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
    return extractDocumentsFromHtml(this.source, page, html, ctx);
  }
}
