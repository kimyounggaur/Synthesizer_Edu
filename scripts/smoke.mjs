import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const result = [];
async function check(name, fn) {
  await fn();
  result.push(name);
  console.log('PASS ' + name);
}
await check('Korean app shell responds', async () => {
  const r = await fetch(base);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /신디 코치|신디사이저/);
});
await check('Direct lesson route and PWA assets respond', async () => {
  for (const p of [
    '/lesson/piano',
    '/models',
    '/settings',
    '/manifest.webmanifest',
    '/sw.js',
    '/icon.svg',
  ])
    assert.equal((await fetch(base + p)).status, 200, p);
});
await check('Catalog rejects a conflicting manufacturer', async () => {
  const d = await (
    await fetch(
      base + '/api/models?q=' + encodeURIComponent('Yamaha JUNO-DS61'),
    )
  ).json();
  assert.equal(d.candidates.length, 0);
});
await check('Photo provider unavailable is reported honestly', async () => {
  const r = await fetch(base + '/api/identify/status');
  const d = await r.json();
  assert.equal(d.configured, false);
  const attempt = await fetch(base + '/api/identify', { method: 'POST' });
  assert.equal(attempt.status, 503);
  assert.equal((await attempt.json()).code, 'OCR_NOT_CONFIGURED');
});
await check('Cross origin mutations rejected before processing', async () => {
  const r = await fetch(base + '/api/models/confirm', {
    method: 'POST',
    headers: {
      Origin: 'https://untrusted.example',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      modelId: 'roland_juno_ds61',
      confirmed: true,
      suffix: '61',
    }),
  });
  assert.equal(r.status, 403);
});
await check(
  'Wrong suffix rejected and correct model remains unverified',
  async () => {
    const send = (suffix) =>
      fetch(base + '/api/models/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: 'roland_juno_ds61',
          confirmed: true,
          suffix,
        }),
      });
    assert.equal((await send('88')).status, 400);
    const r = await send('61');
    assert.equal(r.status, 200);
    assert.equal((await r.json()).hardwareLearningAllowed, false);
  },
);
await check('Protected admin and scan ownership fail closed', async () => {
  const r = await fetch(base + '/api/admin');
  assert([401, 403].includes(r.status));
  const scan = await fetch(base + '/api/identify/not-owned');
  assert.equal(scan.status, 404);
  const secret = await fetch(base + '/api/releases/non-published');
  assert.equal(secret.status, 404);
});
await check('Demo package hash matches its exact contents', async () => {
  const d = await (await fetch(base + '/api/demo/package')).json();
  assert.equal(d.payload.lessons.length, 8);
  assert.equal(d.payload.hardwareVerified, false);
  const actual = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(d.payload)),
      ),
    ),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  assert.equal(actual, d.hash);
});
await check(
  'Feedback validates referenced lesson and writes valid request',
  async () => {
    const post = (body) =>
      fetch(base + '/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    assert.equal(
      (
        await post({
          type: 'content_issue',
          lessonId: 'fake',
          stepId: 'fake',
          message: 'test',
        })
      ).status,
      400,
    );
    const r = await post({
      type: 'content_issue',
      lessonId: 'piano',
      stepId: 'piano',
      message: '[LOCAL SMOKE TEST] panel review request',
    });
    assert.equal(r.status, 201);
    assert.equal((await r.json()).saved, true);
  },
);
console.log(`${result.length} API smoke checks passed.`);
