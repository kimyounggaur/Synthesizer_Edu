const VERSION = 'synth-demo-v1';
const POINTER = 'synth-demo-pointer';
let downloadQueue = Promise.resolve();
self.addEventListener('install', () => {});
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
);

async function activeCache() {
  const pointer = await caches.open(POINTER);
  const record = await pointer.match('/__active_demo');
  return record ? caches.open((await record.json()).name) : null;
}

async function download(event) {
  const name = VERSION + '-' + crypto.randomUUID();
  let activated = false;
  try {
    const data = event.data.package;
    if (
      data.payload?.mode !== 'screen_practice' ||
      data.payload?.schemaVersion !== 1 ||
      data.payload?.hardwareVerified !== false
    )
      throw new Error('자료 형식이 맞지 않아요.');
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(JSON.stringify(data.payload)),
        ),
      ),
    )
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (hash !== data.hash) throw new Error('학습 자료 검증에 실패했어요.');
    const cache = await caches.open(name);
    const resources = [
      ...new Set([
        '/',
        '/icon.svg',
        '/manifest.webmanifest',
        ...event.data.resources,
      ]),
    ]
      .map((x) => new URL(x, self.location.origin))
      .filter(
        (u) =>
          u.origin === self.location.origin &&
          !u.pathname.startsWith('/api/') &&
          !u.pathname.includes('admin') &&
          !u.pathname.includes('chatgpt') &&
          u.pathname !== '/sw.js',
      );
    for (const url of resources) {
      const response = await fetch(url, { cache: 'reload' });
      if (!response.ok)
        throw new Error(
          '일부 자료를 저장하지 못했어요. 기존 자료는 유지됩니다.',
        );
      await cache.put(url, response);
    }
    await cache.put('/__demo_package', Response.json(data));
    const pointer = await caches.open(POINTER);
    await pointer.put(
      '/__active_demo',
      Response.json({
        name,
        downloadedAt: new Date().toISOString(),
        releaseId: data.payload.releaseId,
      }),
    );
    activated = true;
    // This cleanup runs inside the same queue as staging and activation.
    try {
      for (const key of await caches.keys())
        if (key.startsWith(VERSION + '-') && key !== name)
          await caches.delete(key);
    } catch {
      /* A stale cache is harmless; the active cache must survive. */
    }
    event.ports[0]?.postMessage({ ok: true });
  } catch (error) {
    if (!activated) await caches.delete(name);
    event.ports[0]?.postMessage({
      ok: false,
      error: error.message || '저장 공간이 부족해요. 기존 자료는 유지됩니다.',
    });
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'DOWNLOAD_DEMO') return;
  const work = downloadQueue.then(() => download(event));
  downloadQueue = work.catch(() => {});
  event.waitUntil(work);
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('admin') ||
    url.pathname.includes('chatgpt') ||
    url.pathname === '/sw.js'
  )
    return;
  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await activeCache();
        if (cache) {
          const exact = await cache.match(request);
          if (exact) return exact;
          if (request.mode === 'navigate') {
            const shell = await cache.match('/');
            if (shell) return shell;
          }
        }
        if (request.mode === 'navigate')
          return new Response(
            '<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width, initial-scale=1"><title>오프라인 · 신디 코치</title><body style="font-family:sans-serif;padding:32px;line-height:1.8"><h1>저장된 화면 연습이 없어요.</h1><p>인터넷 연결 후 설정에서 화면 연습 자료를 내려받아 주세요.</p><a href="/">다시 연결하기</a></body></html>',
            { headers: { 'Content-Type': 'text/html;charset=utf-8' } },
          );
        return new Response('Offline', { status: 503 });
      }
    })(),
  );
});
