import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateCachedDocument } from '../../scripts/crawler/lib/validate';
import type { CachedFile } from '../../scripts/crawler/lib/storage';
import type { NormalizedDocument } from '../../scripts/crawler/types';

function document(mimeType: 'application/pdf' | 'text/html'): NormalizedDocument {
  return {
    id: 'doc',
    sourceId: 'test',
    sourcePageUrl: 'https://manuals.example.com/product',
    url: 'https://cdn.example.com/manual.pdf',
    canonicalUrl: 'https://cdn.example.com/manual.pdf',
    originalUrls: [],
    title: "Owner's Manual English",
    modelHints: ['TEST1'],
    modelMatch: {
      modelIds: ['test/test1'],
      primaryModelId: 'test/test1',
      suffixAmbiguous: false,
      certainty: 'exact',
    },
    docType: 'owners_manual',
    language: 'en',
    mimeType,
    needsReview: false,
    reviewReasons: [],
  };
}

void test('a PDF URL returning HTML is invalid', async () => {
  const bytes = new TextEncoder().encode(`<!doctype html><html><body>${'login '.repeat(3000)}</body></html>`);
  const file: CachedFile = {
    key: 'test/doc.pdf',
    bytes,
    size: bytes.byteLength,
    sha256: 'abc',
    metadata: {
      status: 200,
      contentType: 'text/html',
      finalUrl: 'https://cdn.example.com/manual.pdf',
    },
  };
  const result = await validateCachedDocument(document('application/pdf'), file);
  assert.equal(result.valid, false);
  assert.equal(result.checks.magic, false);
  assert.equal(result.checks.contentType, false);
});

void test('web manual validation stores headings, not body text', async () => {
  const body = `${'<p>Operation instructions and neutral factual text.</p>'.repeat(30)}`;
  const bytes = new TextEncoder().encode(
    `<!doctype html><html><body><h1>Panel Description</h1><h2>Troubleshooting</h2>${body}</body></html>`,
  );
  const file: CachedFile = {
    key: 'test/doc.html',
    bytes,
    size: bytes.byteLength,
    sha256: 'abc',
    metadata: {
      status: 200,
      contentType: 'text/html; charset=utf-8',
      finalUrl: 'https://manuals.example.com/manual',
    },
  };
  const result = await validateCachedDocument(document('text/html'), file);
  assert.equal(result.valid, true);
  assert.deepEqual(
    result.outline.map((item) => item.sectionKind),
    ['panel_description', 'troubleshooting'],
  );
  assert.ok(result.textSample && result.textSample.length <= 2000);
});
