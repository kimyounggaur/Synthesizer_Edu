import { randomUUID } from 'node:crypto';
import type {
  ManualIngestDocument,
  ManualIngestPayload,
} from '../../lib/manual-ingest';
import { CrawlContext } from './context';
import { CrawlPolicyError, SelectorDriftError } from './errors';
import { createAdapter } from './adapters/registry';
import type {
  CrawlCliOptions,
  CrawlError,
  CandidatePage,
  NormalizedDocument,
  PipelineStage,
  RawDocument,
  RunMetrics,
  SourceDefinition,
  ValidationResult,
} from './types';
import { PIPELINE_STAGES } from './types';
import type {
  DraftSink,
  ExistingDocumentState,
} from './lib/ingest-client';
import {
  dedupeByCanonicalUrl,
  detectLanguageFromText,
  normalizeDocument,
  normalizeModelName,
} from './lib/normalize';
import {
  deleteCachedFile,
  downloadDocument,
  pruneLocalCache,
  r2ConfigFromEnv,
  uploadPrivateR2,
  type CachedFile,
} from './lib/storage';
import { validateCachedDocument } from './lib/validate';
import { sha1 } from './lib/hash';

export type CrawlRunResult = {
  source: SourceDefinition;
  metrics: RunMetrics;
  stage: PipelineStage;
  candidates: number;
  extracted: number;
  normalized: number;
  persisted: number;
  issues: Array<{ documentId?: string; url?: string; reasons: string[] }>;
};

type PipelineDependencies = {
  sink?: DraftSink;
  context?: CrawlContext;
  cacheRoot?: string;
  existingDocuments?: Map<string, ExistingDocumentState>;
};

function reached(stage: PipelineStage, target: PipelineStage) {
  return PIPELINE_STAGES.indexOf(stage) <= PIPELINE_STAGES.indexOf(target);
}

function asCrawlError(error: unknown): CrawlError {
  if (error instanceof CrawlPolicyError) {
    return {
      code: error.code,
      message: error.message,
      url: error.url,
      status: error.status,
    };
  }
  return {
    code: 'unexpected',
    message: error instanceof Error ? error.message : String(error),
  };
}

function modelSelected(source: SourceDefinition, selector?: string) {
  if (!selector) return source.models;
  const normalized = normalizeModelName(selector.replace(`${source.id}/`, ''));
  return source.models.filter((model) =>
    [model.id, model.appModelId, model.canonicalName, ...model.aliases]
      .filter(Boolean)
      .some((value) =>
        normalizeModelName(String(value).replace(`${source.id}/`, '')).includes(
          normalized,
        ),
      ),
  );
}

function documentGate(
  document: NormalizedDocument,
  validation: ValidationResult,
) {
  const reasons = [...document.reviewReasons];
  if (document.modelMatch.certainty === 'family') {
    const index = reasons.indexOf('suffix_ambiguous');
    if (index >= 0) reasons.splice(index, 1);
  }
  if (!validation.valid) reasons.push(...validation.errors.map((item) => `invalid_${item}`));
  if (!validation.sha256) reasons.push('sha256_missing');
  if (!validation.textLayer) reasons.push('text_layer_missing_ocr_disabled');
  return [...new Set(reasons)];
}

function ingestDocument(
  document: NormalizedDocument,
  file: CachedFile,
  validation: ValidationResult,
  status: 'draft' | 'invalid',
): ManualIngestDocument {
  return {
    id: document.id,
    primaryModelId: document.modelMatch.primaryModelId!,
    modelIds: document.modelMatch.modelIds,
    suffixAmbiguous: document.modelMatch.suffixAmbiguous,
    docType: document.docType,
    language: document.language,
    title: document.title,
    version: document.version,
    publishedAt: document.publishedAt,
    canonicalUrl: document.canonicalUrl,
    mirrorUrls: document.originalUrls,
    mimeType: document.mimeType,
    byteSize: validation.byteSize,
    sha256: validation.sha256,
    pageCount: validation.pageCount,
    status,
    etag: file.metadata.etag,
    lastModified: file.metadata.lastModified,
    outline: validation.outline,
    controlCandidates: validation.controlCandidates,
  };
}

function makeMetrics(sourceId: string): RunMetrics {
  return {
    id: randomUUID(),
    sourceId,
    startedAt: new Date(),
    requestCount: 0,
    bytesFetched: 0,
    averageResponseMs: 0,
    http4xx: 0,
    docsFound: 0,
    docsNew: 0,
    docsChanged: 0,
    docsDead: 0,
    needsReview: 0,
    errors: [],
    outcome: 'ok',
  };
}

export async function runSourcePipeline(
  source: SourceDefinition,
  options: CrawlCliOptions,
  dependencies: PipelineDependencies = {},
): Promise<CrawlRunResult> {
  const metrics = makeMetrics(source.id);
  const issues: CrawlRunResult['issues'] = [];
  const robots: ManualIngestPayload['robots'] = [];
  const selectedModels = modelSelected(source, options.model);
  if (options.model && !selectedModels.length) {
    throw new Error(`${options.model} 모델이 ${source.id} 레지스트리에 없습니다.`);
  }
  const runSource: SourceDefinition = {
    ...source,
    models: selectedModels,
    discovery: options.model
      ? { ...source.discovery, seeds: [] }
      : source.discovery,
  };
  const context =
    dependencies.context ??
    new CrawlContext(runSource, {
      onEvent: (event, detail) => {
        if (event === 'request_failed') {
          metrics.errors.push({
            code: event,
            message:
              typeof detail.message === 'string' ? detail.message : event,
            url: typeof detail.url === 'string' ? detail.url : undefined,
          });
        }
        if (
          event === 'request' &&
          Number(detail.status) >= 400 &&
          Number(detail.status) < 500
        ) {
          metrics.http4xx += 1;
        }
        if (event === 'robots_checked') {
          robots.push({
            host: String(detail.host),
            checkedAt: new Date().toISOString(),
            statusCode: Number(detail.status),
            allowsRoot: Boolean(detail.allowsRoot),
          });
        }
      },
    });
  const adapter = createAdapter(runSource);
  const result: CrawlRunResult = {
    source: runSource,
    metrics,
    stage: 'seed',
    candidates: 0,
    extracted: 0,
    normalized: 0,
    persisted: 0,
    issues,
  };
  if (options.until === 'seed') return result;

  const candidates: CandidatePage[] = [];
  const rawDocuments: RawDocument[] = [];
  const pageBodies = new Map<string, string>();
  const ingestDocuments: ManualIngestDocument[] = [];
  const notModifiedUrls: string[] = [];
  const byHash = new Map<string, ManualIngestDocument>();
  let sinkAttempted = false;
  const buildPayload = (): ManualIngestPayload => ({
    actor: 'crawler',
    source: {
      id: runSource.id,
      displayName: runSource.displayName,
      archetype: runSource.archetype,
      baseHosts: runSource.hosts.base,
      assetHosts: runSource.hosts.assets,
      status: runSource.status,
      rateLimitMs: runSource.policy.rateLimitMs,
      crawlBudget: runSource.policy.crawlBudget,
      notes: runSource.notes,
    },
    models: runSource.models,
    documents: ingestDocuments,
    issues: issues.map((issue) => ({
      id: sha1(
        `${metrics.id}:${issue.documentId ?? issue.url}:${issue.reasons.join(',')}`,
      ),
      ...issue,
    })),
    robots,
    notModifiedUrls,
    run: {
      id: metrics.id,
      startedAt: metrics.startedAt.toISOString(),
      finishedAt: (metrics.finishedAt ?? new Date()).toISOString(),
      requestCount: metrics.requestCount,
      bytesFetched: metrics.bytesFetched,
      docsFound: metrics.docsFound,
      docsNew: metrics.docsNew,
      docsChanged: metrics.docsChanged,
      errors: metrics.errors,
      outcome: metrics.outcome,
    },
  });

  try {
    for await (const candidate of adapter.discover(context)) {
      candidates.push(candidate);
    }
    result.candidates = candidates.length;
    result.stage = 'discover';
    if (options.until === 'discover') return result;

    for (const candidate of candidates) {
      const body = await context.fetchText(candidate.url);
      pageBodies.set(candidate.url, body);
      rawDocuments.push(...(await adapter.extract(candidate, body, context)));
    }
    if (runSource.healthCheck) {
      const healthBody =
        pageBodies.get(runSource.healthCheck.url) ??
        (await context.fetchText(runSource.healthCheck.url));
      const healthDocs = await adapter.extract(
        {
          sourceId: source.id,
          url: runSource.healthCheck.url,
          modelHint: selectedModels.find(
            (model) => model.supportUrl === runSource.healthCheck?.url,
          )?.canonicalName,
        },
        healthBody,
        context,
      );
      if (healthDocs.length < runSource.healthCheck.minDocuments) {
        throw new SelectorDriftError(
          source.id,
          healthDocs.length,
          runSource.healthCheck.minDocuments,
        );
      }
    }
    result.extracted = rawDocuments.length;
    metrics.docsFound = rawDocuments.length;
    result.stage = 'extract';
    if (options.until === 'extract') return result;

    const normalized = dedupeByCanonicalUrl(
      rawDocuments.map((document) => normalizeDocument(document, runSource)),
    );
    result.normalized = normalized.length;
    result.stage = 'normalize';
    if (options.until === 'normalize') return result;

    if (!options.dryRun) await pruneLocalCache(dependencies.cacheRoot);
    const r2 = options.dryRun ? undefined : r2ConfigFromEnv();
    for (const document of normalized) {
      if (!document.modelMatch.primaryModelId) {
        metrics.needsReview += 1;
        issues.push({
          documentId: document.id,
          url: document.canonicalUrl,
          reasons: ['model_unmatched'],
        });
        continue;
      }
      const downloaded = await downloadDocument(document, context, {
        dryRun: options.dryRun,
        cacheRoot: dependencies.cacheRoot,
        etag: options.force
          ? undefined
          : dependencies.existingDocuments?.get(document.canonicalUrl)?.etag,
        lastModified: options.force
          ? undefined
          : dependencies.existingDocuments?.get(document.canonicalUrl)
              ?.lastModified,
      });
      if ('notModified' in downloaded) {
        notModifiedUrls.push(document.canonicalUrl);
        continue;
      }
      if ('missing' in downloaded) {
        issues.push({
          documentId: document.id,
          url: document.canonicalUrl,
          reasons: ['http_404'],
        });
        continue;
      }
      result.stage = 'fetch';
      if (options.until === 'fetch') continue;
      const validation = await validateCachedDocument(document, downloaded);
      result.stage = 'validate';
      if (document.language === 'und' && validation.textSample) {
        const detected = detectLanguageFromText(validation.textSample);
        if (detected !== 'und') {
          document.language = detected;
          document.reviewReasons = document.reviewReasons.filter(
            (reason) => reason !== 'language_undetermined',
          );
          document.needsReview = document.reviewReasons.length > 0;
        }
      }
      const reasons = documentGate(document, validation);
      if (!validation.valid) {
        ingestDocuments.push(
          ingestDocument(document, downloaded, validation, 'invalid'),
        );
        await deleteCachedFile(downloaded);
        metrics.needsReview += 1;
        issues.push({ documentId: document.id, url: document.canonicalUrl, reasons });
        continue;
      }
      if (options.until === 'validate') continue;
      if (reasons.length) {
        metrics.needsReview += 1;
        issues.push({ documentId: document.id, url: document.canonicalUrl, reasons });
        continue;
      }
      result.stage = 'derive';
      const candidate = ingestDocument(document, downloaded, validation, 'draft');
      const hashKey = `${candidate.sha256}:${candidate.docType}:${candidate.language}`;
      const duplicate = byHash.get(hashKey);
      if (duplicate) {
        duplicate.mirrorUrls = [
          ...new Set([
            ...duplicate.mirrorUrls,
            document.canonicalUrl,
            ...document.originalUrls,
          ]),
        ];
        duplicate.modelIds = [
          ...new Set([...duplicate.modelIds, ...candidate.modelIds]),
        ];
        duplicate.suffixAmbiguous ||= candidate.suffixAmbiguous;
        await deleteCachedFile(downloaded);
        continue;
      }
      if (r2) await uploadPrivateR2(downloaded, r2);
      ingestDocuments.push(candidate);
      byHash.set(hashKey, candidate);
      const previous = dependencies.existingDocuments?.get(document.canonicalUrl);
      if (!previous) metrics.docsNew += 1;
      else if (previous.sha256 !== candidate.sha256) metrics.docsChanged += 1;
    }

    if (reached('publish', options.until) && !options.dryRun) {
      if (!dependencies.sink) throw new Error('draft ingest sink is not configured');
      metrics.finishedAt = new Date();
      metrics.requestCount = context.requestCount;
      metrics.bytesFetched = context.bytesFetched;
      metrics.averageResponseMs = context.averageResponseMs;
      sinkAttempted = true;
      await dependencies.sink.write(buildPayload());
      result.persisted = ingestDocuments.length;
      result.stage = 'publish';
    }
  } catch (error) {
    metrics.errors.push(asCrawlError(error));
    metrics.outcome =
      runSource.status === 'blocked' ||
      (error instanceof CrawlPolicyError && error.code === 'source_blocked')
        ? 'blocked'
        : result.normalized || result.extracted
          ? 'partial'
          : 'failed';
  } finally {
    metrics.finishedAt ??= new Date();
    metrics.requestCount = context.requestCount;
    metrics.bytesFetched = context.bytesFetched;
    metrics.averageResponseMs = context.averageResponseMs;
  }
  if (
    options.until === 'publish' &&
    !options.dryRun &&
    dependencies.sink &&
    !sinkAttempted
  ) {
    try {
      sinkAttempted = true;
      await dependencies.sink.write(buildPayload());
      result.persisted = ingestDocuments.length;
    } catch (error) {
      metrics.errors.push(asCrawlError(error));
      metrics.outcome = 'failed';
    }
  }
  return result;
}
