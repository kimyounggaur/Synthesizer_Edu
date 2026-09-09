import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { CrawlContext } from '../../scripts/crawler/context';
import {
  BlockedHostError,
  BudgetExhaustedError,
  RedirectBlockedError,
  RobotsDisallowedError,
  SourceBlockedError,
} from '../../scripts/crawler/errors';
import { clearRobotsCacheForTests } from '../../scripts/crawler/lib/robots';
import { parseRetryAfter } from '../../scripts/crawler/lib/retry';
import type { SourceDefinition } from '../../scripts/crawler/types';

function source(overrides: Partial<SourceDefinition> = {}): SourceDefinition {
  return {
    id: 'test',
    displayName: 'Test Source',
    archetype: 'A',
    status: 'active',
    region: 'asia',
    hosts: { base: ['manuals.example.com'], assets: ['cdn.example.com'] },
    policy: {
      rateLimitMs: 2000,
      pdfRateLimitMs: 5000,
      crawlBudget: 200,
      timezone: 'Asia/Tokyo',
      preferredWindow: '02:00-06:00',
    },
    discovery: { strategy: 'test', seeds: [] },
    extraction: { documentLinkSelector: 'a' },
    models: [],
    evidenceUrls: [],
    ...overrides,
  };
}

function response(body = 'ok', status = 200, headers?: HeadersInit) {
  return new Response(body, { status, headers });
}

function inputUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

beforeEach(() => clearRobotsCacheForTests());

void test('allowlist rejects an external host before any request', async () => {
  let calls = 0;
  const ctx = new CrawlContext(source(), {
    fetchImpl: async () => {
      calls += 1;
      return response();
    },
  });
  await assert.rejects(
    ctx.fetch('https://manuals.example.net/file'),
    BlockedHostError,
  );
  assert.equal(calls, 0);
});

void test('robots disallow is enforced without fetching the target', async () => {
  const requested: string[] = [];
  const ctx = new CrawlContext(source(), {
    fetchImpl: async (input) => {
      const url = inputUrl(input);
      requested.push(url);
      return url.endsWith('/robots.txt')
        ? response('User-agent: *\nDisallow: /private')
        : response();
    },
    sleep: async () => {},
  });
  await assert.rejects(
    ctx.fetch('https://manuals.example.com/private/manual.pdf'),
    RobotsDisallowedError,
  );
  assert.deepEqual(requested, ['https://manuals.example.com/robots.txt']);
});

void test('crawl budget applies per host', async () => {
  const limited = source({
    policy: {
      rateLimitMs: 2000,
      pdfRateLimitMs: 5000,
      crawlBudget: 1,
      timezone: 'Asia/Tokyo',
      preferredWindow: '02:00-06:00',
    },
  });
  const ctx = new CrawlContext(limited, {
    fetchImpl: async (input) =>
      inputUrl(input).endsWith('/robots.txt') ? response('User-agent: *\nAllow: /') : response(),
    sleep: async () => {},
  });
  await ctx.fetch('https://manuals.example.com/one');
  await assert.rejects(
    ctx.fetch('https://manuals.example.com/two'),
    BudgetExhaustedError,
  );
});

void test('429 honors Retry-After once', async () => {
  const waits: number[] = [];
  let targetCalls = 0;
  const ctx = new CrawlContext(source(), {
    fetchImpl: async (input) => {
      if (inputUrl(input).endsWith('/robots.txt')) return response('');
      targetCalls += 1;
      return targetCalls === 1
        ? response('', 429, { 'Retry-After': '120' })
        : response();
    },
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
    },
  });
  assert.equal(
    (await ctx.fetch('https://manuals.example.com/rate-limited')).status,
    200,
  );
  assert.ok(waits.includes(120_000));
  assert.equal(parseRetryAfter('120'), 120_000);
});

void test('redirect to non-allowlisted host is stopped', async () => {
  const ctx = new CrawlContext(source(), {
    fetchImpl: async (input) =>
      inputUrl(input).endsWith('/robots.txt')
        ? response('')
        : response('', 302, { Location: 'https://evil.example/file.pdf' }),
    sleep: async () => {},
  });
  await assert.rejects(
    ctx.fetch('https://manuals.example.com/redirect'),
    RedirectBlockedError,
  );
});

void test('same-host requests are serialized with the configured interval', async () => {
  let now = 0;
  const waits: number[] = [];
  const ctx = new CrawlContext(source(), {
    now: () => now,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
      now += milliseconds;
    },
    fetchImpl: async (input) =>
      inputUrl(input).endsWith('/robots.txt') ? response('') : response(),
  });
  await ctx.fetch('https://manuals.example.com/one');
  await ctx.fetch('https://manuals.example.com/two');
  assert.ok(waits.includes(2000));
});

void test('three consecutive 403 responses block the source', async () => {
  const blocked: string[] = [];
  const ctx = new CrawlContext(source(), {
    fetchImpl: async (input) =>
      inputUrl(input).endsWith('/robots.txt') ? response('') : response('', 403),
    sleep: async () => {},
    onSourceBlocked: async (id) => {
      blocked.push(id);
    },
  });
  await assert.rejects(
    ctx.fetch('https://manuals.example.com/forbidden'),
    SourceBlockedError,
  );
  assert.deepEqual(blocked, ['test']);
});
