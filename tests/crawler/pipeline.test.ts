import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { test } from 'node:test';
import { CrawlContext } from '../../scripts/crawler/context';
import { clearRobotsCacheForTests } from '../../scripts/crawler/lib/robots';
import { loadSources } from '../../scripts/crawler/lib/source-loader';
import { runSourcePipeline } from '../../scripts/crawler/pipeline';

function inputUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

void test('dry-run through normalize performs no disk or ingest writes', async () => {
  clearRobotsCacheForTests();
  const source = (await loadSources()).find((item) => item.id === 'korg')!;
  const supportUrl = source.models[0].supportUrl!;
  let sinkWrites = 0;
  const context = new CrawlContext(source, {
    sleep: async () => {},
    fetchImpl: async (input) => {
      const url = inputUrl(input);
      if (url.endsWith('/robots.txt')) return new Response('');
      if (url === supportUrl) {
        return new Response(
          '<a href="https://cdn.korg.com/us/support/download/files/phase8_en.pdf" hreflang="en">phase8 Owner\'s Manual English</a>',
          { headers: { 'Content-Type': 'text/html' } },
        );
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });
  const cacheRoot = `${process.cwd()}/.cache/manuals-pipeline-test-${process.pid}`;
  const result = await runSourcePipeline(
    source,
    {
      all: false,
      source: 'korg',
      model: 'korg/phase8',
      until: 'normalize',
      dryRun: true,
      force: false,
    },
    {
      context,
      cacheRoot,
      sink: {
        async write() {
          sinkWrites += 1;
        },
        async readState() {
          return new Map();
        },
      },
    },
  );
  assert.equal(result.metrics.outcome, 'ok');
  assert.equal(result.normalized, 1);
  assert.equal(result.stage, 'normalize');
  assert.equal(sinkWrites, 0);
  await assert.rejects(access(cacheRoot));
});
