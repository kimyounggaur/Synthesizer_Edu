import { BlockedHostError } from '../errors';
import type { SourceDefinition } from '../types';

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

export function allowedHosts(source: SourceDefinition): Set<string> {
  return new Set(
    [...source.hosts.base, ...source.hosts.assets].map(normalizeHost),
  );
}

export function assertAllowedUrl(
  input: string,
  source: SourceDefinition,
): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new BlockedHostError('invalid-url', input);
  }
  if (url.protocol !== 'https:') {
    throw new BlockedHostError(url.host || 'invalid-protocol', input);
  }
  const host = normalizeHost(url.hostname);
  if (!allowedHosts(source).has(host)) {
    throw new BlockedHostError(host, input);
  }
  if ((source.hosts.excluded ?? []).map(normalizeHost).includes(host)) {
    throw new BlockedHostError(host, input);
  }
  return url;
}
