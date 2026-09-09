declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    MANUAL_CACHE: R2Bucket;
    CRAWLER_INGEST_TOKEN?: string;
  }
}
