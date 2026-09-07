import { ApiError, runtime } from './server';
export async function extractText(bytes: Uint8Array): Promise<string> {
  const key = runtime().GOOGLE_VISION_API_KEY;
  if (!key || runtime().OCR_DISABLED === 'true')
    throw new ApiError(
      503,
      'OCR_NOT_CONFIGURED',
      '사진 인식 서비스 연결 전이에요. 모델명을 직접 입력해 주세요.',
    );
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 14000);
  try {
    const content = Buffer.from(bytes).toString('base64');
    const r = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({
        requests: [
          {
            image: { content },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
          },
        ],
      }),
      signal: timeout.signal,
    });
    if (!r.ok)
      throw new ApiError(
        503,
        'OCR_PROVIDER_UNAVAILABLE',
        '글자 인식 서비스가 응답하지 않아요. 사진 문제가 아니니 직접 입력으로 계속할 수 있어요.',
      );
    const data = (await r.json()) as {
      responses?: {
        error?: unknown;
        fullTextAnnotation?: { text?: string };
        textAnnotations?: { description?: string }[];
      }[];
    };
    if (data.responses?.[0]?.error)
      throw new ApiError(
        503,
        'OCR_PROVIDER_ERROR',
        '인식 서비스에서 사진을 처리하지 못했어요. 직접 입력으로 계속해 주세요.',
      );
    return (
      data.responses?.[0]?.fullTextAnnotation?.text ||
      data.responses?.[0]?.textAnnotations?.[0]?.description ||
      ''
    )
      .normalize('NFKC')
      .slice(0, 600);
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError')
      throw new ApiError(
        504,
        'OCR_TIMEOUT',
        '인식 시간이 초과됐어요. 다시 시도하거나 직접 입력해 주세요.',
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
