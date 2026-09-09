import {
  BudgetExhaustedError,
  CrawlPolicyError,
  RedirectBlockedError,
  RequestTimeoutError,
  RobotsDisallowedError,
  SourceBlockedError,
  TooManyRedirectsError,
} from './errors';
import { assertAllowedUrl } from './lib/allowlist';
import {
  readRobotsCache,
  writeRobotsCache,
  type RobotsRules,
} from './lib/robots';
import { exponentialDelay, parseRetryAfter } from './lib/retry';
import type {
  CrawlContextLike,
  CrawlRequestOptions,
  SourceDefinition,
} from './types';

const DEFAULT_CONTACT =
  'https://github.com/kimyounggaur/Synthesizer_Edu/issues';
const BOT_INFO_URL = 'https://synth-coach.vercel.app/bot';

export function crawlerUserAgent(contact = process.env.CRAWLER_CONTACT_URL) {
  const safeContact = contact?.trim() || DEFAULT_CONTACT;
  return `SynthCoachBot/1.0 (+${BOT_INFO_URL}; contact=${safeContact})`;
}

type ContextOptions = {
  fetchImpl?: typeof globalThis.fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  userAgent?: string;
  onEvent?: (event: string, detail: Record<string, unknown>) => void;
  onSourceBlocked?: (sourceId: string, reason: string) => Promise<void> | void;
};

export class CrawlContext implements CrawlContextLike {
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private readonly userAgent: string;
  private readonly onEvent?: ContextOptions['onEvent'];
  private readonly onSourceBlocked?: ContextOptions['onSourceBlocked'];
  private readonly robots = new Map<string, RobotsRules>();
  private readonly remainingBudget = new Map<string, number>();
  private readonly lastRequestAt = new Map<string, number>();
  private readonly hostQueues = new Map<string, Promise<void>>();
  private readonly consecutive403 = new Map<string, number>();
  private _requestCount = 0;
  private _bytesFetched = 0;
  private _totalResponseMs = 0;

  constructor(
    public readonly source: SourceDefinition,
    options: ContextOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = options.now ?? Date.now;
    this.userAgent = options.userAgent ?? crawlerUserAgent();
    this.onEvent = options.onEvent;
    this.onSourceBlocked = options.onSourceBlocked;
  }

  get requestCount() {
    return this._requestCount;
  }

  get bytesFetched() {
    return this._bytesFetched;
  }

  get averageResponseMs() {
    return this._requestCount
      ? Math.round(this._totalResponseMs / this._requestCount)
      : 0;
  }

  isAllowedUrl(url: string): boolean {
    try {
      assertAllowedUrl(url, this.source);
      return true;
    } catch {
      return false;
    }
  }

  recordBytes(bytes: number) {
    if (Number.isFinite(bytes) && bytes > 0) this._bytesFetched += bytes;
  }

  async fetchText(
    url: string,
    options: CrawlRequestOptions = {},
  ): Promise<string> {
    const response = await this.fetch(url, {
      ...options,
      resource: options.resource ?? 'html',
    });
    if (!response.ok) {
      throw new CrawlPolicyError(
        'http_error',
        `${response.status} 응답: ${url}`,
        url,
        response.status,
      );
    }
    const text = await response.text();
    this.recordBytes(Buffer.byteLength(text));
    return text;
  }

  async fetchJson<T>(
    url: string,
    options: CrawlRequestOptions = {},
  ): Promise<T> {
    const response = await this.fetch(url, {
      ...options,
      resource: 'json',
      accept: 'application/json',
    });
    if (!response.ok) {
      throw new CrawlPolicyError(
        'http_error',
        `${response.status} 응답: ${url}`,
        url,
        response.status,
      );
    }
    const text = await response.text();
    this.recordBytes(Buffer.byteLength(text));
    return JSON.parse(text) as T;
  }

  async fetch(
    input: string,
    options: CrawlRequestOptions = {},
  ): Promise<Response> {
    if (this.source.status !== 'active') {
      throw new CrawlPolicyError(
        'source_inactive',
        `${this.source.id} 소스 상태가 ${this.source.status}입니다.`,
        input,
      );
    }
    const url = assertAllowedUrl(input, this.source);
    const host = url.hostname.toLowerCase();
    const rules = await this.getRobots(url);
    if (rules.isAllowed(url.href, this.userAgent) === false) {
      this.emit('robots_disallow', { url: url.href, host });
      if (rules.isAllowed(`${url.protocol}//${url.host}/`, this.userAgent) === false) {
        await this.blockSource('robots disallows the entire host');
      }
      throw new RobotsDisallowedError(url.href);
    }

    return this.enqueue(host, async () => {
      this.consumeBudget(host, url.href);
      const crawlDelay = rules.getCrawlDelay(this.userAgent);
      const configuredDelay =
        options.resource === 'pdf'
          ? Math.max(
              this.source.policy.pdfRateLimitMs ?? 5000,
              this.source.policy.rateLimitMs,
            )
          : this.source.policy.rateLimitMs;
      await this.throttle(
        host,
        Math.max(configuredDelay, (crawlDelay ?? 0) * 1000),
      );
      const headers = new Headers({
        'User-Agent': this.userAgent,
        'Accept-Language': 'en,ja;q=0.8,ko;q=0.6',
        Accept:
          options.accept ??
          (options.resource === 'pdf'
            ? 'application/pdf'
            : 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5'),
      });
      if (options.etag) headers.set('If-None-Match', options.etag);
      if (options.lastModified)
        headers.set('If-Modified-Since', options.lastModified);
      return this.requestWithPolicy(url, headers, options.resource ?? 'html');
    });
  }

  private emit(event: string, detail: Record<string, unknown>) {
    this.onEvent?.(event, detail);
  }

  private consumeBudget(host: string, url: string) {
    const left =
      this.remainingBudget.get(host) ?? this.source.policy.crawlBudget;
    if (left <= 0) throw new BudgetExhaustedError(host, url);
    this.remainingBudget.set(host, left - 1);
  }

  private async enqueue<T>(host: string, operation: () => Promise<T>) {
    const previous = this.hostQueues.get(host) ?? Promise.resolve();
    let release!: () => void;
    const marker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.catch(() => undefined).then(() => marker);
    this.hostQueues.set(host, queued);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.hostQueues.get(host) === queued) this.hostQueues.delete(host);
    }
  }

  private async throttle(host: string, minimumDelayMs: number) {
    const previous = this.lastRequestAt.get(host);
    if (previous !== undefined) {
      const wait = minimumDelayMs - (this.now() - previous);
      if (wait > 0) await this.sleep(wait);
    }
    this.lastRequestAt.set(host, this.now());
  }

  private async getRobots(target: URL): Promise<RobotsRules> {
    const host = target.hostname.toLowerCase();
    const inRun = this.robots.get(host);
    if (inRun) return inRun;
    const cached = readRobotsCache(host, this.now());
    if (cached) {
      this.robots.set(host, cached.rules);
      return cached.rules;
    }

    const robotsUrl = new URL('/robots.txt', target.origin);
    assertAllowedUrl(robotsUrl.href, this.source);
    const response = await this.requestWithPolicy(
      robotsUrl,
      new Headers({ 'User-Agent': this.userAgent, Accept: 'text/plain,*/*' }),
      'html',
      true,
    );
    const body = response.ok ? await response.text() : '';
    this.recordBytes(Buffer.byteLength(body));
    const entry = writeRobotsCache(
      host,
      robotsUrl.href,
      body,
      this.now(),
    );
    this.robots.set(host, entry.rules);
    this.emit('robots_checked', {
      host,
      status: response.status,
      allowsRoot:
        entry.rules.isAllowed(target.origin + '/', this.userAgent) !== false,
    });
    return entry.rules;
  }

  private async requestWithPolicy(
    initialUrl: URL,
    headers: Headers,
    resource: 'html' | 'pdf' | 'json',
    isRobots = false,
  ): Promise<Response> {
    let url = initialUrl;
    let redirects = 0;
    let serverAttempt = 0;
    let timeoutAttempt = 0;
    let retried429 = false;

    while (true) {
      const timeoutMs = resource === 'pdf' ? 300_000 : 30_000;
      let response: Response;
      try {
        this._requestCount += 1;
        const startedAt = this.now();
        response = await this.fetchImpl(url, {
          headers,
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        });
        this._totalResponseMs += Math.max(0, this.now() - startedAt);
      } catch (error) {
        timeoutAttempt += 1;
        if (timeoutAttempt < 3) {
          await this.sleep(exponentialDelay(timeoutAttempt));
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.emit('request_failed', { url: url.href, message });
        throw new RequestTimeoutError(url.href, timeoutMs);
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        redirects += 1;
        if (redirects > 5) throw new TooManyRedirectsError(url.href);
        const location = response.headers.get('location');
        if (!location) return response;
        const next = new URL(location, url);
        if (!this.isAllowedUrl(next.href)) {
          throw new RedirectBlockedError(next.href);
        }
        url = next;
        continue;
      }

      if (response.status === 403) {
        const count = (this.consecutive403.get(url.hostname) ?? 0) + 1;
        this.consecutive403.set(url.hostname, count);
        this.emit('http_403', { url: url.href, consecutive: count });
        if (count >= 3) {
          await this.blockSource('three consecutive 403 responses');
          throw new SourceBlockedError(this.source.id, url.href);
        }
        await this.sleep(exponentialDelay(count));
        continue;
      }
      this.consecutive403.set(url.hostname, 0);

      if (response.status === 429) {
        if (retried429) return response;
        retried429 = true;
        const wait = parseRetryAfter(response.headers.get('retry-after'), this.now());
        this.emit('rate_limited', { url: url.href, wait });
        await this.sleep(wait);
        continue;
      }

      if (response.status >= 500 && response.status <= 599) {
        serverAttempt += 1;
        if (serverAttempt >= 5) return response;
        const wait = exponentialDelay(serverAttempt);
        this.emit('server_retry', {
          url: url.href,
          status: response.status,
          attempt: serverAttempt,
          wait,
        });
        await this.sleep(wait);
        continue;
      }

      if (!isRobots) this.emit('request', { url: url.href, status: response.status });
      return response;
    }
  }

  private async blockSource(reason: string) {
    this.source.status = 'blocked';
    this.emit('source_blocked', { sourceId: this.source.id, reason });
    await this.onSourceBlocked?.(this.source.id, reason);
  }
}
