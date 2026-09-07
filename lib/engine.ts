import {
  catalog,
  controls,
  lessons,
  MODEL_ID,
  PROFILE_ID,
  RELEASE_ID,
  type Lesson,
} from './content';
import { initialSimulation, type Simulation } from './simulation';
export function normalizeModel(text: string) {
  return text
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9+]/g, '');
}
export function matchModels(text: string) {
  const normalized = normalizeModel(text);
  const brands = ['ROLAND', 'YAMAHA'].filter((b) => normalized.includes(b));
  const brand = brands[0];
  const q = normalized.replace(/ROLAND|YAMAHA/g, '');
  const empty = (status: string) => ({
    candidates: [] as (typeof catalog)[number][],
    status,
    text: text.slice(0, 180),
  });
  if (
    brands.length > 1 ||
    (brand === 'YAMAHA' && q.includes('JUNO')) ||
    (brand === 'ROLAND' && q.includes('MODX'))
  )
    return empty('brand_conflict');
  if (!q && !brand) return empty('insufficient_text');
  if (/^JUNODS\d/.test(q) && !/^JUNODS(?:6|7|8|61|76|88)$/.test(q))
    return empty('no_match');
  if (/^MODX\d/.test(q) && !/^MODX[678](?:\+|PLUS)?$/.test(q))
    return empty('no_match');
  const allowed = catalog.filter(
    (m) => !brand || m.brand.toUpperCase() === brand,
  );
  const exact = allowed.filter((m) =>
    [m.name, ...m.aliases].some((a) => normalizeModel(a) === q),
  );
  const related = allowed.filter(
    (m) => !q || normalizeModel(m.name).startsWith(q),
  );
  const candidates = [
    ...exact,
    ...related.filter((m) => !exact.includes(m)),
  ].slice(0, 3);
  return {
    candidates,
    status:
      exact.length === 1
        ? 'exact_match'
        : candidates.length
          ? 'needs_confirmation'
          : 'no_match',
    text: text.slice(0, 180),
  };
}
export type Session = {
  modelId: string;
  profileId: string;
  releaseId: string;
  lessonId: string;
  stepIndex: number;
  status: 'recheck' | 'active' | 'help' | 'closing' | 'completed';
  mode: 'screen_practice';
  hints: number;
  updatedAt: string;
  simulation: Simulation;
  completionEvidence?: 'screen_practice_self_reported';
};
export function createSession(lessonId: string): Session {
  return {
    modelId: MODEL_ID,
    profileId: PROFILE_ID,
    releaseId: RELEASE_ID,
    lessonId,
    stepIndex: 0,
    status: 'recheck',
    mode: 'screen_practice',
    hints: 0,
    updatedAt: new Date().toISOString(),
    simulation: initialSimulation(lessonId),
  };
}
export function transition(
  s: Session,
  event: 'RECHECK' | 'CONFIRM' | 'HELP' | 'RETURN' | 'PREVIOUS' | 'FINISH',
  override?: Lesson,
): Session {
  const lesson = override || lessons.find((l) => l.id === s.lessonId);
  if (
    !lesson ||
    s.releaseId !== RELEASE_ID ||
    s.profileId !== PROFILE_ID ||
    s.modelId !== MODEL_ID
  )
    return { ...s, status: 'recheck' };
  const next = { ...s, updatedAt: new Date().toISOString() };
  if (event === 'HELP') return { ...next, status: 'help', hints: s.hints + 1 };
  if (event === 'RETURN') return { ...next, status: 'recheck' };
  if (event === 'RECHECK' && s.status === 'recheck')
    return { ...next, status: 'active' };
  if (event === 'PREVIOUS' && s.status === 'active')
    return {
      ...next,
      stepIndex: Math.max(0, s.stepIndex - 1),
      status: 'recheck',
    };
  if (event === 'CONFIRM' && s.status === 'active')
    return s.stepIndex === lesson.steps.length - 1
      ? { ...next, status: 'closing' }
      : { ...next, stepIndex: s.stepIndex + 1 };
  if (event === 'FINISH' && s.status === 'closing')
    return {
      ...next,
      status: 'completed',
      completionEvidence: 'screen_practice_self_reported',
    };
  return s;
}
export function validateLesson(l: Lesson) {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const s of l.steps) {
    if (ids.has(s.id)) errors.push(`중복 단계: ${s.id}`);
    ids.add(s.id);
    if (!controls.some((c) => c.id === s.control))
      errors.push(`없는 컨트롤: ${s.control}`);
    if (s.secondary && !controls.some((c) => c.id === s.secondary))
      errors.push(`없는 보조 컨트롤: ${s.secondary}`);
    if (!s.expected || !s.confirm || !s.sourcePage)
      errors.push(`확인·출처 누락: ${s.id}`);
  }
  if (!l.recovery || !l.sources.length) errors.push('복구·출처 누락');
  if (!l.steps.length) errors.push('단계 없음');
  return errors;
}
export function canStartHardware(o: {
  modelConfirmed: boolean;
  exactModel: boolean;
  published: boolean;
  hardwareVerified: boolean;
  revoked: boolean;
  sharedEdited: boolean;
}) {
  return (
    o.modelConfirmed &&
    o.exactModel &&
    o.published &&
    o.hardwareVerified &&
    !o.revoked &&
    !o.sharedEdited
  );
}
