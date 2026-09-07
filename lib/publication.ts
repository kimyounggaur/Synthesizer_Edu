import { controls, MODEL_ID, PROFILE_ID, type Lesson } from './content';
import { validateLesson } from './engine';
export type ReviewEvidence = {
  modelId: string;
  firmware: string;
  panelVersion: string;
  evidenceUrl: string;
  rightsUrl: string;
  physicalChecked: boolean;
  independentChecked: boolean;
};
export function validateDraft(payload: unknown): string[] {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object')
    return ['콘텐츠 객체가 필요해요.'];
  const p = payload as Record<string, unknown>;
  if (p.schemaVersion !== 1) errors.push('스키마 버전이 맞지 않아요.');
  if (p.modelId !== MODEL_ID || p.profileId !== PROFILE_ID)
    errors.push('정확한 모델·프로필이 맞지 않아요.');
  if (p.hardwareVerified !== false || p.verification !== 'literature_checked')
    errors.push('실물 검수 상태를 초안에서 변경할 수 없어요.');
  if (!Array.isArray(p.lessons) || !p.lessons.length)
    return [...errors, '학습이 없어요.'];
  const ids = new Set<string>();
  for (const item of p.lessons) {
    if (!item || typeof item !== 'object') {
      errors.push('학습 형식 오류');
      continue;
    }
    const l = item as Lesson;
    if (typeof l.id !== 'string' || ids.has(l.id))
      errors.push('학습 ID 누락 또는 중복');
    ids.add(l.id);
    if (
      !Array.isArray(l.steps) ||
      !Array.isArray(l.sources) ||
      typeof l.recovery !== 'string'
    ) {
      errors.push('단계·출처·복구 계약 누락');
      continue;
    }
    try {
      errors.push(...validateLesson(l));
    } catch {
      errors.push('단계 필드 형식 오류');
    }
    if (l.risk !== 'R0') errors.push('현재 렌더러는 화면 연습(R0)만 지원해요.');
    for (const step of l.steps) {
      if (typeof step.body !== 'string' || typeof step.title !== 'string')
        errors.push('안내 문장 형식 오류');
      if (
        ![
          'press_once',
          'observe',
          'rotate',
          'slide',
          'hold_and_press',
          'hold',
          'double_press',
          'connect',
        ].includes(step.motion)
      )
        errors.push('허용되지 않은 조작');
      if (step.secondary && !controls.some((c) => c.id === step.secondary))
        errors.push('보조 컨트롤 모델 불일치');
    }
  }
  if (p.mode !== 'screen_practice')
    errors.push('실물 검수 전 패키지는 화면 연습으로만 미리볼 수 있어요.');
  return [...new Set(errors)];
}
export function publicationBlockers(
  payload: unknown,
  author: string,
  reviews: { reviewer: string; evidence: ReviewEvidence }[],
) {
  const errors = validateDraft(payload);
  if (!reviews.length) errors.push('실물 검수 기록과 독립 검토가 필요해요.');
  const independent = reviews.find(
    (r) =>
      r.reviewer !== author &&
      r.evidence.independentChecked === true &&
      r.evidence.physicalChecked === true &&
      r.evidence.modelId === MODEL_ID &&
      r.evidence.firmware.trim() &&
      r.evidence.panelVersion.trim() &&
      r.evidence.evidenceUrl.startsWith('https://') &&
      r.evidence.rightsUrl.startsWith('https://'),
  );
  if (!independent)
    errors.push(
      '작성자와 다른 검토자의 정확한 모델·펌웨어·패널·실물·권리 근거가 필요해요.',
    );
  return [...new Set(errors)];
}
