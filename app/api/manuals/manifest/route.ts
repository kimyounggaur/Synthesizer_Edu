import { ApiError, database, failure } from '@/lib/server';

type ManualRow = {
  id: string;
  model_id: string;
  app_model_id: string | null;
  canonical_name: string;
  doc_type: string;
  language: string;
  title: string;
  version: string | null;
  published_at: number | null;
  canonical_url: string;
  sha256: string;
  byte_size: number | null;
  page_count: number | null;
  status: string;
};

const DOC_PRIORITY = [
  'owners_manual',
  'reference_manual',
  'quick_start',
  'parameter_guide',
  'data_list',
  'midi_chart',
  'supplementary',
  'safety',
];

export async function GET(request: Request) {
  try {
    const requestedModel = new URL(request.url).searchParams.get('modelId');
    if (requestedModel && requestedModel.length > 100) {
      throw new ApiError(400, 'INVALID_MODEL_ID', '모델 ID가 너무 깁니다.');
    }
    const db = database();
    const visible = `(d.status='published' OR (
      d.status='stale' AND EXISTS (
        SELECT 1 FROM audit_log a
        WHERE a.release_id='manual:' || d.id AND a.action='manual_published'
      )
    ))`;
    const where = requestedModel
      ? `${visible} AND (m.id=? OR m.app_model_id=?)`
      : visible;
    const query = db.prepare(
      `SELECT d.id,d.model_id,m.app_model_id,m.canonical_name,d.doc_type,
        d.language,d.title,d.version,d.published_at,d.canonical_url,d.sha256,
        d.byte_size,d.page_count,d.status
       FROM manual_documents d
       JOIN manual_document_models dm ON dm.document_id=d.id
       JOIN models m ON m.id=dm.model_id
       WHERE ${where}`,
    );
    const result = requestedModel
      ? await query.bind(requestedModel, requestedModel).all<ManualRow>()
      : await query.all<ManualRow>();
    const documents = result.results
      .sort(
        (a, b) =>
          DOC_PRIORITY.indexOf(a.doc_type) - DOC_PRIORITY.indexOf(b.doc_type) ||
          a.language.localeCompare(b.language),
      )
      .map((row) => ({
        id: row.id,
        modelId: row.app_model_id ?? row.model_id,
        sourceModelId: row.model_id,
        modelName: row.canonical_name,
        docType: row.doc_type,
        language: row.language,
        title: row.title,
        version: row.version,
        publishedAt: row.published_at
          ? new Date(row.published_at).toISOString()
          : null,
        url: row.canonical_url,
        sha256: row.sha256,
        byteSize: row.byte_size,
        pageCount: row.page_count,
        status: row.status,
        stale: row.status === 'stale',
      }));
    return Response.json(
      { schemaVersion: 1, generatedAt: new Date().toISOString(), documents },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  } catch (error) {
    return failure(error);
  }
}
