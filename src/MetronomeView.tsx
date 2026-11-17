import { useRef } from "react";
import {
  Play,
  Square,
  Minus,
  Plus,
  Hand,
  Volume2,
  Bookmark,
  Timer,
  TrendingUp,
  Trash2,
} from "lucide-react";
import { tapTempo } from "./lib/metronome";
import type { MetronomeConfig, Tick } from "./lib/metronome";

export interface MetronomeProps {
  config: MetronomeConfig;
  setConfig: (update: Partial<MetronomeConfig>) => void;
  playing: boolean;
  tick: Tick | null;
  toggle: () => void;
  presets: { name: string; config: MetronomeConfig }[];
  savePreset: (name: string) => void;
  removePreset: (index: number) => void;
}
export default function MetronomeView({
  config: c,
  setConfig,
  playing,
  tick,
  toggle,
  presets,
  savePreset,
  removePreset,
}: MetronomeProps) {
  const taps = useRef<number[]>([]);
  const presetName = useRef<HTMLInputElement>(null);
  function tap() {
    const now = performance.now();
    if (now - (taps.current.at(-1) ?? 0) > 3000) taps.current = [];
    taps.current = [...taps.current.slice(-6), now];
    const bpm = tapTempo(taps.current);
    if (bpm) setConfig({ bpm });
  }
  return (
    <div className="metronome-layout">
      <section className="card metro-main">
        <div className="section-heading">
          <span className="eyebrow">METRONOME</span>
          <span className="pill">
            {c.beats}/{c.denominator} · {c.denominator === 8 ? "♪" : "♩"} ={" "}
            {c.bpm}
          </span>
        </div>
        <div className="tempo-control">
          <button
            className="round"
            aria-label="템포 1 낮추기"
            onClick={() => setConfig({ bpm: Math.max(20, c.bpm - 1) })}
          >
            <Minus />
          </button>
          <div>
            <input
              aria-label="BPM"
              type="number"
              min="20"
              max="300"
              value={c.bpm}
              onChange={(e) =>
                setConfig({
                  bpm: Math.max(
                    20,
                    Math.min(300, Number(e.target.value) || 20),
                  ),
                })
              }
            />
            <span>BPM</span>
          </div>
          <button
            className="round"
            aria-label="템포 1 높이기"
            onClick={() => setConfig({ bpm: Math.min(300, c.bpm + 1) })}
          >
            <Plus />
          </button>
        </div>
        <p className="tempo-name">
          {c.bpm < 60
            ? "Largo"
            : c.bpm < 76
              ? "Adagio"
              : c.bpm < 108
                ? "Andante"
                : c.bpm < 120
                  ? "Moderato"
                  : c.bpm < 168
                    ? "Allegro"
                    : "Presto"}
        </p>
        <input
          className="tempo-slider"
          aria-label="템포 슬라이더"
          type="range"
          min="20"
          max="300"
          value={c.bpm}
          onChange={(e) => setConfig({ bpm: +e.target.value })}
        />
        <div className="beat-lights">
          {Array.from({ length: c.beats }, (_, i) => (
            <button
              key={i}
              aria-label={`${i + 1}박 ${["쉼", "보통", "강세"][c.accents[i] ?? 1]} — 클릭하여 변경`}
              title="클릭: 강세 → 쉼 → 보통"
              className={`beat-light strength-${c.accents[i] ?? 1} ${playing && tick?.beat === i ? "lit" : ""}`}
              onClick={() => {
                const accents = [...c.accents];
                accents[i] = (((accents[i] ?? 1) + 1) % 3) as 0 | 1 | 2;
                setConfig({ accents });
              }}
            >
              {i + 1}
              <span>{["−", "•", "▲"][c.accents[i] ?? 1]}</span>
            </button>
          ))}
        </div>

        <div className="metro-buttons">
          <button
            type="button"
            className="button secondary"
            onClick={tap}
            aria-label="탭 템포"
            title="탭 템포"
          >
            <Hand size={18} />
            <span>Tap</span>
          </button>
          <button
            type="button"
            className="button primary play-large"
            onClick={toggle}
            aria-label={playing ? "메트로놈 정지" : "메트로놈 시작"}
            title="Space"
          >
            {playing ? (
              <Square size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
            {playing ? "정지" : "시작"}
            <kbd>Space</kbd>
          </button>
        </div>
        <div className="metro-status">
          <span className={`status-dot ${playing ? "on" : ""}`} />
          {playing
            ? `${tick?.countIn ? "카운트인" : `${tick?.bar ?? 1} 마디`} · 현재 ${tick?.bpm ?? c.bpm} BPM`
            : "대기"}
        </div>
      </section>
      <div className="stack">
        <section className="card">
          <h3>리듬 설정</h3>
          <div className="form-row">
            <label>
              박자
              <select
                value={c.beats}
                onChange={(e) =>
                  setConfig({
                    beats: +e.target.value,
                    accents: Array.from({ length: +e.target.value }, (_, i) =>
                      i === 0 ? 2 : 1,
                    ),
                  })
                }
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 12].map((n) => (
                  <option key={n} value={n}>
                    {n} 박
                  </option>
                ))}
              </select>
            </label>
            <label>
              박 단위
              <select
                value={c.denominator}
                onChange={(e) => setConfig({ denominator: +e.target.value })}
              >
                {[4, 8].map((n) => (
                  <option key={n} value={n}>
                    {n}분음표
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            세분박
            <div className="segmented subdivisions">
              {[1, 2, 3, 4].map((s, i) => (
                <button
                  type="button"
                  key={s}
                  aria-label={`한 박 ${s}분할`}
                  aria-pressed={c.subdivision === s}
                  className={c.subdivision === s ? "active" : ""}
                  onClick={() => setConfig({ subdivision: s })}
                >
                  {["×1", "×2", "×3", "×4"][i]}
                  <small>{s === 3 ? "셋잇단" : ""}</small>
                </button>
              ))}
            </div>
          </label>
          <label className="toggle-row">
            <span>
              스윙 <small>2:1</small>
            </span>
            <input
              type="checkbox"
              checked={c.swing}
              disabled={c.subdivision !== 2}
              onChange={(e) => setConfig({ swing: e.target.checked })}
            />
          </label>
          <div className="form-row">
            <label>
              클릭 사운드
              <select
                value={c.sound}
                onChange={(e) =>
                  setConfig({ sound: e.target.value as "wood" | "digital" })
                }
              >
                <option value="wood">Wood</option>
                <option value="digital">Digital</option>
              </select>
            </label>
            <label>
              카운트인
              <select
                value={c.countIn}
                onChange={(e) => setConfig({ countIn: +e.target.value })}
              >
                <option value="0">없음</option>
                <option value="1">1마디</option>
                <option value="2">2마디</option>
              </select>
            </label>
          </div>
          <label className="volume-row">
            <Volume2 size={18} />
            <input
              aria-label="메트로놈 볼륨"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={c.volume}
              onChange={(e) => setConfig({ volume: +e.target.value })}
            />
            <span>{Math.round(c.volume * 100)}%</span>
          </label>
        </section>
        <section className="card">
          <h3>
            <TrendingUp size={18} /> 템포 증가
          </h3>
          <div className="form-row">
            <label>
              간격
              <select
                value={c.rampEvery}
                onChange={(e) => setConfig({ rampEvery: +e.target.value })}
              >
                <option value="0">사용 안 함</option>
                {[2, 4, 8, 16].map((n) => (
                  <option key={n} value={n}>
                    {n}마디마다
                  </option>
                ))}
              </select>
            </label>
            <label>
              BPM
              <select
                value={c.rampBy}
                onChange={(e) => setConfig({ rampBy: +e.target.value })}
              >
                {[1, 2, 3, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    +{n} BPM
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            <Timer size={15} /> 자동 정지
            <select
              value={c.timerMinutes}
              onChange={(e) => setConfig({ timerMinutes: +e.target.value })}
            >
              <option value="0">제한 없음</option>
              {[1, 3, 5, 10, 15, 30].map((n) => (
                <option key={n} value={n}>
                  {n}분 후
                </option>
              ))}
            </select>
          </label>
        </section>
      </div>
      <section className="card full-width">
        <div className="section-heading">
          <h3>
            <Bookmark size={18} /> 프리셋
          </h3>
        </div>
        <form
          className="preset-form"
          onSubmit={(e) => {
            e.preventDefault();
            const name = presetName.current?.value.trim();
            if (name) {
              savePreset(name);
              presetName.current!.value = "";
            }
          }}
        >
          <input
            ref={presetName}
            maxLength={40}
            placeholder="프리셋 이름"
            aria-label="프리셋 이름"
          />
          <button
            className="button secondary"
            type="submit"
            aria-label="현재 설정 저장"
            title="현재 설정 저장"
          >
            <Plus size={16} />
          </button>
        </form>
        <div className="preset-list">
          {presets.length ? (
            presets.map((p, i) => (
              <div className="preset-item" key={i}>
                <button onClick={() => setConfig(p.config)}>
                  <span>{p.name}</span>
                  <small>
                    {p.config.bpm} BPM · {p.config.beats}/{p.config.denominator}
                  </small>
                </button>
                <button
                  className="icon-button"
                  onClick={() => removePreset(i)}
                  aria-label={`${p.name} 삭제`}
                  title="삭제"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))
          ) : (
            <span className="small muted">—</span>
          )}
        </div>
      </section>
    </div>
  );
}
