import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canonicalizeUrl,
  detectLanguage,
  matchModels,
  normalizeDocType,
  normalizeModelName,
} from '../../scripts/crawler/lib/normalize';
import { loadSources } from '../../scripts/crawler/lib/source-loader';
import { parseYamahaFilename } from '../../scripts/crawler/adapters/search-form';
import type { RawDocument } from '../../scripts/crawler/types';

void test('model name normalization golden cases', () => {
  const cases = [
    ['JUNO DS 61', 'JUNO-DS61'],
    ['juno_ds_61', 'JUNO-DS61'],
    ['JUNO-DS61', 'JUNO-DS61'],
    ['MODX 8', 'MODX8'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeModelName(input), expected);
  }
});

void test('alias and family matching never guesses', async () => {
  const roland = (await loadSources()).find((source) => source.id === 'roland')!;
  assert.equal(matchModels(['주노 DS61'], roland.models).certainty, 'alias');
  const family = matchModels(['JUNO-DS'], roland.models);
  assert.equal(family.certainty, 'family');
  assert.equal(family.suffixAmbiguous, true);
  assert.equal(family.modelIds.length, 3);
  assert.equal(matchModels(['UNKNOWN 9000'], roland.models).certainty, 'none');
});

void test('Roland URL canonicalization strips locale, tracking, uuid and fragment', async () => {
  const roland = (await loadSources()).find((source) => source.id === 'roland')!;
  assert.equal(
    canonicalizeUrl(
      'http://WWW.ROLAND.COM/us/support/by_product/juno-ds61/123e4567-e89b-12d3-a456-426614174000/?utm_source=x#top',
      roland,
    ),
    'https://www.roland.com/global/support/by_product/juno-ds61/',
  );
});

void test('language and document type use semantic evidence, never size/order', () => {
  const raw: RawDocument = {
    sourceId: 'korg',
    sourcePageUrl: 'https://www.korg.com/us/support/',
    url: 'https://cdn.korg.com/us/support/download/files/phase8_ja.pdf',
    title: "phase8 Owner's Manual 日本語",
    modelHints: ['phase8'],
  };
  assert.equal(detectLanguage(raw), 'ja');
  assert.equal(normalizeDocType(raw), 'owners_manual');
});

void test('Yamaha filename parser returns reviewable miss instead of guessing', () => {
  assert.deepEqual(parseYamahaFilename('MODX-M_om_en_c0.pdf'), {
    model: 'MODX-M',
    documentCode: 'om',
    language: 'en',
    revision: 'c0',
    parsed: true,
  });
  assert.deepEqual(parseYamahaFilename('download-final.pdf'), { parsed: false });
});
