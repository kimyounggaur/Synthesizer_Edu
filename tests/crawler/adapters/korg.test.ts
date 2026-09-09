import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { IndexHarvestAdapter } from '../../../scripts/crawler/adapters/index-harvest';
import { loadSources } from '../../../scripts/crawler/lib/source-loader';
import type { CrawlContextLike } from '../../../scripts/crawler/types';

void test('Korg fixture keeps same-sized language variants separate', async () => {
  const source = (await loadSources()).find((item) => item.id === 'korg')!;
  const adapter = new IndexHarvestAdapter(source);
  const html = await readFile(
    new URL('../../fixtures/korg/phase8-download.html', import.meta.url),
    'utf8',
  );
  const ctx = {
    isAllowedUrl: (url: string) =>
      ['www.korg.com', 'cdn.korg.com'].includes(new URL(url).hostname),
  } as CrawlContextLike;
  const documents = await adapter.extract(
    {
      sourceId: 'korg',
      url: 'https://www.korg.com/us/support/download/product/0/1008/',
      modelHint: 'phase8',
    },
    html,
    ctx,
  );
  assert.equal(documents.length, 2);
  assert.deepEqual(
    documents.map((document) => document.languageHint),
    ['en', 'ja'],
  );
  assert.notEqual(documents[0].url, documents[1].url);
});
