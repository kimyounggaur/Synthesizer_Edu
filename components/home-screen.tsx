'use client';
import {
  Camera,
  ImagePlus,
  Search,
  ArrowRight,
  ShieldCheck,
  MousePointer2,
  ArrowUpDown,
  Check,
  KeyboardMusic,
  ChevronRight,
  Volume2,
  Clock3,
  CircleHelp,
} from 'lucide-react';
import { SynthPanel } from './synth-panel';
import { LessonIcon } from './lesson-icon';
import { lessons, type Model } from '@/lib/content';
export function HomeScreen({
  model,
  go,
  startDemo,
}: {
  model: Model | null;
  go: (p: string) => void;
  startDemo: () => void;
}) {
  return (
    <>
      {!model ? (
        <>
          <div className="page-eyebrow">
            <span className="small-line" />
            처음 만나는 내 악기
          </div>
          <div className="welcome-grid">
            <div className="welcome-copy">
              <h1>
                내 악기,
                <br />
                어디부터 <span>눌러야 할까요?</span>
              </h1>
              <p>
                모델명을 찍으면 내 악기에 맞는
                <br className="desktop-br" /> 버튼부터 알려드려요.
              </p>
              <button
                className="primary-button"
                onClick={() => go('/identify')}
              >
                <Camera size={22} />내 악기 찍기
                <ArrowRight size={20} />
              </button>
              <div className="secondary-actions">
                <button onClick={() => go('/identify?source=file')}>
                  <ImagePlus size={19} />
                  사진에서 찾기
                </button>
                <button onClick={() => go('/models')}>
                  <Search size={19} />
                  모델명 직접 입력
                </button>
              </div>
              <p className="small-note">
                <ShieldCheck size={16} />
                가입 없이 시작 · 지원 여부는 모델 확인 후 안내
              </p>
            </div>
            <div className="welcome-visual">
              <div className="visual-heading">
                <span className="pill green">화면으로 먼저 연습해요</span>
                <span className="subtle">INTERACTIVE PANEL</span>
              </div>
              <SynthPanel compact />
              <div className="visual-bottom">
                <div>
                  <span className="label-kicker">버튼 하나부터, 차근차근</span>
                  <h3>눈으로 보고, 직접 눌러보세요.</h3>
                </div>
                <button
                  className="round-arrow"
                  onClick={startDemo}
                  aria-label="화면 연습 둘러보기"
                >
                  <ArrowRight size={22} />
                </button>
              </div>
              <span className="visual-note">
                JUNO-DS61 학습용 도해 · 실물 조작 검수 전
              </span>
            </div>
          </div>
          <div className="intro-bottom">
            <div>
              <span className="mini-icon">
                <MousePointer2 size={21} />
              </span>
              <div>
                <strong>어디를 누르는지</strong>
                <p>버튼 위치를 크게 보고</p>
              </div>
            </div>
            <div>
              <span className="mini-icon">
                <RotateIcon />
              </span>
              <div>
                <strong>어떻게 조작하는지</strong>
                <p>움직이는 시연을 따라 하고</p>
              </div>
            </div>
            <div>
              <span className="mini-icon">
                <Check size={22} />
              </span>
              <div>
                <strong>제대로 됐는지</strong>
                <p>한 단계씩 직접 확인해요</p>
              </div>
            </div>
          </div>
          <button className="browse-demo" onClick={startDemo}>
            악기가 지금 곁에 없나요? <b>먼저 둘러보기</b>
            <ArrowRight size={17} />
          </button>
        </>
      ) : (
        <>
          <div className="page-eyebrow">나의 작은 연습실</div>
          <h1>
            오늘은 어떤 소리를
            <br className="mobile-only" /> 내 볼까요?
          </h1>
          <p className="page-description">
            처음이어도 괜찮아요. 하나씩 함께 해 봐요.
          </p>
          <div className="instrument-strip">
            <span className="mini-icon">
              <KeyboardMusic size={23} />
            </span>
            <div>
              <span>현재 악기</span>
              <strong>
                {model?.brand || 'Roland'} {model?.name || 'JUNO-DS61'}
              </strong>
            </div>
            <span className="pill">실제 안내 준비 중</span>
            <button onClick={() => go('/models')}>
              변경 <ChevronRight size={16} />
            </button>
          </div>
          <div className="dashboard-grid">
            <div>
              <button
                className="featured-lesson"
                onClick={() => go('/lesson/first-sound')}
              >
                <div>
                  <span className="pill green">처음이라면 여기부터</span>
                  <h2>처음 소리 내기</h2>
                  <p>
                    연결부터 첫 연주까지.
                    <br />
                    버튼부터 하나씩 알려드려요.
                  </p>
                  <span className="featured-start">
                    화면에서 시작하기 <ArrowRight size={18} />
                  </span>
                </div>
                <div className="feature-mark">
                  <Volume2 size={68} strokeWidth={1} />
                  <span>01</span>
                </div>
                <span className="lesson-time">
                  <Clock3 size={14} />약 4분 · 6단계
                </span>
              </button>
              <div className="section-title">
                <h2>하고 싶은 작업</h2>
                <span>화면 연습 8개</span>
              </div>
              <div className="lesson-grid">
                {lessons
                  .filter((l) => ['piano', 'dual', 'split'].includes(l.id))
                  .map((l) => (
                    <button
                      className="lesson-card"
                      key={l.id}
                      onClick={() => go('/lesson/' + l.id)}
                    >
                      <span className={'lesson-icon ' + l.icon}>
                        <LessonIcon name={l.icon} />
                      </span>
                      <h3>{l.short}</h3>
                      <p>{l.description}</p>
                      <span className="card-meta">
                        {l.minutes}분 · {l.steps.length}단계
                        <ArrowRight size={17} />
                      </span>
                    </button>
                  ))}
              </div>
              <button className="all-lessons" onClick={() => go('/lessons')}>
                전체 학습 보기 <ChevronRight size={18} />
              </button>
            </div>
            <aside className="dashboard-aside">
              <div className="practice-card">
                <div className="section-title">
                  <span className="pill green">가볍게 연습</span>
                  <MousePointer2 size={23} />
                </div>
                <h2>
                  내 악기와
                  <br />
                  친해지는 시간
                </h2>
                <SynthPanel compact />
                <p>
                  악기를 건드리지 않고
                  <br />
                  화면 속 버튼을 찾아보세요.
                </p>
                <button
                  className="outline-button"
                  onClick={() => go('/practice')}
                >
                  버튼 찾기 연습 <ArrowRight size={17} />
                </button>
              </div>
              <button className="help-card" onClick={() => go('/help')}>
                <CircleHelp size={25} />
                <div>
                  <strong>지금 막혔어요</strong>
                  <p>소리, 버튼, 화면이 다를 때</p>
                </div>
                <ChevronRight size={19} />
              </button>
              <p className="aside-note">
                <ShieldCheck size={16} />내 악기의 저장된 설정을
                <br />
                앱에서 바꾸지 않아요.
              </p>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
function RotateIcon() {
  return <ArrowUpDown size={21} />;
}
