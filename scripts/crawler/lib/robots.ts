import robotsParser from 'robots-parser';

export const ROBOTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type RobotsRules = ReturnType<typeof robotsParser>;
export type RobotsCacheEntry = { rules: RobotsRules; checkedAt: number };

const processCache = new Map<string, RobotsCacheEntry>();

export function readRobotsCache(host: string, now: number) {
  const entry = processCache.get(host);
  if (!entry || now - entry.checkedAt >= ROBOTS_CACHE_TTL_MS) return undefined;
  return entry;
}

export function writeRobotsCache(
  host: string,
  robotsUrl: string,
  body: string,
  checkedAt: number,
) {
  const entry = { rules: robotsParser(robotsUrl, body), checkedAt };
  processCache.set(host, entry);
  return entry;
}

export function clearRobotsCacheForTests() {
  processCache.clear();
}
