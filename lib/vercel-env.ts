/**
 * Vercel has no Cloudflare binding namespace. Keeping this adapter small lets
 * the app's existing database guard return a clear 503 for storage-backed
 * endpoints until a Vercel-compatible database is connected.
 */
export const env = process.env;
