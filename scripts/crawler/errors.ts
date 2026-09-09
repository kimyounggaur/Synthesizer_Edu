export class CrawlPolicyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly url?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BlockedHostError extends CrawlPolicyError {
  constructor(host: string, url?: string) {
    super('blocked_host', `허용 목록 밖의 호스트입니다: ${host}`, url);
  }
}

export class RobotsDisallowedError extends CrawlPolicyError {
  constructor(url: string) {
    super('robots_disallowed', `robots.txt가 수집을 허용하지 않습니다: ${url}`, url);
  }
}

export class BudgetExhaustedError extends CrawlPolicyError {
  constructor(host: string, url?: string) {
    super('budget_exhausted', `호스트 요청 예산을 모두 사용했습니다: ${host}`, url);
  }
}

export class SourceBlockedError extends CrawlPolicyError {
  constructor(sourceId: string, url?: string) {
    super(
      'source_blocked',
      `403 응답이 3회 연속 발생해 소스를 차단했습니다: ${sourceId}`,
      url,
      403,
    );
  }
}

export class RedirectBlockedError extends CrawlPolicyError {
  constructor(url: string) {
    super('redirect_blocked', `리다이렉트 대상이 허용되지 않습니다: ${url}`, url);
  }
}

export class TooManyRedirectsError extends CrawlPolicyError {
  constructor(url: string) {
    super('too_many_redirects', `리다이렉트가 5회를 넘었습니다: ${url}`, url);
  }
}

export class RequestTimeoutError extends CrawlPolicyError {
  constructor(url: string, timeoutMs: number) {
    super('timeout', `${timeoutMs}ms 안에 응답하지 않았습니다: ${url}`, url);
  }
}

export class SelectorDriftError extends CrawlPolicyError {
  constructor(sourceId: string, actual: number, minimum: number) {
    super(
      'selector_drift',
      `${sourceId} 헬스체크가 ${actual}건만 발견했습니다(최소 ${minimum}건).`,
    );
  }
}

export class InvalidSourceError extends CrawlPolicyError {
  constructor(message: string) {
    super('invalid_source', message);
  }
}
