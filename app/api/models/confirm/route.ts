import { catalog } from '@/lib/content';
import {
  ApiError,
  bodyJson,
  failure,
  guest,
  json,
  sameOrigin,
} from '@/lib/server';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const input = await bodyJson(request, 2000);
    const model = catalog.find((m) => m.id === input.modelId);
    if (!model || input.confirmed !== true || input.suffix !== model.suffix)
      throw new ApiError(
        400,
        'MODEL_CONFIRMATION_REQUIRED',
        '모델명 끝부분을 확인해 주세요.',
      );
    return json(
      {
        confirmed: true,
        modelId: model.id,
        learningStatus: 'preparing',
        hardwareLearningAllowed: false,
      },
      200,
      guest(request).headers,
    );
  } catch (e) {
    return failure(e);
  }
}
