import type {
  CandidatePage,
  CrawlContextLike,
  SourceAdapter,
  SourceDefinition,
} from '../types';
import { extractDocumentsFromHtml, harvestCandidateLinks } from './html';

export class StaticSlugAdapter implements SourceAdapter {
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

    const selector = this.source.discovery.productLinkSelector;
    if (!selector) return;
    for (const seed of this.source.discovery.seeds) {
      const html = await ctx.fetchText(seed);
      for (const product of harvestCandidateLinks(
        this.source,
        seed,
        html,
        selector,
        ctx,
      )) {
        const template = this.source.discovery.supportUrlTemplate;
        const productSlug = new URL(product.url).pathname
          .split('/')
          .filter(Boolean)
          .at(-1);
        if (!template || !productSlug) continue;
        const suffixes =
          this.source.normalization?.suffixExpansion?.[productSlug] ?? [''];
        for (const suffix of suffixes) {
          const slug = `${productSlug}${suffix}`;
          const url = template.replace('{slug}', slug);
          if (seen.has(url) || !ctx.isAllowedUrl(url)) continue;
          seen.add(url);
          yield {
            sourceId: this.id,
            url,
            modelHint: suffix ? `${product.modelHint}${suffix}` : product.modelHint,
          };
        }
      }
    }
  }

  async extract(page: CandidatePage, html: string, ctx: CrawlContextLike) {
    return extractDocumentsFromHtml(this.source, page, html, ctx);
  }
}
