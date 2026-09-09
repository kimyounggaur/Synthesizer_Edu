import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertNotCrawler,
  validateIngestPayload,
} from '../../lib/manual-ingest';

void test('crawler cannot set human-owned states', () => {
  for (const status of ['published', 'verified', 'rejected']) {
    assert.throws(() => assertNotCrawler('crawler', status), /cannot set status/);
  }
  for (const status of ['draft', 'stale', 'dead', 'invalid']) {
    assert.doesNotThrow(() => assertNotCrawler('crawler', status));
  }
});

void test('ingest validation rejects published status even in a shaped payload', () => {
  const errors = validateIngestPayload({
    actor: 'crawler',
    source: { id: 'roland' },
    models: [],
    issues: [],
    robots: [],
    run: { id: 'run', finishedAt: new Date().toISOString() },
    documents: [
      {
        id: 'doc',
        primaryModelId: 'roland/juno-ds61',
        modelIds: ['roland/juno-ds61'],
        canonicalUrl: 'https://static.roland.com/manual.pdf',
        status: 'published',
        outline: [],
        controlCandidates: [],
      },
    ],
  });
  assert.ok(errors.some((error) => error.includes("cannot set status 'published'")));
});
