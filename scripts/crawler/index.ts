import { parseArgs } from 'node:util';
import { draftSinkFromEnv } from './lib/ingest-client';
import { writeReports } from './lib/report';
import { loadSources } from './lib/source-loader';
import { runSourcePipeline } from './pipeline';
import { PIPELINE_STAGES, type CrawlCliOptions, type Region } from './types';

const parsed = parseArgs({
  options: {
    all: { type: 'boolean', default: false },
    source: { type: 'string' },
    region: { type: 'string' },
    model: { type: 'string' },
    until: { type: 'string', default: 'publish' },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  },
  allowPositionals: false,
  strict: true,
});

if (!PIPELINE_STAGES.includes(parsed.values.until as never)) {
  throw new Error(`--until 값은 ${PIPELINE_STAGES.join(', ')} 중 하나여야 합니다.`);
}
if (
  parsed.values.region &&
  !['asia', 'europe', 'north-america'].includes(parsed.values.region)
) {
  throw new Error('--region 값은 asia, europe, north-america 중 하나여야 합니다.');
}

const options: CrawlCliOptions = {
  all: parsed.values.all ?? false,
  source: parsed.values.source,
  region: parsed.values.region as Region | undefined,
  model: parsed.values.model,
  until: parsed.values.until as CrawlCliOptions['until'],
  dryRun: parsed.values['dry-run'] ?? false,
  force: parsed.values.force ?? false,
};
if (!options.all && !options.source && !options.region && !options.model) {
  throw new Error('--all, --source, --region 또는 --model 중 하나를 지정하세요.');
}
if (options.model && !options.source && options.model.includes('/')) {
  options.source = options.model.split('/')[0];
}

const sources = await loadSources();
let selected = sources.filter((source) => source.status === 'active');
if (options.source) selected = selected.filter((source) => source.id === options.source);
if (options.region) selected = selected.filter((source) => source.region === options.region);
if (options.model) {
  selected = selected.filter((source) =>
    options.model!.startsWith(`${source.id}/`) ||
    source.models.some(
      (model) =>
        model.id === options.model ||
        model.appModelId === options.model ||
        model.aliases.includes(options.model!),
    ),
  );
}
if (!selected.length) {
  const requested = options.source
    ? sources.find((source) => source.id === options.source)
    : undefined;
  if (requested && requested.status !== 'active') {
    throw new Error(`${requested.id} 소스는 ${requested.status} 상태라 실행하지 않습니다.`);
  }
  if (options.region) {
    console.log(`${options.region} 지역에 active 소스가 없어 안전하게 건너뜁니다.`);
    if (!options.dryRun) await writeReports([]);
    process.exit(0);
  }
  throw new Error('조건에 맞는 active 소스가 없습니다.');
}

const sink =
  !options.dryRun && options.until === 'publish' ? draftSinkFromEnv() : undefined;
const results = [];
for (const source of selected) {
  console.log(`[${source.id}] ${options.until} 단계까지 시작`);
  const existingDocuments =
    sink && !options.force ? await sink.readState(source.id) : undefined;
  const result = await runSourcePipeline(source, options, {
    sink,
    existingDocuments,
  });
  results.push(result);
  console.log(
    `[${source.id}] ${result.metrics.outcome}: 발견 ${result.metrics.docsFound}, 저장 ${result.persisted}, 검토 ${result.metrics.needsReview}`,
  );
}

if (!options.dryRun) {
  const report = await writeReports(results);
  console.log(`리포트: ${report.markdownPath}`);
}
if (results.some((result) => ['failed', 'blocked'].includes(result.metrics.outcome))) {
  process.exitCode = 1;
}
