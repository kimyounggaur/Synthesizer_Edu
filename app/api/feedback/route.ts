import {
  ApiError,
  bodyJson,
  database,
  failure,
  json,
  limit,
  sameOrigin,
} from '@/lib/server';
import { lessons } from '@/lib/content';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await limit(request, 'feedback', 12);
    const input = await bodyJson(request, 4000);
    if (
      !['model_request', 'content_issue'].includes(input.type) ||
      typeof input.message !== 'string' ||
      input.message.length > 500
    )
      throw new ApiError(
        400,
        'INVALID_FEEDBACK',
        '요청 내용을 500자 이내로 입력해 주세요.',
      );
    if (
      input.type === 'model_request' &&
      (typeof input.modelName !== 'string' || input.modelName.length > 100)
    )
      throw new ApiError(400, 'INVALID_MODEL', '모델명을 확인해 주세요.');
    if (
      input.type === 'content_issue' &&
      !lessons.some(
        (l) =>
          l.id === input.lessonId && l.steps.some((s) => s.id === input.stepId),
      )
    )
      throw new ApiError(400, 'INVALID_STEP', '학습 단계를 확인해 주세요.');
    const id = crypto.randomUUID();
    await database()
      .prepare(
        'INSERT INTO feedback(id,type,model_name,lesson_id,step_id,message,created_at) VALUES (?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        input.type,
        input.modelName || null,
        input.lessonId || null,
        input.stepId || null,
        input.message,
        new Date().toISOString(),
      )
      .run();
    return json({ id, saved: true }, 201);
  } catch (e) {
    return failure(e);
  }
}
