'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ShieldCheck,
  ExternalLink,
  Save,
  CheckCircle2,
  LockKeyhole,
  RefreshCw,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MODEL_ID, lessons, type Lesson } from '@/lib/content';
import { LessonScreen } from './lesson-screen';
import { emptyData, type CoachData } from '@/lib/local-store';
type AdminData = {
  user: { email: string };
  releases: {
    id: string;
    status: string;
    revision: number;
    updated_at: string;
  }[];
  feedback: {
    id: string;
    type: string;
    message: string;
    model_name?: string;
  }[];
  audit: { action: string; release_id: string; created_at: string }[];
  manuals: {
    id: string;
    status: string;
    title: string;
    doc_type: string;
    language: string;
    version?: string;
    canonical_url: string;
    canonical_name: string;
    source_id: string;
    display_name: string;
    affected_content: string;
  }[];
  crawlIssues: {
    id: string;
    source_id: string;
    document_id?: string;
    url?: string;
    reasons: string;
    created_at: number;
  }[];
  draft: unknown;
};
export function AdminScreen({ go }: { go: (p: string) => void }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('draft');
  const [release, setRelease] = useState<{
    id: string;
    revision: number;
  } | null>(null);
  const [evidence, setEvidence] = useState({
    modelId: MODEL_ID,
    firmware: '',
    panelVersion: '',
    evidenceUrl: '',
    rightsUrl: '',
    physicalChecked: false,
    independentChecked: false,
  });
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<Lesson | null>(null);
  const [previewData, setPreviewData] = useState<CoachData>(emptyData);
  const updatePreview = useCallback(
    (fn: (d: CoachData) => CoachData) => setPreviewData(fn),
    [],
  );
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin', { cache: 'no-store' });
      const d = (await r.json()) as AdminData & { message: string };
      if (!r.ok) throw new Error(d.message);
      setData(d);
      setSource((previous) => previous || JSON.stringify(d.draft, null, 2));
      setError('');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '검수 서비스를 불러오지 못했어요.',
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function action(type: string, id?: string) {
    setBusy(true);
    setMessage('처리 중…');
    try {
      const payload =
        type === 'save' || type === 'validate' ? JSON.parse(source) : undefined;
      const r = await fetch('/api/admin/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: type,
          payload,
          id: id || release?.id,
          revision: release?.revision,
          evidence,
          reason,
        }),
      });
      const d = (await r.json()) as {
        message: string;
        errors?: string[];
        id: string;
        revision: number;
        valid: boolean;
      };
      if (!r.ok) {
        setMessage([d.message, ...(d.errors || [])].join('\n'));
        return;
      }
      if (type === 'save') setRelease({ id: d.id, revision: d.revision });
      setMessage(
        type === 'validate'
          ? d.valid
            ? '콘텐츠 구조 검사를 통과했어요. 실물·독립 검수와 게시 승인은 별도입니다.'
            : (d.errors || []).join('\n')
          : type === 'save'
            ? '미게시 초안을 저장했어요.'
            : type === 'review'
              ? '독립 검수 기록을 저장했어요.'
              : type === 'publish'
                ? '검수한 화면 연습 버전을 게시했어요.'
                : '자료를 회수했어요.',
      );
      await load();
    } catch (e) {
      setMessage(
        e instanceof SyntaxError
          ? 'JSON 문법을 확인해 주세요.'
          : '작업을 완료하지 못했어요.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function manualAction(
    type: 'verify' | 'publish' | 'reject' | 'takedown' | 'suspend_source',
    manual: AdminData['manuals'][number],
  ) {
    setBusy(true);
    setMessage('매뉴얼 상태를 처리하는 중…');
    try {
      const response = await fetch('/api/admin/manuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: type,
          id: manual.id,
          sourceId: manual.source_id,
          reason,
        }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || '작업을 완료하지 못했어요.');
      setMessage('매뉴얼 검수 상태와 감사 기록을 갱신했어요.');
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '작업을 완료하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }
  if (preview)
    return (
      <>
        <div className="demo-banner">
          <b>미게시 초안 미리보기 · 화면 연습</b>
        </div>
        <LessonScreen
          key={preview.id}
          id={preview.id}
          lessonOverride={preview}
          data={previewData}
          update={updatePreview}
          go={() => setPreview(null)}
        />
        <button className="text-button" onClick={() => setPreview(null)}>
          초안 편집으로 돌아가기
        </button>
      </>
    );
  if (!data)
    return (
      <div className="narrow-screen">
        <button className="back-button" onClick={() => go('/settings')}>
          <ArrowLeft size={18} />
          설정으로
        </button>
        <div className="empty-state">
          <LockKeyhole size={40} />
          <h1>콘텐츠 검수</h1>
          <p>{error || '검수 권한을 확인하는 중…'}</p>
          {error && (
            <>
              <a
                href="/signin-with-chatgpt?return_to=%2Fadmin"
                target="_top"
                className="primary-button"
              >
                관리자 계정으로 로그인
              </a>
              <button className="outline-button" onClick={load}>
                <RefreshCw size={17} />
                다시 확인
              </button>
            </>
          )}
        </div>
      </div>
    );
  return (
    <div className="admin-screen">
      <div className="demo-banner">
        <ShieldCheck size={18} />
        <b>미게시 초안 · 실물 검수 전</b>
      </div>
      <div className="page-eyebrow">콘텐츠 검수</div>
      <h1>확인한 안내만, 차근차근.</h1>
      <p className="page-description">
        {data.user.email} · 검수 결과는 작업자와 함께 기록됩니다.
      </p>
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList className="mode-tabs">
          <TabsTrigger value="draft">초안 편집</TabsTrigger>
          <TabsTrigger value="review">검수·게시</TabsTrigger>
          <TabsTrigger value="manuals">매뉴얼 검수</TabsTrigger>
          <TabsTrigger value="feedback">지원·피드백</TabsTrigger>
          <TabsTrigger value="audit">변경 기록</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'draft' ? (
        <>
          <p className="notice-box">
            현재 렌더러는 화면 연습(R0)을 지원합니다. 실제 악기의 조작 안내는
            실물 검수와 별도 출시 검증 전까지 게시하지 않습니다.
          </p>
          <div className="admin-preview-links">
            {lessons.map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  try {
                    const parsed = JSON.parse(source) as { lessons: Lesson[] };
                    const selected = parsed.lessons.find(
                      (row) => row.id === l.id,
                    );
                    if (selected) {
                      setPreviewData(emptyData);
                      setPreview(selected);
                    }
                  } catch {
                    setMessage('JSON 형식을 확인해 주세요.');
                  }
                }}
              >
                {l.code} 미리보기
                <ExternalLink size={13} />
              </button>
            ))}
          </div>
          <label className="json-editor-label">
            구조화된 학습 초안
            <textarea
              className="json-editor"
              aria-label="학습 초안 JSON"
              spellCheck={false}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>
          <div className="button-row">
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => action('validate')}
            >
              <CheckCircle2 size={18} />
              자동 검사
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => action('save')}
            >
              <Save size={18} />
              미게시 초안 저장
            </button>
          </div>
          {release && (
            <p className="small-note">
              현재 초안 · {release.id} · 수정 {release.revision}
            </p>
          )}
        </>
      ) : tab === 'review' ? (
        <>
          <p className="notice-box">
            작성자와 다른 검토자가 정확한 모델·펌웨어·패널에서 재현한 증거를
            기록해야 합니다. 체크 표시만으로 검수 결과를 자동 생성하지 않습니다.
          </p>
          <div className="review-form">
            {(
              [
                { key: 'firmware', label: '검수한 펌웨어' },
                { key: 'panelVersion', label: '검수한 패널 버전' },
                { key: 'evidenceUrl', label: '실물 검수 기록 URL (HTTPS)' },
                { key: 'rightsUrl', label: '도해·자료 권리 확인 URL (HTTPS)' },
              ] as const
            ).map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  value={evidence[f.key]}
                  onChange={(e) =>
                    setEvidence((x) => ({ ...x, [f.key]: e.target.value }))
                  }
                />
              </label>
            ))}
            <label className="check-row">
              <Checkbox
                checked={evidence.physicalChecked}
                onCheckedChange={(v) =>
                  setEvidence((x) => ({ ...x, physicalChecked: Boolean(v) }))
                }
              />
              <span>정확한 실물 악기에서 직접 확인했습니다.</span>
            </label>
            <label className="check-row">
              <Checkbox
                checked={evidence.independentChecked}
                onCheckedChange={(v) =>
                  setEvidence((x) => ({ ...x, independentChecked: Boolean(v) }))
                }
              />
              <span>작성자와 독립된 검토를 수행했습니다.</span>
            </label>
          </div>
          <label className="review-reason">
            회수 사유 (회수할 때만)
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="어떤 문제로 자료를 회수하는지 기록"
            />
          </label>
          <div className="release-list">
            {data.releases.length ? (
              data.releases.map((r) => (
                <section key={r.id}>
                  <span className="pill">{r.status}</span>
                  <code>{r.id}</code>
                  <span>수정 {r.revision}</span>
                  <div className="button-row">
                    <button
                      className="outline-button"
                      disabled={busy || r.status !== 'draft'}
                      onClick={() => action('review', r.id)}
                    >
                      검수 기록
                    </button>
                    <button
                      className="outline-button"
                      disabled={busy || r.status !== 'draft'}
                      onClick={() => action('publish', r.id)}
                    >
                      검사 후 게시
                    </button>
                    <button
                      className="outline-button danger"
                      disabled={busy || r.status === 'revoked'}
                      onClick={() => action('revoke', r.id)}
                    >
                      회수
                    </button>
                  </div>
                </section>
              ))
            ) : (
              <p className="empty-state">
                저장된 초안이 없어요. 초안 편집에서 먼저 저장해 주세요.
              </p>
            )}
          </div>
        </>
      ) : tab === 'manuals' ? (
        <>
          <p className="notice-box">
            크롤러는 초안만 만듭니다. 공식 링크·모델·언어를 확인한 관리자와 다른
            관리자가 게시해야 공개 매니페스트에 포함됩니다.
          </p>
          <label className="review-reason">
            검수·게시·중단 사유 (필수)
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="확인한 근거나 처리 사유를 5자 이상 기록"
            />
          </label>
          <div className="release-list">
            {data.manuals.length ? (
              data.manuals.map((manual) => (
                <section key={manual.id}>
                  <span className="pill">{manual.status}</span>
                  <strong>{manual.canonical_name}</strong>
                  <h3>{manual.title}</h3>
                  <p>
                    {manual.display_name} · {manual.doc_type} · {manual.language}
                    {manual.version ? ` · ${manual.version}` : ''}
                  </p>
                  {manual.status === 'stale' && manual.affected_content && (
                    <p className="notice-box">
                      개정 영향 학습: {manual.affected_content}
                    </p>
                  )}
                  <a href={manual.canonical_url} target="_blank" rel="noreferrer">
                    공식 원문 확인 <ExternalLink size={14} />
                  </a>
                  <div className="button-row">
                    <button
                      className="outline-button"
                      disabled={busy || !['draft', 'stale'].includes(manual.status)}
                      onClick={() => manualAction('verify', manual)}
                    >
                      URL·매칭 검증
                    </button>
                    <button
                      className="outline-button"
                      disabled={busy || manual.status !== 'verified'}
                      onClick={() => manualAction('publish', manual)}
                    >
                      독립 검토 후 게시
                    </button>
                    <button
                      className="outline-button danger"
                      disabled={busy}
                      onClick={() => manualAction('reject', manual)}
                    >
                      반려
                    </button>
                    <button
                      className="outline-button danger"
                      disabled={busy}
                      onClick={() => manualAction('takedown', manual)}
                    >
                      게시 중단·원본 캐시 삭제
                    </button>
                  </div>
                </section>
              ))
            ) : (
              <p className="empty-state">검수할 매뉴얼 초안이 없어요.</p>
            )}
          </div>
          {data.crawlIssues.length > 0 && (
            <div className="admin-records">
              <h2>자동 게이트 보류</h2>
              {data.crawlIssues.map((issue) => (
                <article key={issue.id}>
                  <span className="pill">needs_review</span>
                  <strong>{issue.source_id}</strong>
                  <p>{issue.reasons}</p>
                  {issue.url && (
                    <a href={issue.url} target="_blank" rel="noreferrer">
                      후보 링크 확인 <ExternalLink size={14} />
                    </a>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      ) : tab === 'feedback' ? (
        <div className="admin-records">
          {data.feedback.length ? (
            data.feedback.map((f) => (
              <article key={f.id}>
                <span className="pill">
                  {f.type === 'model_request'
                    ? '모델 지원 요청'
                    : '콘텐츠 검토 요청'}
                </span>
                <h3>{f.model_name || '학습 콘텐츠'}</h3>
                <p>{f.message || '추가 설명 없음'}</p>
              </article>
            ))
          ) : (
            <p className="empty-state">새로운 요청이 없어요.</p>
          )}
        </div>
      ) : (
        <div className="admin-records">
          {data.audit.map((a, i) => (
            <article key={i}>
              <strong>{a.action}</strong>
              <p>{a.release_id}</p>
              <span>{new Date(a.created_at).toLocaleString('ko-KR')}</span>
            </article>
          ))}
          {!data.audit.length && (
            <p className="empty-state">아직 변경 기록이 없어요.</p>
          )}
        </div>
      )}
      <p role="status" className={message ? 'admin-message notice-box' : ''}>
        {message}
      </p>
    </div>
  );
}
