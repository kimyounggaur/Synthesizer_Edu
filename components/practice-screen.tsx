'use client';
import { useState } from 'react';
import {
  ArrowRight,
  Eye,
  MousePointer2,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SynthPanel } from './synth-panel';
import { controls } from '@/lib/content';
import type { UpdateData } from './lesson-screen';
const tasks = [
  'front.piano',
  'front.value',
  'rear.phones',
  'front.dual',
  'front.split',
  'front.volume',
  'front.transpose',
  'rear.power',
];
export function PracticeScreen({ update }: { update: UpdateData }) {
  const [mode, setMode] = useState('quiz');
  const [index, setIndex] = useState(0);
  const [hint, setHint] = useState(false);
  const [found, setFound] = useState(false);
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState('front.piano');
  const control = controls.find(
    (c) => c.id === (mode === 'quiz' ? tasks[index] : target),
  )!;
  function choose(id: string) {
    if (mode === 'explore') {
      setTarget(id);
      return;
    }
    if (found) return;
    if (id === control.id) {
      setFound(true);
      setMessage('찾았어요! ' + control.easy + '에 쓰는 조작부예요.');
      update((d) => ({ ...d, practiceCount: d.practiceCount + 1 }));
    } else setMessage('이 버튼은 다른 기능이에요. 다시 찾아봐도 괜찮아요.');
  }
  return (
    <div className="practice-screen">
      <div className="page-eyebrow">악기 없이도, 가볍게</div>
      <h1>버튼과 친해져 볼까요?</h1>
      <p className="page-description">
        예시 악기에서 위치와 이름을 익혀요. 실제 악기 조작은 기록하지 않아요.
      </p>
      <Tabs
        value={mode}
        onValueChange={(v) => {
          setMode(String(v));
          setMessage('');
        }}
      >
        <TabsList className="mode-tabs">
          <TabsTrigger value="quiz">버튼 찾기 연습</TabsTrigger>
          <TabsTrigger value="explore">자유롭게 살펴보기</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="practice-workspace">
        <div>
          <SynthPanel
            target={control.id}
            hints={mode === 'explore' || hint || found}
            onInteract={choose}
          />
        </div>
        <div className="challenge-card">
          <span className="challenge-icon">
            <MousePointer2 size={25} />
          </span>
          <span className="label-kicker">
            {mode === 'quiz'
              ? `CHALLENGE ${String(index + 1).padStart(2, '0')}`
              : 'PANEL EXPLORER'}
          </span>
          <h2>
            {mode === 'quiz' ? (
              <>
                <b>{control.label}</b>를<br />
                찾아 눌러보세요.
              </>
            ) : (
              control.easy
            )}
          </h2>
          <p>
            {mode === 'quiz'
              ? control.easy + '에 사용하는 조작부예요.'
              : control.location}
          </p>
          <div
            className={'practice-feedback ' + (found ? 'success' : '')}
            role="status"
          >
            {found && <CheckCircle2 size={19} />} {message}
          </div>
          {mode === 'quiz' && (
            <>
              {found ? (
                <button
                  className="primary-button"
                  onClick={() => {
                    setIndex((i) => (i + 1) % tasks.length);
                    setFound(false);
                    setHint(false);
                    setMessage('');
                  }}
                >
                  다음 버튼 찾기
                  <ArrowRight size={18} />
                </button>
              ) : (
                <button
                  className="outline-button"
                  onClick={() => setHint((v) => !v)}
                >
                  <Eye size={18} />
                  {hint ? '표시 감추기' : '위치 힌트 보기'}
                </button>
              )}
              <button
                className="text-button"
                onClick={() => {
                  setIndex(0);
                  setFound(false);
                  setHint(false);
                  setMessage('');
                }}
              >
                <RotateCcw size={16} />
                처음부터 다시
              </button>
            </>
          )}
          <p className="practice-encouragement">
            시간 제한도, 감점도 없어요.
            <br />내 속도로 찾아보세요.
          </p>
        </div>
      </div>
    </div>
  );
}
