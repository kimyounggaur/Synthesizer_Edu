import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JsonApiAdapter } from '../../../scripts/crawler/adapters/json-api';
import { loadSources } from '../../../scripts/crawler/lib/source-loader';
import type { CrawlContextLike } from '../../../scripts/crawler/types';

void test('Arturia uses embedded JSON without a headless browser', async () => {
  const source = (await loadSources()).find((item) => item.id === 'arturia')!;
  const adapter = new JsonApiAdapter(source);
  const body = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      downloads: [
        {
          name: 'MiniFreak Manual English',
          product: 'MiniFreak',
          language: 'en',
          version: '4.0.1',
          downloadUrl:
            'https://dl.arturia.net/products/minifreak/manual/minifreak_Manual_4_0_1_EN.pdf',
        },
      ],
    },
  })}</script>`;
  const ctx = {
    isAllowedUrl: (url: string) =>
      ['www.arturia.com', 'dl.arturia.net'].includes(new URL(url).hostname),
  } as CrawlContextLike;
  const documents = await adapter.extract(
    {
      sourceId: 'arturia',
      url: source.models[0].supportUrl!,
      modelHint: 'MiniFreak',
    },
    body,
    ctx,
  );
  assert.equal(documents.length, 1);
  assert.equal(documents[0].languageHint, 'en');
  assert.equal(documents[0].versionHint, '4.0.1');
});
