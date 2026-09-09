import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SearchFormAdapter } from '../../../scripts/crawler/adapters/search-form';
import { loadSources } from '../../../scripts/crawler/lib/source-loader';
import type { CrawlContextLike } from '../../../scripts/crawler/types';

void test('Yamaha extraction enriches metadata from a parsed filename', async () => {
  const source = (await loadSources()).find((item) => item.id === 'yamaha')!;
  const adapter = new SearchFormAdapter(source);
  const ctx = {
    isAllowedUrl: (url: string) =>
      ['usa.yamaha.com', 'data.yamaha.com'].includes(new URL(url).hostname),
  } as CrawlContextLike;
  const documents = await adapter.extract(
    {
      sourceId: 'yamaha',
      url: source.models[0].supportUrl!,
      modelHint: 'MODX M',
    },
    '<a href="https://data.yamaha.com/files/download/other_assets/0/2584700/MODX-M_operation_manual_En_C0.pdf">Operation Manual</a>',
    ctx,
  );
  assert.equal(documents.length, 1);
  assert.equal(documents[0].languageHint, 'en');
  assert.equal(documents[0].docTypeHint, 'owners_manual');
  assert.equal(documents[0].versionHint, 'c0');
  assert.equal(documents[0].modelHints[0], 'MODX-M');
});
