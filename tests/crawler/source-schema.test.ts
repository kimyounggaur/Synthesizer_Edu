import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSources } from '../../scripts/crawler/lib/source-loader';

void test('Tier 1 source registry validates and contains eight manufacturers', async () => {
  const sources = await loadSources();
  assert.equal(sources.length, 8);
  assert.deepEqual(
    sources.map((source) => source.id).sort(),
    ['arturia', 'behringer', 'casio', 'korg', 'nord', 'novation', 'roland', 'yamaha'],
  );
  for (const source of sources) {
    assert.ok(source.evidenceUrls.length >= 3);
    assert.ok(source.policy.rateLimitMs >= 2000);
    assert.ok((source.policy.pdfRateLimitMs ?? 5000) >= 5000);
    assert.ok(source.policy.crawlBudget <= 200);
  }
});

void test('live source audit starts known 403 sources blocked', async () => {
  const byId = new Map((await loadSources()).map((source) => [source.id, source]));
  assert.equal(byId.get('yamaha')?.status, 'blocked');
  assert.equal(byId.get('casio')?.status, 'blocked');
  assert.deepEqual(byId.get('arturia')?.hosts.assets, ['dl.arturia.net']);
  assert.deepEqual(byId.get('behringer')?.hosts.assets, [
    'cdn-media.empowertribe.com',
  ]);
});

void test('app model id mapping remains explicit', async () => {
  const roland = (await loadSources()).find((source) => source.id === 'roland');
  const juno = roland?.models.find((model) => model.id === 'roland/juno-ds61');
  assert.equal(juno?.appModelId, 'roland_juno_ds61');
});
