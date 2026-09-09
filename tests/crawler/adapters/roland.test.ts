import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { StaticSlugAdapter } from '../../../scripts/crawler/adapters/static-slug';
import { loadSources } from '../../../scripts/crawler/lib/source-loader';
import type { CrawlContextLike } from '../../../scripts/crawler/types';

void test('Roland fixture extracts the expected official documents', async () => {
  const source = (await loadSources()).find((item) => item.id === 'roland')!;
  const adapter = new StaticSlugAdapter(source);
  const html = await readFile(
    new URL('../../fixtures/roland/juno-ds61-owners-manuals.html', import.meta.url),
    'utf8',
  );
  const expected = JSON.parse(
    await readFile(new URL('../../fixtures/roland/expected.json', import.meta.url), 'utf8'),
  ) as Array<Record<string, string>>;
  const ctx = {
    isAllowedUrl: (url: string) =>
      ['www.roland.com', 'static.roland.com'].includes(new URL(url).hostname),
  } as CrawlContextLike;
  const actual = await adapter.extract(
    {
      sourceId: 'roland',
      url: 'https://www.roland.com/global/support/by_product/juno-ds61/owners_manuals/',
      modelHint: 'JUNO-DS61',
    },
    html,
    ctx,
  );
  assert.equal(actual.length, expected.length);
  for (const [index, item] of expected.entries()) {
    assert.equal(actual[index].url, item.url);
    assert.equal(actual[index].title, item.title);
    assert.equal(actual[index].languageHint, item.languageHint);
  }
});
