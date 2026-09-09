import { assertAllowedUrl } from './allowlist';
import { sha1 } from './hash';
import { franc } from 'franc-min';
import type {
  DocumentType,
  ModelMatch,
  ModelSeed,
  NormalizedDocument,
  RawDocument,
  SourceDefinition,
} from '../types';

const TRACKING_PARAMETERS = new Set([
  'gclid',
  'fbclid',
  'ref',
  'country',
  'session',
  'sessionid',
]);

const LANGUAGE_CODES: Record<string, string> = {
  en: 'en',
  eng: 'en',
  english: 'en',
  ja: 'ja',
  jp: 'ja',
  jpn: 'ja',
  japanese: 'ja',
  日本語: 'ja',
  ko: 'ko',
  kr: 'ko',
  kor: 'ko',
  korean: 'ko',
  한국어: 'ko',
  de: 'de',
  deu: 'de',
  german: 'de',
  deutsch: 'de',
  fr: 'fr',
  fra: 'fr',
  french: 'fr',
  français: 'fr',
  es: 'es',
  spanish: 'es',
  español: 'es',
  it: 'it',
  italian: 'it',
  zh: 'zh',
  cn: 'zh-Hans',
  'zh-cn': 'zh-Hans',
  'zh-tw': 'zh-Hant',
};

const DOC_TYPE_RULES: Array<[DocumentType, RegExp]> = [
  ['owners_manual', /owner(?:'s|s)?\s*manual|user\s*manual|取扱説明書|사용자\s*설명서/i],
  ['reference_manual', /reference\s*manual|reference\s*guide|참조\s*설명서/i],
  ['parameter_guide', /parameter\s*(?:guide|manual)|parameter\s*list/i],
  ['data_list', /data\s*list|voice\s*list|sound\s*list|tone\s*list/i],
  ['quick_start', /quick\s*start|getting\s*started|startup\s*guide/i],
  ['midi_chart', /midi\s*(?:implementation|chart)/i],
  ['safety', /safety|precaution|important\s*notes/i],
  ['supplementary', /supplement|addendum|update|guide/i],
];

const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function canonicalizeUrl(
  input: string,
  source: SourceDefinition,
): string {
  const parsed = new URL(input);
  parsed.protocol = 'https:';
  parsed.hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  parsed.hash = '';

  const replacements = source.normalization?.localeReplacements ?? {};
  let pathname = parsed.pathname;
  for (const [from, to] of Object.entries(replacements)) {
    const fromSegment = `/${from.replace(/^\/+|\/+$/g, '')}/`;
    const toSegment = `/${to.replace(/^\/+|\/+$/g, '')}/`;
    pathname = pathname.replace(fromSegment, toSegment);
  }
  const segments = pathname.split('/').filter(Boolean);
  const filtered = segments.filter((segment, index) => {
    if (!UUID_SEGMENT.test(segment)) return true;
    return index === segments.length - 1 && segments.length === 1;
  });
  pathname = '/' + filtered.join('/');

  for (const name of parsed.searchParams.keys()) {
    const lower = name.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_PARAMETERS.has(lower)) {
      parsed.searchParams.delete(name);
    }
  }
  parsed.searchParams.sort();

  const last = filtered.at(-1) ?? '';
  const looksLikeFile = /\.[a-z0-9]{1,8}$/i.test(last);
  if (looksLikeFile) pathname = pathname.replace(/\/+$/, '');
  else if (!pathname.endsWith('/')) pathname += '/';
  parsed.pathname = pathname.replace(/%[0-9a-f]{2}/g, (part) =>
    part.toUpperCase(),
  );

  const canonical = parsed.toString();
  assertAllowedUrl(canonical, source);
  return canonical;
}

export function normalizeModelName(raw: string): string {
  return raw
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[‐‑‒–—−_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^(.+?)-(\d{1,3})$/, '$1$2')
    .replace(/^-|-$/g, '')
    .trim();
}

function normalizedCandidates(model: ModelSeed) {
  return [model.canonicalName, ...model.aliases].map(normalizeModelName);
}

export function matchModels(
  hints: string[],
  models: ModelSeed[],
): ModelMatch {
  const normalizedHints = hints
    .map(normalizeModelName)
    .filter((value, index, all) => value && all.indexOf(value) === index);

  for (const hint of normalizedHints) {
    const exact = models.find(
      (model) => normalizeModelName(model.canonicalName) === hint,
    );
    if (exact) {
      return {
        modelIds: [exact.id],
        primaryModelId: exact.id,
        suffixAmbiguous: false,
        certainty: 'exact',
      };
    }
  }
  for (const hint of normalizedHints) {
    const alias = models.find((model) =>
      normalizedCandidates(model).slice(1).includes(hint),
    );
    if (alias) {
      return {
        modelIds: [alias.id],
        primaryModelId: alias.id,
        suffixAmbiguous: false,
        certainty: 'alias',
      };
    }
  }

  for (const hint of normalizedHints) {
    const matches = models.filter(
      (model) => model.family && normalizeModelName(model.family) === hint,
    );
    if (matches.length) {
      return {
        modelIds: matches.map((model) => model.id),
        primaryModelId: matches[0].id,
        suffixAmbiguous: true,
        certainty: 'family',
      };
    }
  }

  return {
    modelIds: [],
    suffixAmbiguous: false,
    certainty: 'none',
  };
}

function normalizeLanguageToken(value?: string): string | undefined {
  if (!value) return undefined;
  const clean = value.trim().toLowerCase().replace(/_/g, '-');
  if (LANGUAGE_CODES[clean]) return LANGUAGE_CODES[clean];
  const base = clean.split('-')[0];
  if (LANGUAGE_CODES[base]) return LANGUAGE_CODES[base];
  return undefined;
}

export function detectLanguage(raw: RawDocument): string {
  const explicit = normalizeLanguageToken(raw.languageHint);
  if (explicit) return explicit;

  const filename = decodeURIComponent(new URL(raw.url).pathname.split('/').at(-1) ?? '');
  const filenameMatch = filename.match(
    /(?:^|[_\-.])(en|eng|ja|jp|jpn|ko|kr|de|fr|es|it|zh-cn|zh-tw)(?:[_\-.]|$)/i,
  );
  const fromFilename = normalizeLanguageToken(filenameMatch?.[1]);
  if (fromFilename) return fromFilename;

  const linkText = `${raw.languageText ?? ''} ${raw.title}`.toLowerCase();
  for (const [token, language] of Object.entries(LANGUAGE_CODES)) {
    if (token.length > 2 && linkText.includes(token)) return language;
  }

  const pathSegments = new URL(raw.url).pathname.split('/');
  for (const segment of pathSegments) {
    const language = normalizeLanguageToken(segment);
    if (language) return language;
  }
  return 'und';
}

const FRANC_TO_BCP47: Record<string, string> = {
  eng: 'en',
  jpn: 'ja',
  kor: 'ko',
  deu: 'de',
  fra: 'fr',
  spa: 'es',
  ita: 'it',
  cmn: 'zh-Hans',
};

export function detectLanguageFromText(text: string): string {
  if (text.trim().length < 50) return 'und';
  return FRANC_TO_BCP47[franc(text, { minLength: 50 })] ?? 'und';
}

export function normalizeDocType(raw: RawDocument): DocumentType {
  const text = `${raw.docTypeHint ?? ''} ${raw.title} ${raw.url}`;
  for (const [type, pattern] of DOC_TYPE_RULES) {
    if (pattern.test(text)) return type;
  }
  return 'unknown';
}

export function normalizeVersion(raw: RawDocument): string | undefined {
  if (raw.versionHint?.trim()) return raw.versionHint.trim().replace(/^rev[:.\s]*/i, '');
  const filename = decodeURIComponent(new URL(raw.url).pathname.split('/').at(-1) ?? '');
  const semantic = filename.match(/(?:manual|guide)[_-](\d+[_\-.]\d+(?:[_\-.]\d+)?)/i);
  if (semantic) return semantic[1].replace(/[_-]/g, '.');
  const revision = filename.match(/[_-]([a-z]\d{1,3})(?:[_\-.]|$)/i);
  return revision?.[1]?.toLowerCase();
}

export function normalizeDocument(
  raw: RawDocument,
  source: SourceDefinition,
): NormalizedDocument {
  const canonicalUrl = canonicalizeUrl(raw.url, source);
  const modelMatch = matchModels(raw.modelHints, source.models);
  const docType = normalizeDocType(raw);
  const language = detectLanguage(raw);
  const reviewReasons: string[] = [...(raw.reviewHints ?? [])];
  if (modelMatch.certainty === 'none') reviewReasons.push('model_unmatched');
  if (modelMatch.suffixAmbiguous) reviewReasons.push('suffix_ambiguous');
  if (docType === 'unknown') reviewReasons.push('unknown_doc_type');
  if (language === 'und') reviewReasons.push('language_undetermined');

  const path = new URL(canonicalUrl).pathname.toLowerCase();
  const mimeType =
    raw.mimeTypeHint?.toLowerCase().includes('pdf') || path.endsWith('.pdf')
      ? 'application/pdf'
      : 'text/html';

  return {
    ...raw,
    id: sha1(canonicalUrl),
    canonicalUrl,
    originalUrls: raw.url === canonicalUrl ? [] : [raw.url],
    modelMatch,
    docType,
    language,
    version: normalizeVersion(raw),
    mimeType,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

export function dedupeByCanonicalUrl(
  documents: NormalizedDocument[],
): NormalizedDocument[] {
  const byUrl = new Map<string, NormalizedDocument>();
  for (const document of documents) {
    const existing = byUrl.get(document.canonicalUrl);
    if (!existing) {
      byUrl.set(document.canonicalUrl, document);
      continue;
    }
    existing.originalUrls = [...new Set([
      ...existing.originalUrls,
      ...document.originalUrls,
      document.url,
    ])].filter((url) => url !== existing.canonicalUrl);
    existing.modelHints = [
      ...new Set([...existing.modelHints, ...document.modelHints]),
    ];
  }
  return [...byUrl.values()];
}
