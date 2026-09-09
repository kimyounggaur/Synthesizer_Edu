import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { InvalidSourceError } from '../errors';
import type { SourceDefinition } from '../types';
import { allowedHosts, normalizeHost } from './allowlist';

export const DEFAULT_SOURCES_DIR = fileURLToPath(
  new URL('../../../sources/', import.meta.url),
);

function formatAjvErrors(errors: ErrorObject[] | null | undefined) {
  return (errors ?? [])
    .map((error) => `${error.instancePath || '/'} ${error.message}`)
    .join('; ');
}

function allConfiguredUrls(source: SourceDefinition): string[] {
  const urls = [
    ...source.discovery.seeds,
    ...(source.discovery.jsonEndpoints ?? []),
    ...source.evidenceUrls,
  ];
  if (source.healthCheck) urls.push(source.healthCheck.url);
  for (const model of source.models) {
    if (model.productUrl) urls.push(model.productUrl);
    if (model.supportUrl) urls.push(model.supportUrl);
  }
  if (source.discovery.supportUrlTemplate) {
    urls.push(source.discovery.supportUrlTemplate.replace('{slug}', 'probe'));
  }
  if (source.discovery.searchUrlTemplate) {
    urls.push(source.discovery.searchUrlTemplate.replace('{query}', 'probe'));
  }
  return urls;
}

export function validateSourcePolicy(
  source: SourceDefinition,
  filename = `${source.id}.yaml`,
) {
  const problems: string[] = [];
  const expectedId = filename.replace(/\.ya?ml$/i, '');
  if (source.id !== expectedId) {
    problems.push(`파일명(${expectedId})과 id(${source.id})가 다릅니다`);
  }
  if (source.evidenceUrls.length < 3) {
    problems.push('실측 evidenceUrls가 3건보다 적습니다');
  }
  if (source.status === 'active' && source.archetype === 'X') {
    problems.push('검증되지 않은 X 아키타입을 active로 둘 수 없습니다');
  }
  if (source.status === 'active' && (!source.verifiedAt || !source.verifiedBy)) {
    problems.push('active 소스에는 verifiedAt/verifiedBy가 필요합니다');
  }
  if (source.policy.rateLimitMs < 2000) {
    problems.push('HTML 요청 간격은 최소 2000ms입니다');
  }
  if ((source.policy.pdfRateLimitMs ?? 5000) < 5000) {
    problems.push('PDF 요청 간격은 최소 5000ms입니다');
  }
  if (source.policy.crawlBudget > 200) {
    problems.push('호스트별 실행 예산은 최대 200입니다');
  }

  const hosts = allowedHosts(source);
  const excluded = new Set((source.hosts.excluded ?? []).map(normalizeHost));
  for (const host of hosts) {
    if (excluded.has(host)) problems.push(`${host}가 allowlist와 excluded에 중복됩니다`);
  }
  for (const input of allConfiguredUrls(source)) {
    try {
      const url = new URL(input);
      if (url.protocol !== 'https:') problems.push(`${input}: HTTPS가 아닙니다`);
      if (!hosts.has(normalizeHost(url.hostname))) {
        problems.push(`${input}: 호스트가 allowlist에 없습니다`);
      }
      if (excluded.has(normalizeHost(url.hostname))) {
        problems.push(`${input}: excluded 호스트입니다`);
      }
    } catch {
      problems.push(`${input}: 유효한 URL이 아닙니다`);
    }
  }
  for (const model of source.models) {
    if (!model.id.startsWith(`${source.id}/`)) {
      problems.push(`${model.id}: 모델 id는 ${source.id}/ 로 시작해야 합니다`);
    }
    if (model.appModelId && !/^[a-z0-9_]+$/.test(model.appModelId)) {
      problems.push(`${model.id}: appModelId 형식이 안전하지 않습니다`);
    }
  }
  if (problems.length) {
    throw new InvalidSourceError(`${filename}: ${problems.join('; ')}`);
  }
}

export async function loadSources(
  directory = DEFAULT_SOURCES_DIR,
): Promise<SourceDefinition[]> {
  const schema = JSON.parse(
    await readFile(new URL('../../../sources/_schema.json', import.meta.url), 'utf8'),
  ) as object;
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const filenames = (await readdir(directory))
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort();
  if (!filenames.length) throw new InvalidSourceError('소스 YAML 파일이 없습니다.');

  const sources: SourceDefinition[] = [];
  const ids = new Set<string>();
  for (const filename of filenames) {
    const raw = parse(await readFile(`${directory}/${filename}`, 'utf8')) as unknown;
    if (!validate(raw)) {
      throw new InvalidSourceError(
        `${filename}: ${formatAjvErrors(validate.errors)}`,
      );
    }
    const source = raw as SourceDefinition;
    validateSourcePolicy(source, filename);
    if (ids.has(source.id)) {
      throw new InvalidSourceError(`중복 source id: ${source.id}`);
    }
    ids.add(source.id);
    sources.push(source);
  }
  return sources;
}
