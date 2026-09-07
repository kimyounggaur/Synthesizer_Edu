import { json, runtime } from '@/lib/server';
export function GET() {
  return json({
    configured:
      Boolean(runtime().GOOGLE_VISION_API_KEY) &&
      runtime().OCR_DISABLED !== 'true',
    provider: 'Google Cloud Vision',
    retention: 'transient_processing_only',
    manualInputAvailable: true,
  });
}
