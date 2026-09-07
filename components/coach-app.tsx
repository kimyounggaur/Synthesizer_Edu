'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  BookOpen,
  MousePointer2,
  ChartNoAxesCombined,
  CircleHelp,
  Settings2,
  Headphones,
  Monitor,
  WifiOff,
  ArrowRight,
} from 'lucide-react';
import { HomeScreen } from './home-screen';
import { IdentifyScreen, ModelSearch, ModelReady } from './identify-screen';
import { LessonScreen, type UpdateData } from './lesson-screen';
import { PracticeScreen } from './practice-screen';
import {
  AllLessons,
  HelpScreen,
  PrivacyScreen,
  ProgressScreen,
  SettingsScreen,
} from './support-screens';
import { AdminScreen } from './admin-screen';
import { catalog, MODEL_ID, type Model } from '@/lib/content';
import {
  emptyData,
  readLocal,
  writeLocal,
  type CoachData,
} from '@/lib/local-store';

export function CoachApp({ initialPath = '/' }: { initialPath?: string }) {
  const [path, setPath] = useState(initialPath);
  const [data, setData] = useState<CoachData>(emptyData);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [online, setOnline] = useState(true);
  const [recognizedText, setRecognizedText] = useState('');
  const loaded = useRef(false);
  useEffect(() => {
    setPath(location.pathname);
    setOnline(navigator.onLine);
    const pop = () => setPath(location.pathname);
    const connection = () => setOnline(navigator.onLine);
    window.addEventListener('popstate', pop);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    readLocal()
      .then((d) => {
        setData(d);
        loaded.current = true;
        setReady(true);
      })
      .catch(() => {
        loaded.current = true;
        setReady(true);
        setStorageError(
          '이 브라우저에 기록을 저장할 수 없어요. 이번 화면 연습은 계속할 수 있지만 기록이 사라질 수 있어요.',
        );
      });
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => {
      window.removeEventListener('popstate', pop);
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
    };
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    writeLocal(data).catch(() =>
      setStorageError(
        '기록 저장 공간이 부족하거나 차단되어 있어요. 화면 연습은 계속할 수 있어요.',
      ),
    );
  }, [data]);
  const update: UpdateData = useCallback((fn) => setData((old) => fn(old)), []);
  const go = (url: string) => {
    const target = new URL(url, location.origin);
    history.pushState({}, '', target.pathname + target.search);
    setPath(target.pathname);
    window.scrollTo(0, 0);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  };
  const model = catalog.find((m) => m.id === data.modelId) || null;
  const startDemo = () => {
    update((d) => ({
      ...d,
      demo: true,
      modelId: MODEL_ID,
      session: d.session?.modelId === MODEL_ID ? d.session : null,
    }));
    go('/learn/' + MODEL_ID);
  };
  const confirmModel = (m: Model) => {
    update((d) => ({ ...d, modelId: m.id, demo: false, session: null }));
    go('/models/' + m.id);
  };
  const isLesson = path.startsWith('/lesson/');
  const isPractice = path === '/practice';
  const isDemo =
    isLesson ||
    isPractice ||
    (data.demo && path.startsWith('/learn')) ||
    path === '/lessons';
  const page =
    path.startsWith('/progress') || path === '/settings'
      ? 'progress'
      : path.startsWith('/help')
        ? 'help'
        : isPractice
          ? 'practice'
          : 'learn';
  const nav = [
    {
      id: 'learn',
      title: '배우기',
      icon: BookOpen,
      url: model ? '/learn/' + model.id : '/',
    },
    {
      id: 'practice',
      title: '버튼 찾기',
      icon: MousePointer2,
      url: '/practice',
    },
    {
      id: 'progress',
      title: '내 기록',
      icon: ChartNoAxesCombined,
      url: '/progress',
    },
  ];
  let screen;
  if (path === '/identify')
    screen = (
      <IdentifyScreen
        go={go}
        onRead={(text) => {
          setRecognizedText(text);
          go('/identify/result');
        }}
      />
    );
  else if (path === '/models' || path === '/identify/result')
    screen = (
      <ModelSearch
        key={path}
        go={go}
        onConfirm={confirmModel}
        initialText={path === '/identify/result' ? recognizedText : ''}
      />
    );
  else if (path.startsWith('/models/')) {
    const selected = catalog.find((m) => m.id === path.split('/')[2]);
    screen = selected ? (
      <ModelReady model={selected} go={go} onDemo={startDemo} />
    ) : (
      <ModelSearch go={go} onConfirm={confirmModel} />
    );
  } else if (isLesson)
    screen = ready ? (
      <LessonScreen
        key={path}
        id={path.split('/')[2]}
        data={data}
        update={update}
        go={go}
      />
    ) : (
      <p role="status">학습 기록을 불러오는 중…</p>
    );
  else if (isPractice) screen = <PracticeScreen update={update} />;
  else if (path === '/lessons') screen = <AllLessons go={go} data={data} />;
  else if (path.startsWith('/help'))
    screen = <HelpScreen key={path} topicId={path.split('/')[2]} go={go} />;
  else if (path === '/progress')
    screen = <ProgressScreen data={data} go={go} />;
  else if (path === '/settings')
    screen = <SettingsScreen data={data} update={update} go={go} />;
  else if (path === '/privacy') screen = <PrivacyScreen go={go} />;
  else if (path.startsWith('/admin')) screen = <AdminScreen go={go} />;
  else if (path.startsWith('/learn/') && path.split('/')[2] !== model?.id) {
    const requested = catalog.find((m) => m.id === path.split('/')[2]);
    screen = requested ? (
      <ModelSearch
        key={path}
        go={go}
        onConfirm={confirmModel}
        initialText={requested.name}
      />
    ) : (
      <ModelSearch key={path} go={go} onConfirm={confirmModel} />
    );
  } else if (path === '/' || path.startsWith('/learn/'))
    screen =
      model && !data.demo ? (
        <ModelReady model={model} go={go} onDemo={startDemo} />
      ) : (
        <>
          <HomeScreen model={model} go={go} startDemo={startDemo} />
          {model && data.session && data.session.status !== 'completed' && (
            <button
              className="resume-card"
              onClick={() => go('/lesson/' + data.session!.lessonId)}
            >
              <ArrowRight size={24} />
              <div>
                <strong>이어서 배우기</strong>
                <p>저장한 {data.session.stepIndex + 1}번째 단계로 돌아가요.</p>
              </div>
            </button>
          )}
        </>
      );
  else
    screen = (
      <div className="empty-state">
        <CircleHelp size={40} />
        <h1>이 페이지를 찾을 수 없어요.</h1>
        <button className="primary-button" onClick={() => go('/')}>
          처음으로
        </button>
      </div>
    );
  return (
    <div
      className={
        'app-shell ' +
        (isLesson ? 'learning-active ' : '') +
        (data.settings.largeText ? 'large-text ' : '') +
        (data.settings.reducedMotion ? 'reduced-motion' : '')
      }
    >
      <a className="skip-link" href="#main">
        본문으로 바로 가기
      </a>
      <aside className="sidebar">
        <button className="brand" onClick={() => go('/')}>
          <span className="brand-symbol">
            <AudioLines size={25} />
          </span>
          <span>
            신디 코치<small>신디사이저 조작법 배우기</small>
          </span>
        </button>
        <div className="sidebar-caption">나의 음악, 첫걸음</div>
        <nav aria-label="주 메뉴">
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? 'nav-item active' : 'nav-item'}
              aria-current={page === n.id ? 'page' : undefined}
              onClick={() => go(n.url)}
            >
              <n.icon size={21} />
              {n.title}
              {page === n.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="little-tip">
            <Headphones size={24} />
            <strong>서두르지 않아도 괜찮아요.</strong>
            <p>버튼 하나부터, 내 속도로.</p>
          </div>
          <button className="nav-item" onClick={() => go('/help')}>
            <CircleHelp size={20} />
            도움이 필요해요
          </button>
          <button className="nav-item" onClick={() => go('/settings')}>
            <Settings2 size={20} />
            설정
          </button>
          <span className="sidebar-footnote">화면 연습 · 미검수 도해</span>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <span>
            {page === 'learn'
              ? '배우기'
              : page === 'practice'
                ? '버튼 찾기'
                : page === 'progress'
                  ? '내 기록'
                  : '도움말'}
          </span>
          <div>
            <span className="guest-label">
              <span className="online-dot" />
              가입 없이 이용 중
            </span>
            <button
              className="top-help"
              aria-label="도움말"
              onClick={() => go('/help')}
            >
              <CircleHelp size={20} />
            </button>
            <span className="avatar">나</span>
          </div>
        </header>
        <main id="main" className="main-content">
          {isDemo && (
            <div className="demo-banner">
              <Monitor size={16} />
              <span>
                예시 악기 — 내 악기와 다를 수 있어요.{' '}
                <b>화면에서만 연습해요.</b>
              </span>
            </div>
          )}
          {!online && (
            <div className="notice-box">
              <WifiOff size={18} />
              오프라인이에요.{' '}
              {data.offline
                ? '저장한 화면 연습을 사용할 수 있어요.'
                : '자료를 미리 저장하지 않았다면 일부 화면을 열 수 없어요.'}
            </div>
          )}
          {storageError && (
            <div className="error-box" role="status">
              {storageError}
            </div>
          )}
          {screen}
        </main>
        <footer className="app-footer">
          <span>버튼 하나부터, 나의 소리까지.</span>
          <button onClick={() => go('/privacy')}>사진 처리 안내</button>
        </footer>
        {!isLesson && (
          <nav className="mobile-nav" aria-label="하단 메뉴">
            {nav.map((n) => (
              <button
                key={n.id}
                className={page === n.id ? 'active' : ''}
                aria-current={page === n.id ? 'page' : undefined}
                onClick={() => go(n.url)}
              >
                <n.icon size={22} />
                {n.title}
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
