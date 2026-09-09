import * as cheerio from 'cheerio';
import type {
  CandidatePage,
  CrawlContextLike,
  RawDocument,
  SourceDefinition,
} from '../types';

export function resolveAllowedLink(
  href: string | undefined,
  baseUrl: string,
  ctx: CrawlContextLike,
): string | undefined {
  if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) {
    return undefined;
  }
  try {
    const url = new URL(href, baseUrl).href;
    return ctx.isAllowedUrl(url) ? url : undefined;
  } catch {
    return undefined;
  }
}

export function inferModelHint(url: string, text = ''): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  const ignored = new Set([
    'support',
    'download',
    'downloads',
    'manual',
    'manuals',
    'owners_manuals',
    'product',
    'products',
  ]);
  const slug = [...segments]
    .reverse()
    .find((segment) => !ignored.has(segment.toLowerCase()) && !/^\d+$/.test(segment));
  return text.trim() || decodeURIComponent(slug ?? '');
}

export function extractDocumentsFromHtml(
  source: SourceDefinition,
  page: CandidatePage,
  html: string,
  ctx: CrawlContextLike,
): RawDocument[] {
  const $ = cheerio.load(html);
  const documents: RawDocument[] = [];
  $(source.extraction.documentLinkSelector).each((_, element) => {
    const anchor = $(element);
    const url = resolveAllowedLink(anchor.attr('href'), page.url, ctx);
    if (!url) return;
    const title =
      anchor.attr('title')?.trim() ||
      anchor.text().replace(/\s+/g, ' ').trim() ||
      decodeURIComponent(new URL(url).pathname.split('/').at(-1) ?? url);
    const languageAttr = source.extraction.languageAttr;
    const languageHint =
      (languageAttr ? anchor.attr(languageAttr) : undefined) ||
      anchor.attr('hreflang') ||
      anchor.attr('lang') ||
      undefined;
    const parentText = anchor.parent().text().replace(/\s+/g, ' ').trim();
    const dateMatch = parentText.match(/\b(20\d{2}[./-]\d{1,2}[./-]\d{1,2})\b/);
    documents.push({
      sourceId: source.id,
      sourcePageUrl: page.url,
      url,
      title,
      modelHints: [page.modelHint, page.metadata?.model, inferModelHint(page.url)]
        .filter((value): value is string => Boolean(value)),
      docTypeHint: anchor.attr('data-document-type') || undefined,
      languageHint,
      languageText: `${anchor.text()} ${parentText}`,
      publishedAt: dateMatch?.[1]?.replace(/[./]/g, '-'),
      mimeTypeHint: url.toLowerCase().includes('.pdf')
        ? 'application/pdf'
        : undefined,
    });
  });
  return documents;
}

export function harvestCandidateLinks(
  source: SourceDefinition,
  seedUrl: string,
  html: string,
  selector: string,
  ctx: CrawlContextLike,
): CandidatePage[] {
  const $ = cheerio.load(html);
  const candidates: CandidatePage[] = [];
  $(selector).each((_, element) => {
    const anchor = $(element);
    const url = resolveAllowedLink(anchor.attr('href'), seedUrl, ctx);
    if (!url) return;
    const text = anchor.text().replace(/\s+/g, ' ').trim();
    candidates.push({
      sourceId: source.id,
      url,
      modelHint: inferModelHint(url, text),
    });
  });
  return candidates;
}
