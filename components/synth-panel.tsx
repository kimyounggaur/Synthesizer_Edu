'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Play,
  List,
  MousePointer2,
  ChevronRight,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { controls, type Side, type Control, type Motion } from '@/lib/content';

const sideNames: Record<Side, string> = {
  front: '전면',
  rear: '후면',
  left: '왼쪽 측면',
  right: '오른쪽 측면',
};
const motions: Record<Motion, string> = {
  press_once: '한 번 누르기',
  hold: '누르고 유지',
  double_press: '두 번 누르기',
  hold_and_press: '유지한 채 누르기',
  rotate: '천천히 돌리기',
  slide: '밀어서 조절하기',
  connect: '연결 위치 찾기',
  observe: '표시 확인하기',
};
type Props = {
  target?: string;
  secondary?: string;
  motion?: Motion;
  onInteract?: (id: string, value?: number) => void;
  compact?: boolean;
  display?: string;
  dual?: boolean;
  split?: boolean;
  value?: number;
  hints?: boolean;
};

function ControlVisual({
  c,
  active,
  secondary,
  value,
  playing,
  motion,
  led,
}: {
  c: Control;
  active: boolean;
  secondary: boolean;
  value: number;
  playing: boolean;
  motion: Motion;
  led: boolean;
}) {
  const x = c.x * 1440,
    y = c.y * 480,
    w = c.w * 1440,
    h = c.h * 480;
  const color = active ? '#137a74' : secondary ? '#2359d5' : '#798594';
  return (
    <g
      id={c.id.replace('.', '_') + '_visual'}
      className={active && playing ? 'motion-' + motion : undefined}
      style={{ transformOrigin: `${x + w / 2}px ${y + h / 2}px` }}
    >
      {c.kind === 'knob' ? (
        <>
          <circle
            cx={x + w / 2}
            cy={y + h / 2}
            r={Math.min(w, h) / 2}
            fill={active ? '#d8f5e9' : '#e9edf1'}
            stroke={color}
            strokeWidth="2.5"
          />
          <circle
            cx={x + w / 2}
            cy={y + h / 2}
            r={Math.min(w, h) / 2 - 7}
            fill="#fff"
            stroke={color}
          />
          <path
            d={`M${x + w / 2} ${y + 10}v14`}
            stroke={color}
            strokeWidth="3"
            transform={`rotate(${value * 2.6 - 130} ${x + w / 2} ${y + h / 2})`}
          />
        </>
      ) : c.kind === 'slider' ? (
        <>
          <rect
            x={x + w / 2 - 4}
            y={y}
            width="8"
            height={h}
            rx="4"
            fill="#bcc5ce"
          />
          <rect
            x={x + w / 2 - 15}
            y={y + h * (1 - value / 100) - 6}
            width="30"
            height="13"
            rx="3"
            fill={active ? '#137a74' : '#55606e'}
          />
        </>
      ) : c.kind === 'port' ? (
        <>
          <circle
            cx={x + w / 2}
            cy={y + h / 2}
            r={Math.min(w, h) / 2}
            fill="#e9edf1"
            stroke={color}
            strokeWidth="2.5"
          />
          <circle cx={x + w / 2} cy={y + h / 2} r="9" fill="#526170" />
          <circle cx={x + w / 2} cy={y + h / 2} r="4" fill="#eff3f6" />
        </>
      ) : c.kind === 'button' ? (
        <>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            rx="4"
            fill={active ? '#d5f2e7' : '#e9edf1'}
            stroke={color}
            strokeWidth={active ? 2.5 : 1.5}
          />
          <circle
            cx={x + 5}
            cy={y - 6}
            r="2.6"
            fill={led ? '#137a74' : '#b4bec8'}
          />
        </>
      ) : null}
      {!['display', 'keys'].includes(c.kind) && (
        <text
          x={x + w / 2}
          y={y - 13}
          textAnchor="middle"
          fontSize={c.w < 0.03 ? 7.5 : 9.5}
          fontWeight="600"
          fill={active ? '#09665b' : '#455261'}
        >
          {c.label}
        </text>
      )}
      {(active || secondary) && (
        <rect
          x={x - 9}
          y={y - 9}
          width={w + 18}
          height={h + 18}
          rx="10"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={secondary ? '5 3' : undefined}
          className={playing ? 'target-ring' : ''}
        />
      )}
    </g>
  );
}

export function SynthPanel(props: Props) {
  return <PanelContent key={props.target || 'front.piano'} {...props} />;
}
function PanelContent({
  target = 'front.piano',
  secondary,
  motion = 'press_once',
  onInteract,
  compact = false,
  display = 'PIANO  001',
  dual = false,
  split = false,
  value = 35,
  hints = true,
}: Props) {
  const targetControl = controls.find((c) => c.id === target) || controls[0];
  const [side, setSide] = useState<Side>(targetControl.side);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState(target);
  const [playing, setPlaying] = useState(false);
  const [list, setList] = useState(false);
  const [dial, setDial] = useState(value);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );
  useEffect(() => {
    const query = window.matchMedia('(max-width:680px)');
    if (query.matches) setList(true);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setPlaying(false), 2500);
    return () => clearTimeout(timer);
  }, [playing]);
  const current = controls.find((c) => c.id === selected) || targetControl;
  const click = (id: string, n?: number) => {
    setSelected(id);
    onInteract?.(id, n);
  };
  const focus = () => {
    const magnification = window.innerWidth < 680 ? 6 : 3;
    setSide(targetControl.side);
    setZoom(magnification);
    setOffset({
      x: (0.5 - targetControl.x - targetControl.w / 2) * 100 * magnification,
      y: (0.5 - targetControl.y - targetControl.h / 2) * 100 * magnification,
    });
  };
  return (
    <section
      className={'panel-stage ' + (compact ? 'compact' : '')}
      aria-label="화면 연습용 악기 패널"
    >
      <div className="panel-toolbar">
        <Tabs
          value={side}
          onValueChange={(v) => {
            setSide(v as Side);
            setZoom(1);
            setOffset({ x: 0, y: 0 });
          }}
        >
          <TabsList className="side-tabs">
            {(Object.keys(sideNames) as Side[]).map((s) => (
              <TabsTrigger key={s} value={s}>
                {sideNames[s]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <span className="schematic-label">학습용 도해</span>
      </div>
      <div
        className="panel-viewport"
        onDoubleClick={focus}
        onPointerDown={(e) => {
          if (zoom > 1 && !(e.target as Element).closest('button')) {
            pan.current = {
              x: e.clientX,
              y: e.clientY,
              ox: offset.x,
              oy: offset.y,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }
        }}
        onPointerMove={(e) => {
          if (pan.current) {
            setOffset({
              x: Math.max(
                -200,
                Math.min(200, pan.current.ox + (e.clientX - pan.current.x) / 5),
              ),
              y: Math.max(
                -130,
                Math.min(130, pan.current.oy + (e.clientY - pan.current.y) / 5),
              ),
            });
          }
        }}
        onPointerUp={() => (pan.current = null)}
        onPointerCancel={() => (pan.current = null)}
        style={{ touchAction: zoom > 1 ? 'none' : 'pan-y' }}
      >
        <div
          className="diagram-wrap"
          style={{
            transform: `translate(${offset.x}%,${offset.y}%) scale(${zoom})`,
          }}
        >
          <svg
            viewBox="0 0 1440 480"
            role="img"
            aria-label={`JUNO-DS61 ${sideNames[side]} 학습용 도해, 실물 위치 미검수`}
            className="synth-svg"
          >
            <g id="body">
              <rect
                x="18"
                y="40"
                width="1404"
                height="415"
                rx="24"
                fill="#fcfdfe"
                stroke="#596777"
                strokeWidth="2.5"
              />
              <path
                d="M33 60H1407M33 436H1407"
                stroke="#d6dde4"
                strokeWidth="2"
              />
              {[42, 1398].map((x) => (
                <g key={x}>
                  <circle cx={x} cy="72" r="3" fill="#bac4ce" />
                  <circle cx={x} cy="420" r="3" fill="#bac4ce" />
                </g>
              ))}
            </g>
            {side === 'front' ? (
              <>
                <g id="labels">
                  <text
                    x="72"
                    y="85"
                    fontSize="22"
                    fontWeight="700"
                    fill="#354556"
                  >
                    Roland
                  </text>
                  <text
                    x="1120"
                    y="86"
                    fontSize="23"
                    letterSpacing="1"
                    fontWeight="600"
                    fill="#52616f"
                  >
                    JUNO-DS61
                  </text>
                  <text
                    x="152"
                    y="92"
                    fontSize="11"
                    letterSpacing="2"
                    fill="#7c8996"
                  >
                    SOUND MODIFY
                  </text>
                  <text
                    x="450"
                    y="88"
                    fontSize="11"
                    letterSpacing="1"
                    fill="#7c8996"
                  >
                    KEYBOARD
                  </text>
                  <text
                    x="1110"
                    y="119"
                    fontSize="11"
                    letterSpacing="1"
                    fill="#7c8996"
                  >
                    PHRASE PAD
                  </text>
                </g>
                <g id="keys">
                  {Array.from({ length: 36 }, (_, i) => (
                    <rect
                      key={i}
                      x={78 + i * 35.6}
                      y="293"
                      width="35.6"
                      height="149"
                      rx="2"
                      fill={split ? (i < 16 ? '#e2edf8' : '#e4f3eb') : '#fff'}
                      stroke="#7c8792"
                      strokeWidth="1.2"
                    />
                  ))}
                  {Array.from(
                    { length: 35 },
                    (_, i) =>
                      ![2, 6].includes(i % 7) && (
                        <rect
                          key={i}
                          x={102 + i * 35.6}
                          y="293"
                          width="21"
                          height="86"
                          rx="2"
                          fill="#47535f"
                        />
                      ),
                  )}
                  {split && (
                    <>
                      <path d="M645 285v164" stroke="#2457cb" strokeWidth="3" />
                      <text x="170" y="425" fill="#244d92" fontSize="14">
                        LOWER
                      </text>
                      <text x="1120" y="425" fill="#16634e" fontSize="14">
                        UPPER
                      </text>
                    </>
                  )}
                </g>
                <g id="display">
                  <rect
                    x="624"
                    y="77"
                    width="246"
                    height="87"
                    rx="7"
                    fill="#e1eadf"
                    stroke="#899889"
                    strokeWidth="2"
                  />
                  <text x="638" y="97" fontSize="11" fill="#4d6556">
                    {dual
                      ? 'PERFORM · DUAL'
                      : split
                        ? 'PERFORM · SPLIT'
                        : 'PATCH · SCREEN PRACTICE'}
                  </text>
                  <text
                    x="638"
                    y="125"
                    fontSize="21"
                    fontFamily="monospace"
                    fill="#2b4c3d"
                  >
                    {display.slice(0, 19)}
                  </text>
                  <text x="638" y="146" fontSize="10" fill="#566e5c">
                    {dual
                      ? 'UPPER : PIANO  /  LOWER : STRINGS'
                      : '학습용 예시 화면'}
                  </text>
                </g>
                <g id="sliders" opacity=".65">
                  {[150, 194, 300].map((x) => (
                    <g key={x}>
                      <circle
                        cx={x}
                        cy="135"
                        r="17"
                        fill="#eef1f4"
                        stroke="#73818f"
                      />
                      <path
                        d={`M${x} 122v10`}
                        stroke="#73818f"
                        strokeWidth="2"
                      />
                    </g>
                  ))}
                  {[155, 202, 302].map((x) => (
                    <g key={x}>
                      <path
                        d={`M${x} 186v46`}
                        stroke="#c3cbd3"
                        strokeWidth="5"
                      />
                      <rect
                        x={x - 10}
                        y="204"
                        width="20"
                        height="9"
                        rx="2"
                        fill="#657480"
                      />
                    </g>
                  ))}
                </g>
                <g id="pads">
                  {Array.from({ length: 8 }, (_, i) => (
                    <rect
                      key={i}
                      x={1090 + (i % 4) * 66}
                      y={145 + Math.floor(i / 4) * 63}
                      width="50"
                      height="43"
                      rx="6"
                      fill="#e8edf1"
                      stroke="#8995a1"
                    />
                  ))}
                </g>
              </>
            ) : side === 'rear' ? (
              <>
                <text
                  x="80"
                  y="102"
                  fontSize="23"
                  fill="#52616f"
                  fontWeight="600"
                >
                  JUNO-DS61
                </text>
                <text x="80" y="348" fontSize="19" fill="#667683">
                  후면 단자 · 악기를 옮기지 말고 안전하게 보이는 곳에서
                  확인하세요.
                </text>
              </>
            ) : (
              <>
                <path
                  d={
                    side === 'left'
                      ? 'M370 300L460 140H1000L1080 300Z'
                      : 'M370 300L460 140H1000L1080 300Z'
                  }
                  fill="#eef2f6"
                  stroke="#72808e"
                  strokeWidth="3"
                />
                <path d="M465 155H990" stroke="#a3aeba" strokeWidth="6" />
                <text
                  x="720"
                  y="356"
                  textAnchor="middle"
                  fontSize="20"
                  fill="#566675"
                >
                  이 기종의 조작부는 전면·후면에서 확인해요.
                </text>
              </>
            )}
            <g id="controls">
              {controls
                .filter((c) => c.side === side)
                .map((c) => (
                  <ControlVisual
                    key={c.id}
                    c={c}
                    active={hints && c.id === target}
                    secondary={hints && c.id === secondary}
                    value={dial}
                    playing={playing}
                    motion={motion}
                    led={
                      c.id === 'front.dual'
                        ? dual
                        : c.id === 'front.split'
                          ? split
                          : false
                    }
                  />
                ))}
            </g>
          </svg>
          <div className="hotspot-layer">
            {controls
              .filter((c) => c.side === side)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={'hotspot ' + (selected === c.id ? 'selected' : '')}
                  style={{
                    left: c.x * 100 + '%',
                    top: c.y * 100 + '%',
                    width: c.w * 100 + '%',
                    height: c.h * 100 + '%',
                  }}
                  aria-label={`${c.label}: ${c.easy}. ${c.location}`}
                  title={c.label}
                  onClick={() => click(c.id)}
                />
              ))}
          </div>
        </div>
        {!compact && hints && side === targetControl.side && (
          <button className="focus-callout" onClick={focus}>
            <span className="target-dot" />
            {targetControl.label}
            <ChevronRight size={14} />
          </button>
        )}
      </div>
      {!compact && (
        <>
          <div className="panel-footer">
            <span>
              <MousePointer2 size={15} /> 버튼을 눌러 찾아보세요
            </span>
            <div className="zoom-tools">
              <button
                aria-label="축소"
                onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
              >
                <Minus size={17} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                aria-label="확대"
                onClick={() => setZoom((z) => Math.min(6, z + 0.5))}
              >
                <Plus size={17} />
              </button>
              <button
                aria-label="전체 보기"
                onClick={() => {
                  setZoom(1);
                  setOffset({ x: 0, y: 0 });
                }}
              >
                <Maximize2 size={17} />
              </button>
            </div>
          </div>
          <div className="control-detail">
            <div className="control-caption">
              <span className="label-kicker">
                {sideNames[current.side]} · {current.label}
              </span>
              <strong>{current.easy}</strong>
              <span>{current.location}</span>
            </div>
            <button
              className="icon-action"
              aria-label="조작 시연 다시 보기"
              onClick={() => {
                setPlaying(false);
                requestAnimationFrame(() => setPlaying(true));
              }}
            >
              {playing ? <RotateCcw size={18} /> : <Play size={18} />}
              <span>{motions[motion]}</span>
            </button>
          </div>
          {['knob', 'slider'].includes(current.kind) && (
            <div className="dial-control">
              <button
                aria-label="값 낮추기"
                onClick={() => {
                  const n = Math.max(0, dial - 10);
                  setDial(n);
                  click(current.id, n);
                }}
              >
                <Minus size={18} />
              </button>
              <Slider
                aria-label={`${current.label} 화면 연습 값`}
                value={[dial]}
                onValueChange={(v) => {
                  const n = Array.isArray(v) ? v[0] : v;
                  setDial(n);
                  click(current.id, n);
                }}
                min={0}
                max={100}
              />
              <button
                aria-label="값 높이기"
                onClick={() => {
                  const n = Math.min(100, dial + 10);
                  setDial(n);
                  click(current.id, n);
                }}
              >
                <Plus size={18} />
              </button>
              <output>{dial}</output>
            </div>
          )}
          <button
            className="panel-list-toggle"
            onClick={() => setList((v) => !v)}
            aria-expanded={list}
          >
            <List size={16} /> 버튼 이름으로 찾기{' '}
            <span>{list ? '접기' : '전체 보기'}</span>
          </button>
          {list && (
            <div className="control-list">
              {controls
                .filter((c) => c.side === side)
                .map((c) => (
                  <button key={c.id} onClick={() => click(c.id)}>
                    <strong>{c.label}</strong>
                    <span>{c.easy}</span>
                  </button>
                ))}
              {!controls.some((c) => c.side === side) && (
                <p>전면 또는 후면을 선택해 주세요.</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
