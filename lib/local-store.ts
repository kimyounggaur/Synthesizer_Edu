import type { Session } from './engine';
import { RELEASE_ID, MODEL_ID, PROFILE_ID, lessons, catalog } from './content';
import { initialSimulation } from './simulation';
export type Settings = {
  largeText: boolean;
  reducedMotion: boolean;
  readAloud: boolean;
  keepAwake: boolean;
  shared: boolean;
};
export type CoachData = {
  schemaVersion: 1;
  modelId: string | null;
  demo: boolean;
  session: Session | null;
  completed: Record<
    string,
    { at: string; hints: number; evidence: 'screen_practice_self_reported' }
  >;
  practiceCount: number;
  settings: Settings;
  offline: { releaseId: string; downloadedAt: string; hash: string } | null;
};
export const emptyData: CoachData = {
  schemaVersion: 1,
  modelId: null,
  demo: false,
  session: null,
  completed: {},
  practiceCount: 0,
  settings: {
    largeText: false,
    reducedMotion: false,
    readAloud: false,
    keepAwake: false,
    shared: false,
  },
  offline: null,
};
const DB = 'synth-coach-v1';
let database: Promise<IDBDatabase> | null = null;
export function sanitizeLocal(raw: unknown): CoachData {
  if (!raw || typeof raw !== 'object') return structuredClone(emptyData);
  const o = raw as Partial<CoachData>;
  if (
    o.schemaVersion !== 1 ||
    !o.settings ||
    typeof o.completed !== 'object' ||
    !o.completed
  )
    throw new Error('저장된 기록 형식을 읽을 수 없어요.');
  const settings = { ...emptyData.settings };
  for (const key of Object.keys(settings) as (keyof Settings)[])
    settings[key] = o.settings[key] === true;
  const completed: CoachData['completed'] = {};
  for (const lesson of lessons) {
    const row = o.completed[lesson.id];
    if (
      row?.evidence === 'screen_practice_self_reported' &&
      Number.isFinite(Date.parse(row.at))
    )
      completed[lesson.id] = {
        at: row.at,
        hints: Math.max(0, Math.min(1000, Number(row.hints) || 0)),
        evidence: 'screen_practice_self_reported',
      };
  }
  let session: Session | null = null;
  const saved = o.session;
  const lesson = lessons.find((l) => l.id === saved?.lessonId);
  if (
    saved &&
    lesson &&
    saved.releaseId === RELEASE_ID &&
    saved.modelId === MODEL_ID &&
    saved.profileId === PROFILE_ID &&
    saved.mode === 'screen_practice' &&
    Number.isInteger(saved.stepIndex) &&
    saved.stepIndex >= 0 &&
    saved.stepIndex < lesson.steps.length
  ) {
    const snapshot = saved.simulation;
    const validSnapshot =
      snapshot &&
      typeof snapshot.display === 'string' &&
      snapshot.display.length < 40 &&
      Number.isFinite(snapshot.dial) &&
      typeof snapshot.dual === 'boolean' &&
      typeof snapshot.split === 'boolean';
    session = {
      ...saved,
      simulation: validSnapshot ? snapshot : initialSimulation(saved.lessonId),
      status: saved.status === 'completed' ? 'completed' : 'recheck',
    };
  }
  return {
    schemaVersion: 1,
    modelId: catalog.some((m) => m.id === o.modelId) ? o.modelId! : null,
    demo: o.demo === true,
    session,
    completed,
    practiceCount: Math.max(0, Math.min(100000, Number(o.practiceCount) || 0)),
    settings,
    offline:
      o.offline?.releaseId === RELEASE_ID &&
      Number.isFinite(Date.parse(o.offline.downloadedAt))
        ? o.offline
        : null,
  };
}
function db() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('state');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => {
        database = null;
        reject(r.error);
      };
      r.onblocked = () =>
        reject(new Error('다른 탭의 저장소 작업이 끝나지 않았어요.'));
    });
  return database;
}
export async function readLocal(): Promise<CoachData> {
  const d = await db();
  const raw = await new Promise<unknown>((resolve, reject) => {
    const q = d
      .transaction('state', 'readonly')
      .objectStore('state')
      .get('coach');
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
  return sanitizeLocal(raw);
}

export async function writeLocal(value: CoachData) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction('state', 'readwrite');
    t.objectStore('state').put(value, 'coach');
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
export async function clearLocal() {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction('state', 'readwrite');
    t.objectStore('state').clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
export async function downloadDemo() {
  if (!('serviceWorker' in navigator) || !('caches' in window))
    throw new Error('이 브라우저는 오프라인 저장을 지원하지 않아요.');
  const r = await fetch('/api/demo/package', { cache: 'no-store' });
  if (!r.ok)
    throw new Error(
      '화면 연습 자료를 가져오지 못했어요. 연결 후 다시 시도해 주세요.',
    );
  const data = (await r.json()) as {
    payload: { releaseId: string; schemaVersion: number; mode: string };
    hash: string;
  };
  if (
    data.payload?.releaseId !== RELEASE_ID ||
    data.payload?.schemaVersion !== 1 ||
    data.payload?.mode !== 'screen_practice'
  )
    throw new Error('학습 자료 버전이 맞지 않아요.');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(data.payload)),
  );
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (hash !== data.hash)
    throw new Error(
      '다운로드한 자료를 검증하지 못했어요. 기존 자료는 유지됩니다.',
    );
  const registration = await navigator.serviceWorker.ready;
  const worker = registration.active;
  if (!worker)
    throw new Error(
      '오프라인 준비가 아직 끝나지 않았어요. 잠시 후 다시 시도해 주세요.',
    );
  const resources = performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .filter((x) => {
      const u = new URL(x);
      return (
        u.origin === location.origin &&
        !u.pathname.startsWith('/api/') &&
        !u.pathname.includes('admin') &&
        !u.pathname.includes('chatgpt')
      );
    });
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(
      () =>
        reject(new Error('저장 시간이 초과됐어요. 기존 자료는 유지됩니다.')),
      30000,
    );
    channel.port1.onmessage = (e) => {
      clearTimeout(timeout);
      channel.port1.close();
      if (e.data.ok) resolve();
      else reject(new Error(e.data.error || '저장 공간을 확인해 주세요.'));
    };
    worker.postMessage({ type: 'DOWNLOAD_DEMO', resources, package: data }, [
      channel.port2,
    ]);
  });
  return {
    releaseId: RELEASE_ID,
    downloadedAt: new Date().toISOString(),
    hash,
  };
}
export async function deleteOffline() {
  if ('caches' in window) {
    for (const key of await caches.keys())
      if (key.startsWith('synth-demo-')) await caches.delete(key);
  }
}
