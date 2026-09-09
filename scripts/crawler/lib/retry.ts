export const MAX_RETRY_AFTER_MS = 15 * 60 * 1000;

export function parseRetryAfter(value: string | null, now = Date.now()): number {
  if (!value) return 60_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const at = Date.parse(value);
  if (!Number.isNaN(at)) {
    return Math.min(Math.max(0, at - now), MAX_RETRY_AFTER_MS);
  }
  return 60_000;
}

export function exponentialDelay(attempt: number): number {
  return Math.min(2 ** Math.max(1, attempt) * 1000, 32_000);
}
