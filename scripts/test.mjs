import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'synth-coach-tests-'));
for (const file of [
  'content',
  'simulation',
  'engine',
  'publication',
  'local-store',
]) {
  let input = await fs.readFile(`lib/${file}.ts`, 'utf8');
  input = input.replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'");
  const code = ts.transpileModule(input, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  }).outputText;
  await fs.writeFile(path.join(temp, file + '.mjs'), code);
}
const load = (file) =>
  import(pathToFileURL(path.join(temp, file + '.mjs')).href);
const content = await load('content');
const engine = await load('engine');
const pub = await load('publication');
const sim = await load('simulation');
const draft = {
  schemaVersion: 1,
  modelId: content.MODEL_ID,
  profileId: content.PROFILE_ID,
  releaseId: content.RELEASE_ID,
  mode: 'screen_practice',
  hardwareVerified: false,
  verification: 'literature_checked',
  lessons: content.lessons,
};
const local = await load('local-store');
test('reload preserves completed sessions, rejects out-of-range steps and restores simulated state', () => {
  const session = engine.createSession('dual');
  session.simulation.dual = true;
  const state = { ...structuredClone(local.emptyData), session };
  assert.equal(local.sanitizeLocal(state).session.simulation.dual, true);
  assert.equal(
    local.sanitizeLocal({
      ...state,
      session: { ...session, status: 'completed' },
    }).session.status,
    'completed',
  );
  assert.equal(
    local.sanitizeLocal({ ...state, session: { ...session, stepIndex: 999 } })
      .session,
    null,
  );
  assert.equal(
    local.sanitizeLocal({
      ...state,
      session: { ...session, releaseId: 'stale' },
    }).session,
    null,
  );
});
const evidence = {
  modelId: content.MODEL_ID,
  firmware: 'checked firmware',
  panelVersion: 'checked panel',
  evidenceUrl: 'https://example.org/hardware',
  rightsUrl: 'https://example.org/rights',
  physicalChecked: true,
  independentChecked: true,
};

test('catalog preserves model suffix and requires explicit confirmation', () => {
  assert.equal(
    engine.matchModels('Roland JUNO–DS61').candidates[0].id,
    content.MODEL_ID,
  );
  assert.equal(engine.matchModels('JUNO DS').candidates.length, 3);
  assert.equal(
    engine.matchModels('MODX6+').candidates[0].id,
    'yamaha_modx6_plus',
  );
  assert.equal(engine.normalizeModel('ＭＯＤＸ６＋'), 'MODX6+');
});
test('brand and numeric conflicts never produce a different model candidate', () => {
  for (const input of [
    'Yamaha JUNO-DS61',
    'Roland MODX6',
    'JUNO-DS610',
    'JUNO-DS99',
    'MODX68',
  ])
    assert.equal(engine.matchModels(input).candidates.length, 0, input);
});
test('unregistered models remain unsupported', () => {
  assert.equal(engine.matchModels('KORG NAUTILUS 61').status, 'no_match');
  assert.equal(engine.matchModels('').status, 'insufficient_text');
});
test('all eight lessons have valid unique controls and recovery contracts', () => {
  assert.equal(content.lessons.length, 8);
  assert.equal(content.helpTopics.length, 5);
  for (const l of content.lessons)
    assert.deepEqual(engine.validateLesson(l), []);
  assert.equal(
    new Set(content.controls.map((c) => c.id)).size,
    content.controls.length,
  );
  for (const c of content.controls) {
    assert(c.x >= 0 && c.y >= 0 && c.x + c.w <= 1 && c.y + c.h <= 1);
    assert.equal(c.actualBbox, null);
  }
  assert(content.controls.some((c) => c.label === 'KEYBOARD/ORGAN'));
  assert(content.controls.some((c) => c.label === 'ORCHESTRA'));
  assert(
    !content.controls.some(
      (c) =>
        c.id === 'side.power' ||
        c.label === 'CATEGORY' ||
        c.label === 'STRINGS',
    ),
  );
});
test('starting and returning from help require a state recheck', () => {
  let s = engine.createSession('piano');
  assert.equal(engine.transition(s, 'CONFIRM').stepIndex, 0);
  s = engine.transition(s, 'RECHECK');
  s = engine.transition(s, 'HELP');
  assert.equal(s.status, 'help');
  assert.equal(s.hints, 1);
  assert.equal(engine.transition(s, 'CONFIRM').stepIndex, 0);
  s = engine.transition(s, 'RETURN');
  assert.equal(s.status, 'recheck');
  s = engine.transition(s, 'RECHECK');
  s = engine.transition(s, 'CONFIRM');
  assert.equal(s.stepIndex, 1);
});
test('completion is possible only after all steps and the closing confirmation', () => {
  let s = engine.createSession('piano');
  s = engine.transition(s, 'RECHECK');
  assert.equal(engine.transition(s, 'FINISH').status, 'active');
  for (const step of content.lessons.find((l) => l.id === 'piano').steps) {
    assert(step);
    s = engine.transition(s, 'CONFIRM');
  }
  assert.equal(s.status, 'closing');
  s = engine.transition(s, 'FINISH');
  assert.equal(s.status, 'completed');
  assert.equal(s.completionEvidence, 'screen_practice_self_reported');
  assert.deepEqual(engine.transition(s, 'CONFIRM'), s);
});
test('wrong model and stale release cannot advance', () => {
  const active = engine.transition(engine.createSession('piano'), 'RECHECK');
  assert.equal(
    engine.transition({ ...active, modelId: 'other' }, 'CONFIRM').status,
    'recheck',
  );
  assert.equal(
    engine.transition({ ...active, releaseId: 'stale' }, 'CONFIRM').stepIndex,
    0,
  );
});
test('hardware gate requires every verified precondition', () => {
  const all = {
    modelConfirmed: true,
    exactModel: true,
    published: true,
    hardwareVerified: true,
    revoked: false,
    sharedEdited: false,
  };
  assert(engine.canStartHardware(all));
  for (const key of [
    'modelConfirmed',
    'exactModel',
    'published',
    'hardwareVerified',
  ])
    assert(!engine.canStartHardware({ ...all, [key]: false }));
  assert(!engine.canStartHardware({ ...all, revoked: true }));
  assert(!engine.canStartHardware({ ...all, sharedEdited: true }));
});
test('simulation has correct initial octave and transpose state, toggles stay observable', () => {
  assert.equal(sim.initialSimulation('octave').display, 'OCTAVE  0');
  assert.equal(sim.initialSimulation('transpose').display, 'TRANSPOSE  0');
  const lesson = content.lessons.find((l) => l.id === 'dual');
  let state = sim.initialSimulation('dual');
  assert.equal(state.dual, false);
  state = sim.applySimulation(state, lesson.steps[1], 'front.dual');
  assert.equal(state.dual, true);
  assert.equal(JSON.parse(JSON.stringify(state)).dual, true);
  state = sim.applySimulation(state, lesson.steps.at(-1), 'front.dual');
  assert.equal(state.dual, false);
});
test('draft structure accepts authored demos but rejects unsafe control and verification claims', () => {
  assert.deepEqual(pub.validateDraft(draft), []);
  assert(
    pub.validateDraft({
      ...draft,
      hardwareVerified: true,
      verification: 'hardware_verified',
    }).length,
  );
  const broken = structuredClone(draft);
  broken.lessons[0].steps[0].control = 'factory.reset';
  assert(pub.validateDraft(broken).length);
  assert(pub.validateDraft({ ...draft, mode: 'hardware' }).length);
});
test('author cannot self-approve, string booleans cannot satisfy independent physical review', () => {
  assert(pub.publicationBlockers(draft, 'author', []).length);
  assert(
    pub.publicationBlockers(draft, 'author', [{ reviewer: 'author', evidence }])
      .length,
  );
  assert(
    pub.publicationBlockers(draft, 'author', [
      {
        reviewer: 'reviewer',
        evidence: {
          ...evidence,
          physicalChecked: 'false',
          independentChecked: 'false',
        },
      },
    ]).length,
  );
  assert.deepEqual(
    pub.publicationBlockers(draft, 'author', [
      { reviewer: 'reviewer', evidence },
    ]),
    [],
  );
});

const workerCode = await fs.readFile('public/sw.js', 'utf8');
function workerHarness() {
  const cacheMap = new Map();
  const handlers = {};
  let fail = false;
  const normalize = (x) =>
    new URL(
      typeof x === 'string' ? x : x.url || x.href,
      'https://coach.example',
    ).href;
  const cacheStorage = {
    async open(name) {
      if (!cacheMap.has(name)) cacheMap.set(name, new Map());
      const entries = cacheMap.get(name);
      return {
        async match(key) {
          return entries.get(normalize(key))?.clone();
        },
        async put(key, value) {
          entries.set(normalize(key), value.clone());
        },
      };
    },
    async keys() {
      return [...cacheMap.keys()];
    },
    async delete(key) {
      return cacheMap.delete(key);
    },
  };
  const context = vm.createContext({
    self: {
      location: { origin: 'https://coach.example' },
      clients: { claim: async () => {} },
      addEventListener: (name, fn) => (handlers[name] = fn),
    },
    caches: cacheStorage,
    crypto,
    Response,
    URL,
    TextEncoder,
    Uint8Array,
    fetch: async () => {
      if (fail) throw new Error('offline');
      return new Response('APP_SHELL', { status: 200 });
    },
  });
  vm.runInContext(workerCode, context);
  return {
    cacheMap,
    cacheStorage,
    handlers,
    setFail(v) {
      fail = v;
    },
    async download(data) {
      let work = Promise.resolve();
      let result;
      handlers.message({
        data: {
          type: 'DOWNLOAD_DEMO',
          package: data,
          resources: ['https://coach.example/assets/app.js'],
        },
        ports: [{ postMessage: (r) => (result = r) }],
        waitUntil: (p) => (work = p),
      });
      await work;
      return result;
    },
    async navigate(url) {
      let work;
      handlers.fetch({
        request: { url, method: 'GET', mode: 'navigate' },
        respondWith: (p) => (work = p),
      });
      return Promise.resolve(work);
    },
  };
}
const offlinePayload = {
  schemaVersion: 1,
  mode: 'screen_practice',
  hardwareVerified: false,
  releaseId: content.RELEASE_ID,
};
const offlineHash = Array.from(
  new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(offlinePayload)),
    ),
  ),
)
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');
test('offline staging verifies hashes and preserves the last good cache on failure', async () => {
  const h = workerHarness();
  assert.equal(
    (await h.download({ payload: offlinePayload, hash: offlineHash })).ok,
    true,
  );
  const before = await (
    await (await h.cacheStorage.open('synth-demo-pointer')).match(
      '/__active_demo',
    )
  ).json();
  assert.equal(
    (await h.download({ payload: offlinePayload, hash: 'corrupt' })).ok,
    false,
  );
  h.setFail(true);
  assert.equal(
    (await h.download({ payload: offlinePayload, hash: offlineHash })).ok,
    false,
  );
  const after = await (
    await (await h.cacheStorage.open('synth-demo-pointer')).match(
      '/__active_demo',
    )
  ).json();
  assert.equal(before.name, after.name);
  assert(h.cacheMap.has(after.name));
  assert.equal(
    await (await h.navigate('https://coach.example/lesson/piano')).text(),
    'APP_SHELL',
  );
});
test('two concurrent offline downloads keep exactly one active complete cache', async () => {
  const h = workerHarness();
  const results = await Promise.all([
    h.download({ payload: offlinePayload, hash: offlineHash }),
    h.download({ payload: offlinePayload, hash: offlineHash }),
  ]);
  assert(results.every((r) => r.ok));
  const active = await (
    await (await h.cacheStorage.open('synth-demo-pointer')).match(
      '/__active_demo',
    )
  ).json();
  assert(h.cacheMap.has(active.name));
  assert.equal(
    [...h.cacheMap.keys()].filter((k) => k.startsWith('synth-demo-v1-')).length,
    1,
  );
});
test('offline cold start without a download is honest and admin APIs are never intercepted', async () => {
  const h = workerHarness();
  h.setFail(true);
  assert.match(
    await (await h.navigate('https://coach.example/lesson/piano')).text(),
    /저장된 화면 연습이 없어요/,
  );
  assert.equal(await h.navigate('https://coach.example/api/admin'), undefined);
  assert.equal(await h.navigate('https://coach.example/admin'), undefined);
});
