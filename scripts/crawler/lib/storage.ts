import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  readdir,
} from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { CrawlContext } from '../context';
import type { FetchMetadata, NormalizedDocument } from '../types';
import { sha256 as hashBytes } from './hash';

const DEFAULT_CACHE_ROOT = fileURLToPath(
  new URL('../../../.cache/manuals/', import.meta.url),
);
const MAX_FILE_BYTES = 500_000_000;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export type CachedFile = {
  key: string;
  path?: string;
  bytes?: Uint8Array;
  size: number;
  sha256: string;
  metadata: FetchMetadata;
};

function responseMetadata(response: Response): FetchMetadata {
  return {
    status: response.status,
    etag: response.headers.get('etag') ?? undefined,
    lastModified: response.headers.get('last-modified') ?? undefined,
    contentType: response.headers.get('content-type') ?? undefined,
    contentLength: Number(response.headers.get('content-length')) || undefined,
    finalUrl: response.url,
  };
}

export async function downloadDocument(
  document: NormalizedDocument,
  ctx: CrawlContext,
  options: {
    dryRun: boolean;
    cacheRoot?: string;
    etag?: string;
    lastModified?: string;
  },
): Promise<
  | CachedFile
  | { notModified: true; metadata: FetchMetadata }
  | { missing: true; metadata: FetchMetadata }
> {
  const response = await ctx.fetch(document.canonicalUrl, {
    resource: document.mimeType === 'application/pdf' ? 'pdf' : 'html',
    etag: options.etag,
    lastModified: options.lastModified,
  });
  const metadata = responseMetadata(response);
  if (response.status === 304) return { notModified: true, metadata };
  if (response.status === 404) {
    return { missing: true, metadata };
  }
  if (!response.ok) {
    throw new Error(`${response.status} while downloading ${document.canonicalUrl}`);
  }
  if (!response.body) throw new Error(`empty response body: ${document.canonicalUrl}`);

  const extension = document.mimeType === 'application/pdf' ? '.pdf' : '.html';
  const key = `${document.sourceId}/${document.id}${extension}`;
  if (options.dryRun) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('manual exceeds 500MB');
    ctx.recordBytes(bytes.byteLength);
    return {
      key,
      bytes,
      size: bytes.byteLength,
      sha256: hashBytes(bytes),
      metadata,
    };
  }

  const root = options.cacheRoot ?? DEFAULT_CACHE_ROOT;
  const directory = `${root}/${document.sourceId}`;
  const finalPath = `${root}/${key}`;
  const partialPath = `${finalPath}.part`;
  await mkdir(directory, { recursive: true });
  await rm(partialPath, { force: true });
  let size = 0;
  const hash = createHash('sha256');
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.byteLength;
      if (size > MAX_FILE_BYTES) {
        callback(new Error('manual exceeds 500MB'));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(response.body as never),
      meter,
      createWriteStream(partialPath, { flags: 'wx' }),
    );
    await rename(partialPath, finalPath);
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  }
  ctx.recordBytes(size);
  return {
    key,
    path: finalPath,
    size,
    sha256: hash.digest('hex'),
    metadata,
  };
}

export async function readCachedBytes(file: CachedFile): Promise<Uint8Array> {
  if (file.bytes) return file.bytes;
  if (!file.path) throw new Error('cache file has no bytes or path');
  return new Uint8Array(await readFile(file.path));
}

export async function deleteCachedFile(file: CachedFile) {
  if (file.path) await rm(file.path, { force: true });
  file.bytes = undefined;
}

export async function pruneLocalCache(
  root = DEFAULT_CACHE_ROOT,
  now = Date.now(),
) {
  let entries;
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch {
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.endsWith('.part')) continue;
    const path = `${entry.parentPath}/${entry.name}`;
    const metadata = await stat(path);
    if (now - metadata.mtimeMs > RETENTION_MS) {
      await rm(path, { force: true });
      removed += 1;
    }
  }
  return removed;
}

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export function r2ConfigFromEnv(): R2Config | undefined {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return undefined;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

function r2Client(config: R2Config) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/** Uploads without ACL/public settings. The bucket must remain private. */
export async function uploadPrivateR2(file: CachedFile, config: R2Config) {
  const body = file.path ? createReadStream(file.path) : Buffer.from(file.bytes ?? []);
  await r2Client(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: file.key,
      Body: body,
      ContentType: file.key.endsWith('.pdf') ? 'application/pdf' : 'text/html',
      Metadata: { sha256: file.sha256, retention: '90-days' },
    }),
  );
}

export async function deletePrivateR2(key: string, config: R2Config) {
  await r2Client(config).send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
  );
}
