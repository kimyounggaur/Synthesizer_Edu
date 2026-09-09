import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { CrawlRunResult } from '../pipeline';

const REPORTS_DIR = fileURLToPath(new URL('../../../reports/', import.meta.url));

function duration(result: CrawlRunResult) {
  const finished = result.metrics.finishedAt?.getTime() ?? Date.now();
  const seconds = Math.max(
    0,
    Math.round((finished - result.metrics.startedAt.getTime()) / 1000),
  );
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
}

function statusLabel(outcome: CrawlRunResult['metrics']['outcome']) {
  if (outcome === 'ok') return '✅ ok';
  if (outcome === 'partial') return '⚠️ partial';
  if (outcome === 'blocked') return '🔴 blocked';
  return '🔴 failed';
}

export function renderReport(
  results: CrawlRunResult[],
  date: string,
  alerts: string[] = [],
) {
  const rows = results.map(
    (result) =>
      `| ${result.source.id} | ${statusLabel(result.metrics.outcome)} | ${result.metrics.requestCount} | ${result.metrics.docsFound} | ${result.metrics.docsNew} | ${result.metrics.docsChanged} | ${result.metrics.docsDead} | ${duration(result)} |`,
  );
  const actionItems = results.flatMap((result) => {
    const items: string[] = [];
    if (result.metrics.outcome !== 'ok') {
      items.push(
        `- **${result.source.id}**: ${result.metrics.errors.map((error) => error.message).join('; ') || result.metrics.outcome}`,
      );
    }
    if (result.metrics.needsReview) {
      items.push(
        `- **${result.source.id}**: needs_review ${result.metrics.needsReview}건 — 관리자 확인 필요`,
      );
    }
    return items;
  });
  if (!results.length) actionItems.push('- 실행 지역에 active 소스가 없습니다.');
  actionItems.push(...alerts);
  return `# 크롤 리포트 ${date}

| 소스 | 상태 | 요청 | 발견 | 신규 | 변경 | 사망 | 소요 |
|---|---|---:|---:|---:|---:|---:|---:|
${rows.join('\n')}

## 조치 필요

${actionItems.length ? actionItems.join('\n') : '- 없음'}

> 이 리포트에는 L1 메타데이터 집계만 포함됩니다. 원본 파일과 추출 본문은 포함하지 않습니다.
`;
}

export async function writeReports(
  results: CrawlRunResult[],
  now = new Date(),
  directory = REPORTS_DIR,
) {
  await mkdir(directory, { recursive: true });
  const date = now.toISOString().slice(0, 10);
  const suffix = results.length === 1 ? `-${results[0].source.id}` : '';
  const basename = `crawl-${date}${suffix}`;
  const historical: Array<{
    results?: Array<{
      sourceId: string;
      metrics: {
        docsFound: number;
        docsNew: number;
        averageResponseMs?: number;
      };
    }>;
  }> = [];
  try {
    const priorNames = (await readdir(directory))
      .filter(
        (name) =>
          /^crawl-\d{4}-\d{2}-\d{2}.*\.json$/.test(name) &&
          name !== `${basename}.json`,
      )
      .sort()
      .reverse()
      .slice(0, 3);
    for (const name of priorNames) {
      historical.push(JSON.parse(await readFile(`${directory}/${name}`, 'utf8')));
    }
  } catch {
    // The first run intentionally has no baseline.
  }
  const alerts: string[] = [];
  for (const result of results) {
    const priorRows = historical
      .flatMap((report) => report.results ?? [])
      .filter((row) => row.sourceId === result.source.id);
    const previous = priorRows[0];
    if (
      previous?.metrics.docsFound > 0 &&
      result.metrics.docsFound < previous.metrics.docsFound * 0.7
    ) {
      alerts.push(
        `- 🔴 **${result.source.id}**: 발견량이 직전 실행보다 30% 이상 감소했습니다.`,
      );
    }
    if (
      result.metrics.requestCount > 0 &&
      result.metrics.http4xx / result.metrics.requestCount > 0.1
    ) {
      alerts.push(`- 🟠 **${result.source.id}**: 4xx 비율이 10%를 넘었습니다.`);
    }
    if (result.metrics.needsReview > 50) {
      alerts.push(`- 🟠 **${result.source.id}**: needs_review가 50건을 넘었습니다.`);
    }
    const elapsed =
      (result.metrics.finishedAt?.getTime() ?? Date.now()) -
      result.metrics.startedAt.getTime();
    if (elapsed > 120 * 60 * 1000) {
      alerts.push(`- 🟠 **${result.source.id}**: 실행 시간이 120분을 넘었습니다.`);
    }
    if (
      previous?.metrics.averageResponseMs &&
      result.metrics.averageResponseMs > previous.metrics.averageResponseMs * 3
    ) {
      alerts.push(`- 🟡 **${result.source.id}**: 평균 응답시간이 직전의 3배를 넘었습니다.`);
    }
    if (
      result.metrics.docsNew === 0 &&
      priorRows.slice(0, 2).length === 2 &&
      priorRows.slice(0, 2).every((row) => row.metrics.docsNew === 0)
    ) {
      alerts.push(`- 🟡 **${result.source.id}**: 신규 문서가 3회 연속 0건입니다.`);
    }
  }
  const markdown = renderReport(results, date, alerts);
  const json = JSON.stringify(
    {
      generatedAt: now.toISOString(),
      results: results.map((result) => ({
        sourceId: result.source.id,
        stage: result.stage,
        candidates: result.candidates,
        extracted: result.extracted,
        normalized: result.normalized,
        persisted: result.persisted,
        metrics: {
          ...result.metrics,
          startedAt: result.metrics.startedAt.toISOString(),
          finishedAt: result.metrics.finishedAt?.toISOString(),
        },
        issues: result.issues,
      })),
    },
    null,
    2,
  );
  const markdownPath = `${directory}/${basename}.md`;
  const jsonPath = `${directory}/${basename}.json`;
  await Promise.all([
    writeFile(markdownPath, markdown),
    writeFile(jsonPath, `${json}\n`),
  ]);
  return { markdownPath, jsonPath, markdown };
}

export async function latestReport(directory = REPORTS_DIR) {
  const names = (await readdir(directory))
    .filter((name) => /^crawl-\d{4}-\d{2}-\d{2}.*\.md$/.test(name))
    .sort()
    .reverse();
  if (!names[0]) throw new Error('생성된 크롤 리포트가 없습니다.');
  const path = `${directory}/${names[0]}`;
  return { path, markdown: await readFile(path, 'utf8') };
}
