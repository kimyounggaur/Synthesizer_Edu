'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Volume2,
  RotateCcw,
  ShieldCheck,
  ChevronDown,
  Flag,
  Monitor,
  CircleHelp,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { SynthPanel } from './synth-panel';
import {
  lessons,
  MANUAL_URL,
  MODEL_ID,
  controls,
  type Lesson,
} from '@/lib/content';
import { createSession, transition, type Session } from '@/lib/engine';
import { applySimulation, initialSimulation } from '@/lib/simulation';
import type { CoachData } from '@/lib/local-store';
export type UpdateData = (fn: (d: CoachData) => CoachData) => void;
export function LessonScreen({
  id,
  data,
  update,
  go,
  lessonOverride,
}: {
  id: string;
  data: CoachData;
  update: UpdateData;
  go: (p: string) => void;
  lessonOverride?: Lesson;
}) {
  const lesson = lessonOverride || lessons.find((l) => l.id === id);
  const valid = data.session?.lessonId === id ? data.session : null;
  const [session, setSession] = useState<Session>(() =>
    valid ? { ...valid, status: 'recheck' } : createSession(id),
  );
  const [interacted, setInteracted] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [help, setHelp] = useState('');
  const [ack, setAck] = useState(false);
  const [hints, setHints] = useState(true);
  const [simulation, setSimulation] = useState(
    valid?.simulation || initialSimulation(id),
  );
  const { dial, display, dual, split } = simulation;
  const [held, setHeld] = useState(false);
  const [wakeMessage, setWakeMessage] = useState('');
  const [sending, setSending] = useState(false);
  const lastEvent = useRef(0);
  const sessionRef = useRef(session);
  sessionRef.current = { ...session, simulation };
  const step =
    lesson?.steps[Math.min(session.stepIndex, (lesson?.steps.length || 1) - 1)];
  function move(event: Parameters<typeof transition>[1]) {
    const now = Date.now();
    if (['CONFIRM', 'FINISH'].includes(event) && now - lastEvent.current < 650)
      return;
    lastEvent.current = now;
    const next = transition(sessionRef.current, event, lesson);
    sessionRef.current = next;
    setSession(next);
    update((d) => ({
      ...d,
      session: next,
      ...(next.status === 'completed'
        ? {
            completed: {
              ...d.completed,
              [id]: {
                at: next.updatedAt,
                hints: next.hints,
                evidence: 'screen_practice_self_reported',
              },
            },
          }
        : {}),
    }));
    setHeld(false);
    setInteracted(false);
    setFeedback('');
    setAck(false);
  }
  useEffect(() => {
    update((d) => ({ ...d, demo: true, session: sessionRef.current }));
    const visibility = () => {
      if (
        document.visibilityState === 'hidden' &&
        sessionRef.current.status === 'active'
      ) {
        const next = transition(sessionRef.current, 'RETURN');
        sessionRef.current = next;
        setSession(next);
        setHeld(false);
        setInteracted(false);
        update((d) => ({ ...d, session: next }));
      }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    };
  }, [update]);
  useEffect(() => {
    if (!data.settings.keepAwake || session.status !== 'active') return;
    let lock: WakeLockSentinel | undefined;
    let canceled = false;
    if ('wakeLock' in navigator) {
      navigator.wakeLock
        .request('screen')
        .then((v) => {
          lock = v;
          if (canceled) void v.release();
        })
        .catch(() =>
          setWakeMessage(
            '화면 켜 두기를 사용할 수 없어요. 필요하면 기기 설정을 확인해 주세요.',
          ),
        );
    } else setWakeMessage('이 브라우저는 화면 켜 두기를 지원하지 않아요.');
    return () => {
      canceled = true;
      void lock?.release();
    };
  }, [data.settings.keepAwake, session.status]);
  useEffect(() => {
    if (!data.settings.readAloud || !step || session.status !== 'active')
      return;
    speak(step.body);
    return () => {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    };
  }, [step, session.status, data.settings.readAloud]);
  function speak(text: string) {
    if (!('speechSynthesis' in window)) {
      setFeedback('이 브라우저는 읽어 주기를 지원하지 않아요.');
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 0.88;
    speechSynthesis.speak(utterance);
  }
  function interact(control: string, n?: number) {
    if (!step || session.status !== 'active') return;
    if (control !== step.control && control !== step.secondary) {
      setFeedback('이 버튼은 다른 기능이에요. 표시된 버튼을 다시 찾아볼까요?');
      return;
    }
    if (step.kind === 'observe') {
      setFeedback('위치를 찾았어요. 표시 상태를 살펴보고 확인해 주세요.');
      return;
    }
    if (step.motion === 'hold_and_press') {
      if (control === step.control) {
        setHeld(true);
        setFeedback(
          '1. TRANSPOSE를 유지하는 단계예요. 이제 표시된 OCTAVE 버튼을 눌러보세요.',
        );
        return;
      }
      if (!held) {
        setFeedback(
          '먼저 TRANSPOSE를 선택해 유지한 다음 OCTAVE를 눌러 주세요.',
        );
        return;
      }
      setHeld(false);
    }
    const next = applySimulation(simulation, step, control, n);
    setSimulation(next);
    const nextSession = { ...sessionRef.current, simulation: next };
    sessionRef.current = nextSession;
    setSession(nextSession);
    update((d) => ({ ...d, session: nextSession }));
    setInteracted(true);
    setFeedback('화면 속 조작을 해 봤어요. 아래에서 결과를 확인해 주세요.');
  }

  function showHelp(topic: string) {
    setHelp(topic);
    move('HELP');
  }
  if (!lesson || !step)
    return (
      <div className="empty-state">
        <CircleHelp size={40} />
        <h1>이 학습을 찾을 수 없어요.</h1>
        <p>현재 악기에 맞는 학습을 다시 선택해 주세요.</p>
        <button className="primary-button" onClick={() => go('/lessons')}>
          학습 목록
        </button>
      </div>
    );
  if (session.status === 'completed')
    return (
      <div className="completion-screen">
        <span className="completion-symbol">
          <Check size={43} />
        </span>
        <span className="page-eyebrow">한 걸음 더 익숙해졌어요</span>
        <h1>
          {lesson.short},<br />
          화면에서 연습했어요.
        </h1>
        <p className="page-description">{lesson.result}</p>
        <div className="completion-details">
          <div>
            <span>배운 단계</span>
            <strong>{lesson.steps.length}단계</strong>
          </div>
          <div>
            <span>연습 방식</span>
            <strong>화면 연습</strong>
          </div>
          <div>
            <span>도움 보기</span>
            <strong>{session.hints}회</strong>
          </div>
        </div>
        <p className="notice-box">
          <Monitor size={18} />
          자가 확인으로 기록했어요. 실제 악기 조작 성공을 확인한 기록은
          아니에요.
        </p>
        <button
          className="primary-button"
          onClick={() => {
            const next = createSession(id);
            setSession(next);
            setHints(false);
            setSimulation(initialSimulation(id));
            setHeld(false);
            update((d) => ({ ...d, session: next }));
          }}
        >
          <RotateCcw size={19} />
          안내를 줄이고 한 번 더
        </button>
        <button
          className="outline-button spaced"
          onClick={() => go('/learn/' + MODEL_ID)}
        >
          여기서 마치기
          <ArrowRight size={18} />
        </button>
      </div>
    );
  return (
    <div className="lesson-screen">
      <div className="lesson-heading">
        <button
          className="back-button"
          onClick={() => {
            move('RETURN');
            go('/learn/' + MODEL_ID);
          }}
        >
          <ArrowLeft size={18} />
          배우기로
        </button>
        <span className="pill green">
          <Monitor size={13} />
          화면 연습
        </span>
        <button className="safe-stop" onClick={() => showHelp('stop')}>
          <Flag size={16} />
          안전하게 마치기
        </button>
      </div>
      <div className="lesson-title-row">
        <div>
          <span className="page-eyebrow">Roland JUNO-DS61 · {lesson.code}</span>
          <h1>{lesson.title}</h1>
        </div>
        <span className="step-count">
          <b>{session.stepIndex + 1}</b> / {lesson.steps.length}
        </span>
      </div>
      <Progress
        aria-label="학습 진행"
        value={
          session.status === 'closing'
            ? 100
            : (session.stepIndex / lesson.steps.length) * 100
        }
        className="lesson-progress"
      />
      {session.status === 'recheck' ? (
        <div className="preparation-grid">
          <div>
            <SynthPanel target={step.control} compact />
            <p className="diagram-disclaimer">
              공식 문헌을 참고한 학습용 도해 · 실물 위치 미검수
            </p>
          </div>
          <section className="preparation-card">
            <span className="pill">시작 전 확인</span>
            <h2>
              {session.stepIndex > 0
                ? '이어서 연습할 준비가 됐나요?'
                : '화면에서 먼저 연습해 볼까요?'}
            </h2>
            <p>
              예시 악기의 버튼을 눌러보는 연습이에요. 지금은 실제 악기를
              조작하지 않아요.
            </p>
            <div className="prep-facts">
              <span>
                <Clock3 size={17} />약 {lesson.minutes}분 ·{' '}
                {lesson.steps.length}단계
              </span>
              <span>
                <ShieldCheck size={17} />
                악기 설정을 바꾸지 않아요
              </span>
            </div>
            {data.settings.shared && (
              <p className="notice-box">
                함께 쓰는 악기는 담당자의 확인 없이 저장된 설정을 바꾸지 않아요.
              </p>
            )}
            <label className="check-row">
              <Checkbox
                checked={ack}
                onCheckedChange={(v) => setAck(Boolean(v))}
              />
              <span>학습용 화면 연습인 것을 확인했어요.</span>
            </label>
            <button
              className="primary-button"
              disabled={!ack}
              onClick={() => move('RECHECK')}
            >
              {session.stepIndex ? '이어서 화면 연습하기' : '화면 연습 시작'}
              <ArrowRight size={18} />
            </button>
            <button className="text-button" onClick={() => showHelp('state')}>
              잘 모르겠어요
            </button>
          </section>
        </div>
      ) : session.status === 'closing' ? (
        <div className="closing-card">
          <ShieldCheck size={36} />
          <h2>연습을 마치기 전에</h2>
          <p>{lesson.recovery}</p>
          <p>
            실제 악기의 상태를 바꿨다면 시작값과 비교해 주세요. 값을 모르면
            임의로 0으로 바꾸지 말고 담당자에게 확인하세요.
          </p>
          <label className="check-row">
            <Checkbox
              checked={ack}
              onCheckedChange={(v) => setAck(Boolean(v))}
            />
            <span>화면 연습을 마쳤음을 확인했어요.</span>
          </label>
          <button
            className="primary-button"
            disabled={!ack}
            onClick={() => move('FINISH')}
          >
            <Check size={20} />
            화면 연습 완료로 기록
          </button>
        </div>
      ) : (
        <div className="lesson-workspace">
          <div className="lesson-visual">
            <SynthPanel
              key={step.id}
              target={step.control}
              secondary={step.secondary}
              motion={step.motion}
              onInteract={interact}
              value={dial}
              display={display}
              dual={dual}
              split={split}
              hints={hints}
            />
            <p className="diagram-disclaimer">
              앱 속 시뮬레이션 · 실제 악기 상태를 감지하거나 바꾸지 않아요.
            </p>
          </div>
          <div className="lesson-instructions">
            <div className="action-card">
              <span className="action-step">
                STEP {String(session.stepIndex + 1).padStart(2, '0')}
              </span>
              <h2>{step.title}</h2>
              <p className="action-body">{step.body}</p>
              {step.warning && <div className="notice-box">{step.warning}</div>}
              <button className="read-button" onClick={() => speak(step.body)}>
                <Volume2 size={17} />
                읽어 주기
              </button>
              <div className="result-check">
                <span>
                  <CheckCircle2 size={19} />
                  결과 확인
                </span>
                <p>{step.expected}</p>
                {step.kind === 'observe' ? (
                  <label className="check-row">
                    <Checkbox
                      checked={interacted}
                      onCheckedChange={(v) => setInteracted(Boolean(v))}
                    />
                    <span>예시 표시를 확인했어요.</span>
                  </label>
                ) : (
                  <p className="interaction-hint">
                    화면 속 버튼을 누르거나 이름 목록에서 선택해 주세요.
                  </p>
                )}
                <p className="interaction-feedback" role="status">
                  {feedback}
                </p>
                <button
                  className="primary-button"
                  disabled={!interacted || session.status !== 'active'}
                  onClick={() => move('CONFIRM')}
                >
                  {step.confirm}
                  <ArrowRight size={18} />
                </button>
              </div>
              <div className="help-actions">
                <button onClick={() => showHelp('button')}>
                  버튼이 안 보여요
                </button>
                <button onClick={() => showHelp('state')}>화면이 달라요</button>
              </div>
            </div>
            <details className="source-details">
              <summary>
                더 보기 · 공식 문헌 근거
                <ChevronDown size={16} />
              </summary>
              <p>{controls.find((c) => c.id === step.control)?.location}</p>
              <p>현재 도해와 절차는 문헌 대조 단계이며 실물 검수 전입니다.</p>
              <a
                href={MANUAL_URL + '#page=' + step.sourcePage}
                target="_blank"
                rel="noreferrer"
              >
                Roland 공식 설명서 · {step.sourcePage}쪽 ↗
              </a>
              <button
                className="text-button"
                disabled={sending}
                onClick={async () => {
                  setSending(true);
                  try {
                    const r = await fetch('/api/feedback', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        type: 'content_issue',
                        lessonId: id,
                        stepId: step.id,
                        message: '이 단계의 설명 또는 패널 검토 요청',
                      }),
                    });
                    setFeedback(
                      r.ok
                        ? '검토 요청을 저장했어요.'
                        : '요청을 저장하지 못했어요.',
                    );
                  } catch {
                    setFeedback('연결 후 다시 시도해 주세요.');
                  }
                  setSending(false);
                }}
              >
                이 단계의 문제 알리기
              </button>
            </details>
            <button
              className="previous-button"
              disabled={session.stepIndex === 0}
              onClick={() => move('PREVIOUS')}
            >
              <ArrowLeft size={16} />
              이전 설명 <span>악기 상태는 되돌아가지 않아요</span>
            </button>
          </div>
        </div>
      )}
      <button className="loud-help" onClick={() => showHelp('loud')}>
        <Volume2 size={17} />
        소리가 너무 커요
      </button>
      {wakeMessage && (
        <p role="status" className="notice-box">
          {wakeMessage}
        </p>
      )}
      <Dialog
        open={!!help}
        onOpenChange={(open) => {
          if (!open) {
            setHelp('');
            move('RETURN');
          }
        }}
      >
        <DialogContent className="coach-dialog" showCloseButton={false}>
          <DialogTitle>
            {help === 'loud'
              ? '소리가 너무 큰가요?'
              : help === 'button'
                ? '버튼을 함께 찾아봐요'
                : help === 'stop'
                  ? '여기서 잠시 마칠까요?'
                  : '지금 상태를 확인해요'}
          </DialogTitle>
          <DialogDescription>
            {help === 'loud'
              ? '휴대폰 읽어 주기 소리와 실제 악기 소리는 별도로 조절해요.'
              : help === 'button'
                ? '전체 위치와 버튼 이름 목록에서 같은 이름을 확인해요.'
                : help === 'stop'
                  ? '현재 단계를 이 기기에 저장해요. 다음에는 상태를 확인하고 이어서 연습해요.'
                  : '확인하기 전에는 실제 악기의 다른 버튼을 더 누르지 않아도 괜찮아요.'}
          </DialogDescription>
          {help === 'loud' ? (
            <>
              <button
                className="primary-button"
                onClick={() => {
                  if ('speechSynthesis' in window) speechSynthesis.cancel();
                  setFeedback('휴대폰 읽어 주기를 멈췄어요.');
                }}
              >
                휴대폰 읽어 주기 멈추기
              </button>
              <p>
                실제 악기·외부 스피커의 음량은 앱에서 바뀌지 않아요. 소리에서
                거리를 두고 담당자에게 알려 주세요.
              </p>
            </>
          ) : help === 'button' ? (
            <>
              <p>
                <b>{controls.find((c) => c.id === step.control)?.label}</b> ·{' '}
                {controls.find((c) => c.id === step.control)?.location}
              </p>
              <p>
                그림이 실제 악기와 다르면 모델을 다시 확인해 주세요. 현재 그림은
                실물 검수 전 도해예요.
              </p>
            </>
          ) : help === 'state' ? (
            <div className="state-choices">
              {[
                '소리 이름이 보여요',
                '메뉴 목록이 보여요',
                '저장 확인·처리 중이에요',
                '잘 모르겠어요 / 잘못 눌렀어요',
              ].map((t) => (
                <button
                  key={t}
                  className="outline-button"
                  onClick={() =>
                    setFeedback(
                      t.includes('소리')
                        ? '화면 연습으로 돌아가 상태를 다시 확인할게요.'
                        : '실제 악기의 추가 조작을 멈추고 담당자에게 확인해 주세요.',
                    )
                  }
                >
                  {t}
                </button>
              ))}
              <p role="status">{feedback}</p>
            </div>
          ) : null}
          <button
            className="primary-button"
            onClick={() => {
              setHelp('');
              move('RETURN');
            }}
          >
            상태 확인 후 화면 연습으로
          </button>
          <button
            className="outline-button"
            onClick={() => {
              setHelp('');
              move('RETURN');
              go('/learn/' + MODEL_ID);
            }}
          >
            학습 저장하고 나가기
          </button>
          <DialogClose className="text-button">닫기</DialogClose>
        </DialogContent>
      </Dialog>
    </div>
  );
}
