'use client';
import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  ExternalLink,
  Info,
  Monitor,
  ShieldCheck,
  Trash2,
  BookOpen,
  KeyboardMusic,
  LoaderCircle,
  Settings2,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { helpTopics, lessons, MODEL_ID, MODEL_MANUALS } from '@/lib/content';
import {
  clearLocal,
  deleteOffline,
  downloadDemo,
  type CoachData,
  type Settings,
} from '@/lib/local-store';
import { LessonIcon } from './lesson-icon';
import { SynthPanel } from './synth-panel';
import type { UpdateData } from './lesson-screen';

export function AllLessons({
  go,
  data,
}: {
  go: (p: string) => void;
  data: CoachData;
}) {
  const [filter, setFilter] = useState('전체');
  return (
    <>
      <div className="page-eyebrow">하나씩 익히는 조작법</div>
      <h1>내 속도로, 차근차근.</h1>
      <p className="page-description">
        8개의 짧은 화면 연습으로 악기와 친해져요.
      </p>
      <Tabs value={filter} onValueChange={(v) => setFilter(String(v))}>
        <TabsList className="mode-tabs">
          {['전체', '기본 조작', '소리 조합', '높낮이'].map((t) => (
            <TabsTrigger key={t} value={t}>
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="all-lesson-grid">
        {lessons
          .filter((l) => filter === '전체' || l.category === filter)
          .map((l) => (
            <button
              key={l.id}
              className="lesson-card"
              onClick={() => go('/lesson/' + l.id)}
            >
              <div className="lesson-card-top">
                <span className={'lesson-icon ' + l.icon}>
                  <LessonIcon name={l.icon} />
                </span>
                {data.completed[l.id] && (
                  <span className="pill green">
                    <Check size={13} />
                    연습 완료
                  </span>
                )}
              </div>
              <span className="label-kicker">
                {l.code} · {l.category}
              </span>
              <h3>{l.title}</h3>
              <p>{l.description}</p>
              <span className="card-meta">
                약 {l.minutes}분 · {l.steps.length}단계
                <ArrowRight size={17} />
              </span>
            </button>
          ))}
      </div>
    </>
  );
}
export function HelpScreen({
  go,
  topicId,
}: {
  go: (p: string) => void;
  topicId?: string;
}) {
  const [index, setIndex] = useState(0);
  const topic = helpTopics.find((t) => t.id === topicId);
  return (
    <div className={topic ? 'narrow-screen' : 'help-screen'}>
      <button
        className="back-button"
        onClick={() => go(topic ? '/help' : '/learn/' + MODEL_ID)}
      >
        <ArrowLeft size={18} />
        {topic ? '다른 문제 보기' : '배우기로'}
      </button>
      <div className="page-eyebrow">잠깐 막혀도 괜찮아요</div>
      <h1>{topic ? topic.title : '어떤 점이 어려운가요?'}</h1>
      <p className="page-description">
        {topic ? topic.intro : '확인할 수 있는 것부터, 하나씩 살펴봐요.'}
      </p>
      {topic ? (
        <>
          <SynthPanel target={topic.control} compact />
          <section className="troubleshooting-card">
            <span className="label-kicker">
              확인 {Math.min(index + 1, topic.checks.length)} /{' '}
              {topic.checks.length}
            </span>
            <h2>{topic.checks[Math.min(index, topic.checks.length - 1)]}</h2>
            <div className="trouble-actions">
              {index < topic.checks.length - 1 ? (
                <button
                  className="primary-button"
                  onClick={() => setIndex((i) => i + 1)}
                >
                  확인했어요 · 다음 확인
                  <ArrowRight size={18} />
                </button>
              ) : (
                <a
                  className="primary-button"
                  href={MODEL_MANUALS}
                  target="_blank"
                  rel="noreferrer"
                >
                  공식 설명서 확인
                  <ExternalLink size={18} />
                </a>
              )}
              <button className="outline-button" onClick={() => go('/help')}>
                해결됐어요 · 도움말로 돌아가기
              </button>
              <button
                className="text-button"
                onClick={() => setIndex(topic.checks.length - 1)}
              >
                잘 모르겠어요
              </button>
            </div>
          </section>
          <p className="notice-box">
            이 안내는 관찰을 돕는 설명이에요. 상태가 불분명하면 추가 조작을
            멈추고 담당자에게 확인하세요.
          </p>
        </>
      ) : (
        <>
          <div className="help-topic-grid">
            {helpTopics.map((t, i) => (
              <button
                key={t.id}
                className="help-topic"
                onClick={() => {
                  setIndex(0);
                  go('/help/' + t.id);
                }}
              >
                <span className="lesson-icon">
                  <LessonIcon name={t.icon} />
                </span>
                <div>
                  <span className="label-kicker">T0{i + 1}</span>
                  <h3>{t.title}</h3>
                  <p>{t.intro}</p>
                </div>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
          <div className="quick-help">
            <button onClick={() => go('/practice')}>
              <KeyboardMusic size={24} />
              <div>
                <strong>버튼이 안 보여요</strong>
                <span>전체 패널과 이름 목록으로 찾기</span>
              </div>
              <ChevronRight size={18} />
            </button>
            <button onClick={() => go('/models')}>
              <CircleHelp size={24} />
              <div>
                <strong>모델을 찾지 못했어요</strong>
                <span>브랜드와 모델명을 다시 확인</span>
              </div>
              <ChevronRight size={18} />
            </button>
          </div>
          <p className="notice-box">
            <ShieldCheck size={20} />
            공장 초기화, 저장·덮어쓰기, 전원 차단을 문제 해결의 기본 방법으로
            안내하지 않아요.
          </p>
        </>
      )}
    </div>
  );
}
export function ProgressScreen({
  data,
  go,
}: {
  data: CoachData;
  go: (p: string) => void;
}) {
  const count = Object.keys(data.completed).length;
  return (
    <>
      <div className="page-eyebrow">어제보다 조금 더 익숙하게</div>
      <h1>나의 연습 기록</h1>
      <p className="page-description">이 기기에 저장된 화면 연습 기록이에요.</p>
      <div className="progress-summary">
        <div className="progress-main">
          <span className="summary-icon">
            <BookOpen size={30} />
          </span>
          <div>
            <span>연습한 학습</span>
            <h2>
              {count}
              <small> / 8</small>
            </h2>
          </div>
          <Progress aria-label="완료한 학습" value={(count / 8) * 100} />
        </div>
        <div>
          <span>찾아본 버튼</span>
          <h2>
            {data.practiceCount}
            <small>개</small>
          </h2>
        </div>
        <div>
          <span>기록 방식</span>
          <h3>
            화면 연습
            <br />
            <small>자가 확인</small>
          </h3>
        </div>
      </div>
      {data.session && data.session.status !== 'completed' && (
        <button
          className="resume-card"
          onClick={() => go('/lesson/' + data.session!.lessonId)}
        >
          <span className="lesson-icon">
            <ArrowRight size={25} />
          </span>
          <div>
            <span className="label-kicker">이어서 배우기</span>
            <h3>
              {lessons.find((l) => l.id === data.session?.lessonId)?.title}
            </h3>
            <p>{data.session.stepIndex + 1}번째 단계에서 이어갈 수 있어요.</p>
          </div>
          <ChevronRight size={22} />
        </button>
      )}
      <div className="section-title">
        <h2>나의 학습</h2>
        <span>JUNO-DS61 · 화면 연습</span>
      </div>
      <div className="progress-list">
        {lessons.map((l) => (
          <button key={l.id} onClick={() => go('/lesson/' + l.id)}>
            <span
              className={
                'progress-state ' + (data.completed[l.id] ? 'done' : '')
              }
            >
              {data.completed[l.id] ? (
                <Check size={19} />
              ) : (
                l.code.replace('L', '')
              )}
            </span>
            <div>
              <h3>{l.title}</h3>
              <p>
                {data.completed[l.id]
                  ? new Date(data.completed[l.id].at).toLocaleDateString(
                      'ko-KR',
                    ) +
                    ' · 화면 연습 자가 확인 · 도움 ' +
                    data.completed[l.id].hints +
                    '회'
                  : '아직 연습하지 않았어요'}
              </p>
            </div>
            <ChevronRight size={19} />
          </button>
        ))}
      </div>
      <p className="notice-box">
        <Info size={18} />
        기록은 실제 악기 조작을 감지한 결과가 아니에요. 브라우저 데이터를 지우면
        이 기기의 기록도 삭제돼요.
      </p>
      <button className="text-button" onClick={() => go('/settings')}>
        <Settings2 size={17} />
        기록과 오프라인 자료 관리
      </button>
    </>
  );
}
export function SettingsScreen({
  data,
  update,
  go,
}: {
  data: CoachData;
  update: UpdateData;
  go: (p: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteType, setDeleteType] = useState<'records' | 'offline'>(
    'records',
  );
  const rows: { key: keyof Settings; title: string; body: string }[] = [
    {
      key: 'largeText',
      title: '큰 글자로 보기',
      body: '안내 문장과 버튼 글자를 크게 표시해요.',
    },
    {
      key: 'reducedMotion',
      title: '움직임 줄이기',
      body: '움직이는 시연을 정적인 위치 표시로 바꿔요.',
    },
    {
      key: 'readAloud',
      title: '단계 안내 읽어 주기',
      body: '학습 중 한국어 안내 문장을 읽어 줘요.',
    },
    {
      key: 'keepAwake',
      title: '학습 중 화면 켜 두기',
      body: '지원하는 브라우저에서 화면을 켜 둬요.',
    },
    {
      key: 'shared',
      title: '함께 쓰는 악기',
      body: '공용 악기는 담당자 확인 없이 설정을 저장하지 않아요.',
    },
  ];
  return (
    <div className="settings-screen">
      <div className="page-eyebrow">나에게 맞게</div>
      <h1>기록과 설정</h1>
      <p className="page-description">편안하게 보고, 듣고, 연습할 수 있도록.</p>
      <div className="settings-group">
        {rows.map((row) => (
          <label key={row.key} className="setting-row">
            <div>
              <strong>{row.title}</strong>
              <p>{row.body}</p>
            </div>
            <Switch
              checked={data.settings[row.key]}
              onCheckedChange={(v) =>
                update((d) => ({
                  ...d,
                  settings: { ...d.settings, [row.key]: v },
                }))
              }
              aria-label={row.title}
            />
          </label>
        ))}
      </div>
      <div className="section-title">
        <h2>오프라인 화면 연습</h2>
        {data.offline && (
          <span className="pill green">
            <Check size={12} />
            저장됨
          </span>
        )}
      </div>
      <div className="offline-card">
        <span className="lesson-icon">
          <Download size={25} />
        </span>
        <div>
          <h3>
            {data.offline
              ? '화면 연습이 저장되어 있어요.'
              : '연결이 없어도 연습해요.'}
          </h3>
          <p>
            8개 화면 연습, 패널 도해, 도움말을 함께 저장해요. 실제 조작 안내가
            아닌 화면 연습 자료예요.
          </p>
          {data.offline && (
            <span className="label-kicker">
              저장한 날짜 ·{' '}
              {new Date(data.offline.downloadedAt).toLocaleString('ko-KR')}
            </span>
          )}
          <button
            className="outline-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMessage('학습 자료를 내려받고 확인하는 중…');
              try {
                const offline = await downloadDemo();
                update((d) => ({ ...d, offline }));
                setMessage(
                  '화면 연습 자료를 저장했어요. 연결이 없어도 저장된 화면 연습을 사용할 수 있어요.',
                );
              } catch (e) {
                setMessage(
                  e instanceof Error ? e.message : '저장하지 못했어요.',
                );
              }
              setBusy(false);
            }}
          >
            {busy ? (
              <LoaderCircle size={18} className="spin" />
            ) : (
              <Download size={18} />
            )}{' '}
            {data.offline ? '자료 다시 확인하고 저장' : '화면 연습 내려받기'}
          </button>
          {data.offline && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setDeleteType('offline');
                setConfirmDelete(true);
              }}
            >
              오프라인 자료 삭제
            </button>
          )}
        </div>
      </div>
      <p role="status" className={message ? 'notice-box' : ''}>
        {message}
      </p>
      <div className="settings-group spaced">
        <button className="settings-link" onClick={() => go('/privacy')}>
          <ShieldCheck size={21} />
          <span>사진 처리·개인정보 안내</span>
          <ChevronRight size={18} />
        </button>
        <button
          className="settings-link danger"
          onClick={() => {
            setDeleteType('records');
            setConfirmDelete(true);
          }}
        >
          <Trash2 size={20} />
          <span>이 기기의 학습 기록 삭제</span>
          <ChevronRight size={18} />
        </button>
        <button className="settings-link" onClick={() => go('/admin')}>
          <Monitor size={20} />
          <span>콘텐츠 검수</span>
          <ChevronRight size={18} />
        </button>
      </div>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="coach-dialog">
          <AlertDialogTitle>
            {deleteType === 'records'
              ? '이 기기의 학습 기록을 삭제할까요?'
              : '오프라인 자료를 삭제할까요?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deleteType === 'records'
              ? '완료 기록, 이어서 배우기와 버튼 연습 횟수가 삭제됩니다. 악기 설정에는 영향이 없어요.'
              : '저장된 화면 연습 자료를 삭제해요. 학습 기록은 유지돼요.'}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  if (deleteType === 'records') {
                    await clearLocal();
                    update((d) => ({
                      ...d,
                      session: null,
                      completed: {},
                      practiceCount: 0,
                    }));
                  } else {
                    await deleteOffline();
                    update((d) => ({ ...d, offline: null }));
                  }
                  setMessage('삭제했어요.');
                  setConfirmDelete(false);
                } catch {
                  setMessage('삭제하지 못했어요. 다시 시도해 주세요.');
                }
              }}
            >
              삭제하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
export function PrivacyScreen({ go }: { go: (p: string) => void }) {
  return (
    <article className="privacy-screen narrow-screen">
      <button className="back-button" onClick={() => go('/settings')}>
        <ArrowLeft size={18} />
        설정으로
      </button>
      <span className="page-eyebrow">사진과 학습 기록</span>
      <h1>
        필요한 정보만,
        <br />
        분명하게 확인해요.
      </h1>
      <section>
        <h2>사진을 선택하면</h2>
        <p>
          선택한 사진은 브라우저에서 열고 영역을 조정해요. 이 과정에서 JPG로
          다시 만들며 원본의 EXIF 메타데이터를 복사하지 않아요.
        </p>
        <p>
          전송에 동의하고 ‘이 부분으로 찾기’를 누를 때만 잘라낸 영역이 앱 서버로
          전송돼요. 인식 서비스가 연결되어 있으면 Google Cloud Vision으로 글자
          인식을 요청해요.
        </p>
      </section>
      <section>
        <h2>사진은 어디에 남나요?</h2>
        <p>
          앱은 인식 사진을 사진 보관함이나 장기 저장소에 저장하지 않아요. 처리
          요청 동안 메모리에서 사용하며, 처리 후 사진 내용을 앱 로그에 기록하지
          않아요. 외부 처리자의 보관 정책까지 포함한 즉시 완전 삭제를 약속하지
          않아요.
        </p>
        <a
          href="https://cloud.google.com/vision/docs/data-usage"
          target="_blank"
          rel="noreferrer"
        >
          Google Cloud Vision 데이터 사용 안내 ↗
        </a>
        <p>
          인식 결과는 15분 동안만 조회할 수 있어요. 만료된 처리 기록은 다음 서버
          정리 시 삭제돼요. OCR 원문·일련번호는 분석 지표에 넣지 않아요.
        </p>
      </section>
      <section>
        <h2>직접 입력으로도 사용할 수 있어요.</h2>
        <p>
          카메라와 사진 전송은 선택이에요. 모델명을 직접 입력하면 사진을
          업로드하지 않고 모델을 확인할 수 있어요.
        </p>
        <button className="outline-button" onClick={() => go('/models')}>
          모델명 직접 입력
          <ArrowRight size={18} />
        </button>
      </section>
      <section>
        <h2>학습 기록은 이 기기에</h2>
        <p>
          게스트 학습 진도·화면 연습 완료·설정은 이 브라우저에 저장해요.
          로그인이나 서버 동기화 없이 사용할 수 있어요. 설정에서 직접 삭제할 수
          있고, 브라우저 데이터를 지우면 사라질 수 있어요.
        </p>
        <p>
          지원·콘텐츠 검토 요청을 보내면 요청 종류, 모델·단계, 직접 입력한
          설명을 서버에 저장해요. 이름·얼굴·일련번호 등 개인정보는 넣지 않아도
          돼요. 서버 요청에 사용하는 임시 세션 쿠키는 분석 결과 접근을 보호하는
          용도예요.
        </p>
      </section>
      <section>
        <h2>학습용 도해와 검수 상태</h2>
        <p>
          Roland 상표는 해당 소유자에게 귀속됩니다. 현재 패널은 공식 문헌을
          참고해 작성한 화면 연습용 도해이며 실물과의 위치·동작 검수는 수행하지
          않았어요. 실제 조작 안내를 게시하려면 실물 검수와 독립 검토가
          필요해요.
        </p>
      </section>
    </article>
  );
}
