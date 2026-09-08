import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import { nitro } from 'nitro/vite';
import vinext from 'vinext';
import { fileURLToPath } from 'node:url';
import { defineConfig, normalizePath } from 'vite';
import hostingConfig from './.openai/hosting.json';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';
const isVercel = Boolean(process.env.VERCEL || process.env.NITRO_PRESET === 'vercel');

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    resolve: {
      dedupe: ['react', 'react-dom'],
      // `cloudflare:workers` is a native runtime module on Workers. On Vercel,
      // provide an empty binding object so storage-backed routes return their
      // existing STORAGE_UNAVAILABLE response rather than failing to boot.
      alias: isVercel
        ? {
            'cloudflare:workers': normalizePath(
              fileURLToPath(new URL('./lib/vercel-env.ts', import.meta.url)),
            ),
            tailwindcss: normalizePath(
              fileURLToPath(
                new URL('./node_modules/tailwindcss/index.css', import.meta.url),
              ),
            ),
            'tw-animate-css': normalizePath(
              fileURLToPath(
                new URL(
                  './node_modules/tw-animate-css/dist/tw-animate.css',
                  import.meta.url,
                ),
              ),
            ),
            'shadcn/tailwind.css': normalizePath(
              fileURLToPath(
                new URL('./node_modules/shadcn/dist/tailwind.css', import.meta.url),
              ),
            ),
          }
        : undefined,
    },
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      ...(isVercel
        ? [nitro()]
        : [
            cloudflare({
              viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
              config: localBindingConfig,
            }),
          ]),
    ],
  };
});
