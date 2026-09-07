'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ImagePlus,
  Search,
  Check,
  KeyboardMusic,
  ShieldCheck,
  ExternalLink,
  ScanLine,
  LoaderCircle,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { catalog, MODEL_ID, type Model } from '@/lib/content';
import { matchModels } from '@/lib/engine';
type Go = (path: string) => void;
export function ModelSearch({
  go,
  onConfirm,
  initialText = '',
}: {
  go: Go;
  onConfirm: (m: Model) => void;
  initialText?: string;
}) {
  const [query, setQuery] = useState(initialText);
  const [chosen, setChosen] = useState<Model | null>(null);
  const [ack, setAck] = useState(false);
  const [request, setRequest] = useState('');
  const [requestStatus, setRequestStatus] = useState('');
  const matches = matchModels(query);
  const candidates = query.trim() ? matches.candidates : catalog.slice(0, 3);
  if (chosen)
    return (
      <div className="narrow-screen">
        <button
          className="back-button"
          onClick={() => {
            setChosen(null);
            setAck(false);
          }}
        >
          <ArrowLeft size={18} />
          모델 후보로
        </button>
        <span className="page-eyebrow">마지막으로, 모델 확인</span>
        <h1>이 악기가 맞나요?</h1>
        <p className="page-description">
          악기에 적힌 이름의 끝부분까지 비교해 주세요.
        </p>
        <div className="model-confirm-card">
          <KeyboardMusic size={52} strokeWidth={1.1} />
          <span>{chosen.brand}</span>
          <h2>
            {chosen.name.replace(chosen.suffix, '')}
            <mark>{chosen.suffix}</mark>
          </h2>
          <div className="model-specs">
            <span>{chosen.keys}건반</span>
            <span>내장 스피커 없음</span>
          </div>
          <span className="pill">버튼별 실제 안내 준비 중</span>
        </div>
        <label className="check-row">
          <Checkbox checked={ack} onCheckedChange={(v) => setAck(Boolean(v))} />
          <span>
            모델명 끝부분이 <b>{chosen.suffix}</b>인 것을 확인했어요.
          </span>
        </label>
        <button
          className="primary-button"
          disabled={!ack}
          onClick={() => onConfirm(chosen)}
        >
          <Check size={19} />이 악기가 맞아요
          <ArrowRight size={18} />
        </button>
        <button
          className="text-button"
          onClick={() => {
            setChosen(null);
            setAck(false);
          }}
        >
          모델은 맞지만 패널이 달라요 / 다른 모델이에요
        </button>
        <p className="notice-box">
          모델 확인과 조작 안내 지원은 달라요. 현재 실물 검수 전으로 실제 조작
          안내는 준비 중이에요.
        </p>
      </div>
    );
  return (
    <div className="narrow-screen">
      <button className="back-button" onClick={() => go('/')}>
        <ArrowLeft size={18} />
        처음으로
      </button>
      <span className="page-eyebrow">내 악기 찾기</span>
      <h1>모델명을 알려주세요.</h1>
      <p className="page-description">
        브랜드와 숫자, + 같은 끝부분까지 입력해 주세요.
      </p>
      <label className="search-field">
        <Search size={21} />
        <input
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 100))}
          placeholder="예: Roland JUNO-DS61"
          aria-label="모델명 검색"
        />
      </label>
      <p className="search-hint">
        {query
          ? matches.status === 'exact_match'
            ? '이름이 일치해도 모델 끝부분을 직접 확인해 주세요.'
            : matches.candidates.length
              ? '비슷한 이름이 있어요. 숫자와 + 표시를 확인해 주세요.'
              : '찾는 모델이 아직 카탈로그에 없어요.'
          : '첫 학습 예시 모델 · 정확한 모델을 선택해 주세요.'}
      </p>
      <div className="model-results">
        {candidates.map((m) => (
          <button key={m.id} onClick={() => setChosen(m)}>
            <span className="model-thumbnail">
              <KeyboardMusic size={30} />
            </span>
            <div>
              <span>{m.brand}</span>
              <strong>{m.name}</strong>
              <small>
                {m.id === MODEL_ID
                  ? '문헌 확인 · 실제 안내 준비 중'
                  : '모델 등록 · 안내 준비 중'}
              </small>
            </div>
            <ChevronRightIcon />
          </button>
        ))}
      </div>
      <div className="alternative-box">
        <Camera size={21} />
        <div>
          <strong>모델 이름을 잘 모르겠다면</strong>
          <button onClick={() => go('/identify')}>
            사진으로 찾아보기 <ArrowRight size={15} />
          </button>
        </div>
      </div>
      {query && candidates.length === 0 && (
        <form
          className="support-request"
          onSubmit={async (e) => {
            e.preventDefault();
            setRequestStatus('저장 중…');
            try {
              const r = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'model_request',
                  modelName: query,
                  message: request,
                }),
              });
              setRequestStatus(
                r.ok
                  ? '지원 요청을 저장했어요. 확인되지 않은 완료 일정은 안내하지 않아요.'
                  : '요청을 저장하지 못했어요. 연결 후 다시 시도해 주세요.',
              );
            } catch {
              setRequestStatus('연결 후 다시 시도해 주세요.');
            }
          }}
        >
          <h3>이 모델의 안내를 요청할까요?</h3>
          <label>
            추가로 알려줄 내용 (선택)
            <textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              maxLength={500}
              placeholder="이름, 일련번호 등 개인정보는 적지 않아도 돼요."
            />
          </label>
          <button className="outline-button" type="submit">
            지원 요청 남기기
          </button>
          <p role="status">{requestStatus}</p>
        </form>
      )}
    </div>
  );
}
function ChevronRightIcon() {
  return <ArrowRight size={18} />;
}

export function IdentifyScreen({
  go,
  onRead,
}: {
  go: Go;
  onRead: (text: string) => void;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 20, w: 100, h: 60 });
  const [preview, setPreview] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [consent, setConsent] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const logicalRequest = useRef<{ preview: string; id: string } | null>(null);
  const sourceImage = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    fetch('/api/identify/status')
      .then((r) => r.json() as Promise<{ configured: boolean }>)
      .then((d) => setConfigured(d.configured === true))
      .catch(() => setConfigured(false));
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    if (video.current && stream) video.current.srcObject = stream;
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [stream]);
  useEffect(() => {
    if (!image) return;
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (live) {
        sourceImage.current = img;
        renderCrop(img);
      }
    };
    img.src = image;
    return () => {
      live = false;
      sourceImage.current = null;
    };
  }, [image]);
  function renderCrop(img: HTMLImageElement, rect = crop) {
    const canvas = document.createElement('canvas');
    const sw = (img.naturalWidth * rect.w) / 100,
      sh = (img.naturalHeight * rect.h) / 100;
    const scale = Math.min(1, 1600 / Math.max(sw, sh));
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(
      img,
      (img.naturalWidth * rect.x) / 100,
      (img.naturalHeight * rect.y) / 100,
      sw,
      sh,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    setPreview(canvas.toDataURL('image/jpeg', 0.88));
  }
  function adjust(key: keyof typeof crop, v: number) {
    const next = { ...crop, [key]: v };
    next.x = Math.min(next.x, 100 - next.w);
    next.y = Math.min(next.y, 100 - next.h);
    setCrop(next);
    if (sourceImage.current) renderCrop(sourceImage.current, next);
  }
  async function loadFile(file?: File) {
    setError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError(
        'JPG, PNG, WebP 사진을 선택해 주세요. HEIC 사진은 JPG로 변환한 뒤 선택할 수 있어요.',
      );
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('10MB 이하 사진을 선택해 주세요.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > 40_000_000) {
        bitmap.close();
        setError(
          '사진이 너무 커요. 4천만 화소 이하 사진으로 다시 선택해 주세요.',
        );
        return;
      }
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas
        .getContext('2d')
        ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      setImage(canvas.toDataURL('image/jpeg', 0.9));
      setStream(null);
    } catch {
      setError(
        '이 사진을 열 수 없어요. 다른 사진을 선택하거나 모델명을 입력해 주세요.',
      );
    }
  }
  async function openCamera() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInput.current?.click();
      return;
    }
    try {
      setStream(
        await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        }),
      );
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? '카메라 사용이 허용되지 않았어요. 사진을 선택하거나 직접 입력해 주세요.'
          : '카메라를 사용할 수 없어요. 다른 앱이 사용 중인지 확인하거나 사진을 선택해 주세요.',
      );
    }
  }
  function takePhoto() {
    if (!video.current || !video.current.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = video.current.videoWidth;
    c.height = video.current.videoHeight;
    c.getContext('2d')?.drawImage(video.current, 0, 0);
    setImage(c.toDataURL('image/jpeg', 0.9));
    setStream(null);
  }
  async function identify() {
    if (!preview || !consent) return;
    setBusy(true);
    setError('');
    setStage('사진에서 글자를 읽는 중');
    const id = ++generation.current;
    const controller = new AbortController();
    abort.current = controller;
    const slow = setTimeout(
      () => setStage('조금 더 걸리고 있어요. 직접 입력으로도 찾을 수 있어요.'),
      8000,
    );
    const timeout = setTimeout(() => controller.abort(), 15500);
    try {
      const blob = await (await fetch(preview)).blob();
      const form = new FormData();
      form.set('image', blob, 'model-crop.jpg');
      if (logicalRequest.current?.preview !== preview)
        logicalRequest.current = { preview, id: crypto.randomUUID() };
      form.set('client_request_id', logicalRequest.current.id);
      form.set('consent', 'true');
      const sessionResponse = await fetch('/api/session', {
        signal: controller.signal,
      });
      if (!sessionResponse.ok)
        throw new Error('분석 세션을 준비하지 못했어요.');
      const r = await fetch('/api/identify', {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      let data = (await r.json()) as {
        message?: string;
        text?: string;
        code?: string;
        scanId?: string;
        state?: string;
      };
      if (
        r.status === 409 &&
        data.code === 'REQUEST_IN_PROGRESS' &&
        data.scanId
      ) {
        const scanId = data.scanId;
        while (!controller.signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 900));
          const pending = await fetch('/api/identify/' + scanId, {
            signal: controller.signal,
          });
          data = (await pending.json()) as typeof data;
          if (data.state === 'RESULT_READY') break;
          if (data.state === 'failed')
            throw new Error(
              '이 요청의 분석에 실패했어요. 사진을 다시 선택해 주세요.',
            );
        }
      }
      if (id !== generation.current) return;
      if (!r.ok && data.state !== 'RESULT_READY') {
        if (data.code === 'REQUEST_ALREADY_PROCESSED')
          logicalRequest.current = null;
        throw new Error(data.message || '인식 서비스를 연결하지 못했어요.');
      }
      setStage('모델 이름을 비교하는 중');
      if (!data.text) {
        setError(
          '읽을 수 있는 모델명이 없었어요. 영역을 다시 조정하거나 직접 입력해 주세요.',
        );
        return;
      }
      onRead(data.text);
    } catch (e) {
      if (id === generation.current)
        setError(
          e instanceof Error && e.name === 'AbortError'
            ? '인식 시간이 초과됐어요. 다시 시도하거나 직접 입력해 주세요.'
            : e instanceof Error
              ? e.message
              : '인식에 실패했어요.',
        );
    } finally {
      clearTimeout(slow);
      clearTimeout(timeout);
      if (id === generation.current) setBusy(false);
    }
  }
  return (
    <div className="narrow-screen">
      <button className="back-button" onClick={() => go('/')}>
        <ArrowLeft size={18} />
        처음으로
      </button>
      <span className="page-eyebrow">내 악기 찍기</span>
      <h1>
        {image
          ? '찾을 글자만 남겨 주세요.'
          : '악기에 적힌 모델명을\n찍어 주세요.'}
      </h1>
      <p className="page-description">
        브랜드와 숫자, + 같은 끝부분까지 보이게 해 주세요.
      </p>
      <input
        ref={cameraInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        aria-label="카메라로 사진 찍기"
        onChange={(e) => loadFile(e.target.files?.[0])}
      />
      <input
        ref={photoInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="사진 선택"
        onChange={(e) => loadFile(e.target.files?.[0])}
      />
      {stream ? (
        <div className="camera-preview">
          <video ref={video} autoPlay playsInline muted />
          <span className="camera-frame" />
          <button className="primary-button" onClick={takePhoto}>
            <Camera size={21} />
            사진 찍기
          </button>
        </div>
      ) : image ? (
        <>
          <div className="crop-source">
            <img src={image} alt="선택한 사진 전체" />
            <div
              className="crop-frame"
              style={{
                left: crop.x + '%',
                top: crop.y + '%',
                width: crop.w + '%',
                height: crop.h + '%',
              }}
            />
          </div>
          <div className="crop-sliders">
            {(
              [
                { key: 'w', name: '영역 너비', min: 10, max: 100 },
                { key: 'h', name: '영역 높이', min: 10, max: 100 },
                { key: 'x', name: '가로 위치', min: 0, max: 100 - crop.w },
                { key: 'y', name: '세로 위치', min: 0, max: 100 - crop.h },
              ] as const
            ).map((v) => (
              <label key={v.key}>
                <span>{v.name}</span>
                <Slider
                  aria-label={v.name}
                  min={v.min}
                  max={Math.max(v.min + 1, v.max)}
                  value={[crop[v.key]]}
                  onValueChange={(n) =>
                    adjust(v.key, Math.min(v.max, Array.isArray(n) ? n[0] : n))
                  }
                />
                <input
                  aria-label={v.name + ' 숫자'}
                  type="number"
                  min={v.min}
                  max={v.max}
                  value={crop[v.key]}
                  onChange={(e) =>
                    adjust(
                      v.key,
                      Math.min(v.max, Math.max(v.min, Number(e.target.value))),
                    )
                  }
                />
              </label>
            ))}
          </div>
          {preview && (
            <div className="crop-result">
              <span>실제로 전송할 영역</span>
              <img src={preview} alt="인식 서비스에 전송할 잘라낸 영역" />
            </div>
          )}
          <label className="check-row">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(Boolean(v))}
            />
            <span>
              선택한 영역을 글자 인식 서비스로 전송하는 데 동의해요.{' '}
              <button className="inline-link" onClick={() => go('/privacy')}>
                자세히
              </button>
            </span>
          </label>
          <button
            className="primary-button"
            disabled={!consent || busy}
            onClick={identify}
          >
            {busy ? (
              <LoaderCircle className="spin" size={21} />
            ) : (
              <ScanLine size={21} />
            )}{' '}
            {busy ? stage : '이 부분으로 찾기'}
          </button>
          {busy && (
            <button
              className="text-button"
              onClick={() => {
                generation.current++;
                abort.current?.abort();
                setBusy(false);
              }}
            >
              분석 대기 취소
            </button>
          )}
          <button
            className="text-button"
            onClick={() => {
              setImage(null);
              setPreview(null);
              setConsent(false);
            }}
          >
            다시 찍기
          </button>
        </>
      ) : (
        <>
          <div className="camera-placeholder">
            <ScanLine size={58} strokeWidth={1} />
            <div className="model-example">
              Roland{' '}
              <b>
                JUNO-DS<span>61</span>
              </b>
            </div>
            <p>악기 앞면에 적힌 모델명을 찾아보세요.</p>
          </div>
          <button className="primary-button" onClick={openCamera}>
            <Camera size={22} />
            촬영 시작
            <ArrowRight size={19} />
          </button>
          <button
            className="outline-button spaced"
            onClick={() => photoInput.current?.click()}
          >
            <ImagePlus size={20} />
            사진 선택하기
          </button>
        </>
      )}
      {configured === false && (
        <div className="notice-box">
          <ShieldCheck size={18} />
          <span>
            사진 인식 서비스 연결 전이에요. 촬영·영역 조정은 사용할 수 있고,
            모델명 직접 입력으로 시작할 수 있어요.
          </span>
        </div>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <button className="text-button" onClick={() => go('/models')}>
        <Search size={17} />
        모델명 직접 입력
      </button>
      <p className="privacy-note">
        인식용 사진은 앱 사진 보관함에 저장하지 않아요. 일련번호·사람 얼굴은
        영역에서 제외해 주세요.
      </p>
      <div role="status" className="sr-only">
        {busy ? stage : ''}
      </div>
    </div>
  );
}
export function ModelReady({
  model,
  go,
  onDemo,
}: {
  model: Model;
  go: Go;
  onDemo: () => void;
}) {
  return (
    <div className="narrow-screen">
      <button className="back-button" onClick={() => go('/models')}>
        <ArrowLeft size={18} />
        모델 다시 선택
      </button>
      <span className="page-eyebrow">내 악기 확인 완료</span>
      <h1>
        {model.brand}
        <br />
        {model.name}
      </h1>
      <p className="page-description">
        이 모델을 찾았지만, 버튼별 실제 조작 안내는 아직 준비 중이에요.
      </p>
      <div className="status-card">
        <span className="pill">
          {model.id === MODEL_ID
            ? '문헌 확인 · 실물 검수 전'
            : '모델 등록 · 안내 준비 중'}
        </span>
        <h2>정확한 안내를 준비하고 있어요.</h2>
        <p>
          모델명 인식과 조작 안내 지원은 별도로 확인해요. 비슷한 기종의 안내로
          대신하지 않아요.
        </p>
        <a
          className="outline-button"
          href={model.manual}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={17} />
          공식 설명서 보기
        </a>
      </div>
      {model.id === MODEL_ID && (
        <>
          <h3 className="spaced">기다리는 동안, 화면에서 배워볼까요?</h3>
          <p className="page-description">
            예시 악기의 도해로 버튼 위치와 조작 동작을 연습할 수 있어요.
          </p>
          <button className="primary-button" onClick={onDemo}>
            화면 연습으로 둘러보기 <ArrowRight size={18} />
          </button>
        </>
      )}
      <button className="text-button" onClick={() => go('/models')}>
        다른 악기 찾기
      </button>
    </div>
  );
}
