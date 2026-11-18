import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Drum,
  Headphones,
  LoaderCircle,
  Minus,
  Music2,
  Pause,
  Piano,
  Play,
  Plus,
  Repeat2,
  SkipBack,
  SlidersHorizontal,
  Square,
  Timer,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import type { Standard } from "./data/standards";
import { JazzBacking } from "./lib/backing";
import type { BackingConfig, BackingPosition } from "./lib/backing";
import {
  flattenBars,
  getMeter,
  parseJazzChord,
  transposeChord,
} from "./lib/jazz";
import { LocalTrack } from "./lib/track";
import type { TrackState } from "./lib/track";
import { pitchClasses } from "./lib/theory";
import "./practice.css";

interface JazzPracticeProps {
  standard: Standard;
  transpose: number;
  onTranspose: (semitones: number) => void;
  onPosition: (bar: number | null) => void;
  onActiveChange?: (active: boolean) => void;
  onTempo?: (bpm: number) => void;
}
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const initialTrack: TrackState = {
  playing: false,
  position: 0,
  duration: 0,
  ended: false,
  pitchSupported: true,
  error: null,
};
const formatTime = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, "0")}`;
function initialStyle(standard: Standard): BackingConfig["style"] {
  const style = standard.style.toLowerCase();
  return style.includes("bossa")
    ? "bossa"
    : style.includes("ballad")
      ? "ballad"
      : "swing";
}

function BackingOutput({
  engine,
  active,
  onInterrupted,
}: {
  engine: JazzBacking;
  active: boolean;
  onInterrupted: () => void;
}) {
  const [db, setDb] = useState(-72);
  useEffect(() => {
    if (!active) return;
    let interruptedAt = 0;
    const timer = window.setInterval(() => {
      const level = engine.readOutputLevel();
      setDb(
        Math.min(
          0,
          Math.max(-72, Math.round(20 * Math.log10(Math.max(level, 0.00001)))),
        ),
      );
      if (engine.getState() === "running" || document.hidden) {
        interruptedAt = 0;
      } else if (!interruptedAt) {
        interruptedAt = performance.now();
      } else if (performance.now() - interruptedAt > 1500) {
        onInterrupted();
      }
    }, 125);
    return () => window.clearInterval(timer);
  }, [engine, active, onInterrupted]);
  if (!active) return null;
  return (
    <span
      className="practice-output"
      role="meter"
      aria-label="반주 출력"
      aria-valuemin={-72}
      aria-valuemax={0}
      aria-valuenow={db}
      title={`반주 출력 ${db} dB`}
    >
      {[-60, -48, -36, -24, -12].map((threshold) => (
        <i key={threshold} className={db > threshold ? "lit" : ""} />
      ))}
    </span>
  );
}

export default function JazzPractice({
  standard,
  transpose,
  onTranspose,
  onPosition,
  onActiveChange,
  onTempo,
}: JazzPracticeProps) {
  const bars = useMemo(() => flattenBars(standard), [standard]);
  const meter = getMeter(standard);
  const [source, setSource] = useState<"backing" | "file">("backing");
  const [bpm, setBpm] = useState(standard.bpm);
  const [bpmDraft, setBpmDraft] = useState(String(standard.bpm));
  const [style, setStyle] = useState<BackingConfig["style"]>(() =>
    initialStyle(standard),
  );
  const [loop, setLoop] = useState(true);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(bars.length - 1);
  const [countIn, setCountIn] = useState(1);
  const [volume, setVolume] = useState(0.65);
  const [levels, setLevels] = useState({ piano: 0.75, bass: 0.7, drums: 0.4 });
  const [backingPlaying, setBackingPlaying] = useState(false);
  const [position, setPosition] = useState<BackingPosition | null>(null);
  const [starting, setStarting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [trackState, setTrackState] = useState<TrackState>(initialTrack);
  const [rate, setRate] = useState(1);
  const [fileLoop, setFileLoop] = useState(false);
  const [fileA, setFileA] = useState(0);
  const [fileB, setFileB] = useState(0);
  const baseRoot = parseJazzChord(standard.key.split(" ")[0])?.root ?? 0;
  const [fileRoot, setFileRoot] = useState(baseRoot);
  const filePitch =
    ((((baseRoot + transpose - fileRoot + 6) % 12) + 12) % 12) - 6;
  const backing = useRef(new JazzBacking());
  const local = useRef<LocalTrack | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const loadGeneration = useRef(0);
  const mounted = useRef(true);
  const lastBar = useRef<number | null>(null);
  const stateRef = useRef({
    source,
    backingPlaying,
    trackPlaying: trackState.playing,
    starting,
  });
  stateRef.current = {
    source,
    backingPlaying,
    trackPlaying: trackState.playing,
    starting,
  };
  const callbacks = useRef({ onPosition, onActiveChange });
  callbacks.current = { onPosition, onActiveChange };
  const config = useMemo<BackingConfig>(
    () => ({
      bars,
      bpm,
      transpose,
      beats: meter.beats,
      style,
      loop,
      loopStart,
      loopEnd,
      countIn,
      volume,
      ...levels,
    }),
    [
      bars,
      bpm,
      transpose,
      meter.beats,
      style,
      loop,
      loopStart,
      loopEnd,
      countIn,
      volume,
      levels,
    ],
  );
  const configRef = useRef(config);
  configRef.current = config;

  function setTempo(value: number) {
    const next = Math.round(
      clamp(Number.isFinite(value) ? value : standard.bpm, 30, 300),
    );
    setBpm(next);
    setBpmDraft(String(next));
  }
  const stopAll = useCallback(() => {
    generation.current++;
    backing.current.stop();
    local.current?.pause();
    setBackingPlaying(false);
    setStarting(false);
    setPosition(null);
    lastBar.current = null;
    callbacks.current.onPosition(null);
    callbacks.current.onActiveChange?.(false);
  }, []);
  const audioInterrupted = useCallback(() => {
    stopAll();
    setError("오디오가 중단됐습니다. 다시 재생해 주세요.");
  }, [stopAll]);
  useEffect(() => {
    backing.current.update(config);
  }, [config]);
  useEffect(() => {
    try {
      local.current?.update({
        rate,
        pitch: trackState.pitchSupported ? filePitch : 0,
        volume,
        loop: fileLoop,
        loopStart: fileA,
        loopEnd: fileB,
      });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "음원 설정을 적용하지 못했습니다.",
      );
    }
  }, [
    rate,
    filePitch,
    volume,
    fileLoop,
    fileA,
    fileB,
    trackState.pitchSupported,
  ]);
  useEffect(() => {
    mounted.current = true;
    const pageHide = () => stopAll();
    window.addEventListener("pagehide", pageHide);
    return () => {
      mounted.current = false;
      generation.current++;
      loadGeneration.current++;
      backing.current.stop();
      local.current?.dispose();
      callbacks.current.onPosition(null);
      callbacks.current.onActiveChange?.(false);
      window.removeEventListener("pagehide", pageHide);
    };
  }, [stopAll]);

  async function playBacking(startBar?: number, skipCountIn = false) {
    const token = ++generation.current;
    local.current?.pause();
    setError("");
    setStarting(true);
    setBackingPlaying(false);
    setPosition(null);
    callbacks.current.onActiveChange?.(true);
    try {
      await backing.current.start(
        { ...configRef.current, ...(skipCountIn ? { countIn: 0 } : {}) },
        (next) => {
          if (!mounted.current || token !== generation.current) return;
          setPosition(next);
          const bar = next.countIn ? null : next.bar;
          if (bar !== lastBar.current) {
            lastBar.current = bar;
            callbacks.current.onPosition(bar);
          }
        },
        () => {
          if (!mounted.current || token !== generation.current) return;
          setBackingPlaying(false);
          setPosition(null);
          lastBar.current = null;
          callbacks.current.onPosition(null);
          callbacks.current.onActiveChange?.(false);
        },
        startBar,
      );
      if (!mounted.current || token !== generation.current) return;
      setBackingPlaying(true);
    } catch (failure) {
      if (mounted.current && token === generation.current) {
        setBackingPlaying(false);
        setPosition(null);
        lastBar.current = null;
        callbacks.current.onPosition(null);
        setError(
          failure instanceof Error
            ? failure.message
            : "반주를 시작하지 못했습니다.",
        );
        callbacks.current.onActiveChange?.(false);
      }
    } finally {
      if (mounted.current && token === generation.current) setStarting(false);
    }
  }
  async function playFile() {
    if (!local.current || !fileName) return;
    const token = ++generation.current;
    backing.current.stop();
    setBackingPlaying(false);
    setError("");
    setStarting(true);
    callbacks.current.onPosition(null);
    callbacks.current.onActiveChange?.(true);
    try {
      await local.current.play();
      if (!mounted.current || token !== generation.current) return;
    } catch (failure) {
      if (mounted.current && token === generation.current) {
        setError(
          failure instanceof Error
            ? failure.message
            : "음원을 재생하지 못했습니다.",
        );
        callbacks.current.onActiveChange?.(false);
      }
    } finally {
      if (mounted.current && token === generation.current) setStarting(false);
    }
  }
  const actions = useRef({ playBacking, playFile, stopAll });
  actions.current = { playBacking, playFile, stopAll };
  useEffect(() => {
    const toggle = () => {
      const state = stateRef.current;
      if (state.starting || state.backingPlaying || state.trackPlaying)
        actions.current.stopAll();
      else if (state.source === "backing") void actions.current.playBacking();
      else void actions.current.playFile();
    };
    window.addEventListener("juno:toggle-practice", toggle);
    return () => window.removeEventListener("juno:toggle-practice", toggle);
  }, []);

  async function loadFile(file?: File) {
    if (!file) return;
    stopAll();
    setError("");
    setLoading(true);
    setFileName("");
    const token = ++loadGeneration.current;
    local.current?.dispose();
    const player = new LocalTrack();
    local.current = player;
    setTrackState(initialTrack);
    setRate(1);
    setFileA(0);
    setFileB(0);
    setFileLoop(false);
    setFileRoot(baseRoot);
    try {
      const info = await player.load(file, (state) => {
        if (!mounted.current || token !== loadGeneration.current) return;
        setTrackState(state);
        if (state.error) setError(state.error);
        if (stateRef.current.source === "file")
          callbacks.current.onActiveChange?.(state.playing);
      });
      if (!mounted.current || token !== loadGeneration.current) {
        player.dispose();
        return;
      }
      setFileName(info.name);
      setFileB(info.duration);
      const pitch = ((((configRef.current.transpose + 6) % 12) + 12) % 12) - 6;
      player.update({
        rate: 1,
        pitch: info.pitchSupported ? pitch : 0,
        volume: configRef.current.volume,
        loop: false,
        loopStart: 0,
        loopEnd: info.duration,
      });
    } catch (failure) {
      if (mounted.current && token === loadGeneration.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "음원을 열지 못했습니다.",
        );
    } finally {
      if (mounted.current && token === loadGeneration.current)
        setLoading(false);
    }
  }
  function changeSource(next: "backing" | "file") {
    if (source === next) return;
    stopAll();
    setError("");
    setSource(next);
  }
  function closeFile() {
    stopAll();
    loadGeneration.current++;
    local.current?.dispose();
    local.current = null;
    setFileName("");
    setTrackState(initialTrack);
    setLoading(false);
    setError("");
  }
  const playing = source === "backing" ? backingPlaying : trackState.playing;
  const transposedKey = transposeChord(standard.key, transpose);
  const progress =
    position && !position.countIn
      ? ((position.bar + position.beat / meter.beats) / bars.length) * 100
      : 0;
  const sectionRanges = useMemo(() => {
    let offset = 0;
    return standard.sections.map((section) => {
      const start = offset;
      offset += section.bars.length;
      return { label: section.label, start, end: offset - 1 };
    });
  }, [standard]);

  return (
    <section className="jazz-practice" aria-label="재즈 반주 플레이어">
      <div className="practice-topline">
        <div className="practice-source" role="group" aria-label="오디오 소스">
          <button
            className={source === "backing" ? "selected" : ""}
            onClick={() => changeSource("backing")}
            aria-pressed={source === "backing"}
            title="반주"
          >
            <Piano size={15} />
            반주
          </button>
          <button
            className={source === "file" ? "selected" : ""}
            onClick={() => changeSource("file")}
            aria-pressed={source === "file"}
            title="기기에 있는 음원 열기"
          >
            <Headphones size={15} />내 음원
          </button>
        </div>
        <div className="practice-output-status">
          <BackingOutput
            engine={backing.current}
            active={backingPlaying}
            onInterrupted={audioInterrupted}
          />
          <span className="practice-status" aria-live="off">
            {source === "backing"
              ? position
                ? position.countIn
                  ? `${position.beat + 1} / ${meter.beats}`
                  : `${position.bar + 1}/${bars.length} · ${position.chorus}회`
                : `${meter.beats}/${meter.denominator}`
              : fileName
                ? `${formatTime(trackState.position)} / ${formatTime(trackState.duration)}`
                : ""}
          </span>
        </div>
      </div>
      <div className="practice-transport">
        <button
          className={`practice-play ${playing ? "is-playing" : ""}`}
          disabled={loading || (source === "file" && !fileName)}
          title={
            playing || starting
              ? source === "file"
                ? "일시정지 · Space"
                : "정지 · Space"
              : "재생 · Space"
          }
          aria-label={
            playing || starting
              ? source === "file"
                ? "음원 일시정지"
                : "반주 정지"
              : source === "file"
                ? "음원 재생"
                : "반주 재생"
          }
          onClick={() =>
            playing || starting
              ? stopAll()
              : source === "backing"
                ? void playBacking()
                : void playFile()
          }
        >
          {starting ? (
            <LoaderCircle size={19} className="spin" />
          ) : playing ? (
            source === "file" ? (
              <Pause size={19} fill="currentColor" />
            ) : (
              <Square size={17} fill="currentColor" />
            )
          ) : (
            <Play size={20} fill="currentColor" />
          )}
        </button>
        <button
          className="icon-button practice-restart"
          aria-label="처음으로"
          title="처음으로"
          disabled={source === "file" && !fileName}
          onClick={() => {
            if (source === "file") {
              local.current?.seek(fileLoop ? fileA : 0);
            } else if (backingPlaying) {
              void playBacking(loop ? loopStart : 0, true);
            } else {
              setPosition(null);
              callbacks.current.onPosition(null);
            }
          }}
        >
          <SkipBack size={17} />
        </button>
        {source === "backing" ? (
          <div className="practice-bpm">
            <button
              aria-label="반주 템포 1 낮추기"
              title="−1 BPM"
              onClick={() => setTempo(bpm - 1)}
            >
              <Minus size={13} />
            </button>
            <label>
              <input
                type="text"
                inputMode="numeric"
                aria-label="반주 BPM"
                value={bpmDraft}
                maxLength={3}
                onChange={(event) =>
                  setBpmDraft(event.target.value.replace(/\D/g, ""))
                }
                onBlur={() => setTempo(Number(bpmDraft) || bpm)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
              <span>BPM</span>
            </label>
            <button
              aria-label="반주 템포 1 높이기"
              title="+1 BPM"
              onClick={() => setTempo(bpm + 1)}
            >
              <Plus size={13} />
            </button>
          </div>
        ) : (
          <div className="practice-rate">
            <label>
              <select
                aria-label="음원 재생 속도"
                value={rate}
                onChange={(event) => setRate(+event.target.value)}
              >
                {[
                  0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.2,
                  1.25, 1.5,
                ].map((value) => (
                  <option key={value} value={value}>
                    {value.toFixed(2)}×
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="practice-key">
          <button
            className="icon-button"
            aria-label="반주 키 반음 내리기"
            title="반음 내리기"
            disabled={
              transpose <= -11 ||
              (source === "file" && !trackState.pitchSupported)
            }
            onClick={() => onTranspose(transpose - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="practice-key-label"
            title="원키로"
            aria-label={`${transposedKey} · 원키로 되돌리기`}
            onClick={() => onTranspose(0)}
          >
            {transposedKey}
          </button>
          <button
            className="icon-button"
            aria-label="반주 키 반음 올리기"
            title="반음 올리기"
            disabled={
              transpose >= 11 ||
              (source === "file" && !trackState.pitchSupported)
            }
            onClick={() => onTranspose(transpose + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <button
          className={`icon-button practice-loop ${source === "backing" ? (loop ? "enabled" : "") : fileLoop ? "enabled" : ""}`}
          title="구간 반복"
          aria-label="구간 반복"
          aria-pressed={source === "backing" ? loop : fileLoop}
          disabled={source === "file" && !fileName}
          onClick={() =>
            source === "backing" ? setLoop(!loop) : setFileLoop(!fileLoop)
          }
        >
          <Repeat2 size={19} />
        </button>
      </div>
      {source === "backing" ? (
        <>
          <div
            className="practice-progress"
            role="progressbar"
            aria-label="반주 진행"
            aria-valuemin={0}
            aria-valuemax={bars.length}
            aria-valuenow={position && !position.countIn ? position.bar + 1 : 0}
          >
            <i style={{ width: `${progress}%` }} />
          </div>
          <div className="practice-quick-controls">
            <div className="practice-loop-range">
              <Repeat2 size={13} />
              <select
                aria-label="반복 시작 마디"
                disabled={!loop}
                value={loopStart}
                onChange={(event) => {
                  const value = +event.target.value;
                  setLoopStart(value);
                  if (value > loopEnd) setLoopEnd(value);
                }}
              >
                {bars.map((_, i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </select>
              <span>—</span>
              <select
                aria-label="반복 마지막 마디"
                disabled={!loop}
                value={loopEnd}
                onChange={(event) => {
                  const value = +event.target.value;
                  setLoopEnd(value);
                  if (value < loopStart) setLoopStart(value);
                }}
              >
                {bars.map((_, i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </div>
            <select
              className="practice-style"
              aria-label="반주 스타일"
              value={style}
              onChange={(event) =>
                setStyle(event.target.value as BackingConfig["style"])
              }
            >
              <option value="swing">Swing</option>
              <option value="bossa">Bossa</option>
              <option value="ballad">Ballad</option>
              <option value="straight">Straight</option>
            </select>
          </div>
          <details className="practice-settings">
            <summary title="믹서·카운트인" aria-label="믹서와 카운트인 설정">
              <SlidersHorizontal size={14} />
            </summary>
            <div className="practice-mixer">
              {(
                [
                  { id: "piano", label: "피아노", icon: Piano },
                  { id: "bass", label: "베이스", icon: Music2 },
                  { id: "drums", label: "드럼", icon: Drum },
                ] as const
              ).map((item) => (
                <label key={item.id} title={item.label}>
                  <button
                    title={`${item.label} ${levels[item.id] ? "음소거" : "켜기"}`}
                    aria-label={`${item.label} ${levels[item.id] ? "음소거" : "켜기"}`}
                    aria-pressed={levels[item.id] === 0}
                    onClick={() =>
                      setLevels((current) => ({
                        ...current,
                        [item.id]: current[item.id] ? 0 : 0.65,
                      }))
                    }
                    className={levels[item.id] ? "" : "muted"}
                  >
                    <item.icon size={16} />
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step=".05"
                    aria-label={`${item.label} 볼륨`}
                    value={levels[item.id]}
                    onChange={(event) =>
                      setLevels((current) => ({
                        ...current,
                        [item.id]: +event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
              <label className="practice-countin">
                <Timer size={15} />
                <select
                  aria-label="카운트인"
                  value={countIn}
                  onChange={(event) => setCountIn(+event.target.value)}
                >
                  <option value="0">카운트 없음</option>
                  <option value="1">1마디</option>
                  <option value="2">2마디</option>
                </select>
              </label>
            </div>
            <div className="practice-sections">
              {sectionRanges.map((section, i) => (
                <button
                  key={i}
                  className={
                    loop &&
                    loopStart === section.start &&
                    loopEnd === section.end
                      ? "selected"
                      : ""
                  }
                  title={`${section.start + 1}–${section.end + 1}마디 반복`}
                  onClick={() => {
                    setLoop(true);
                    setLoopStart(section.start);
                    setLoopEnd(section.end);
                  }}
                >
                  {section.label}
                </button>
              ))}
              <button
                title="전체 반복"
                onClick={() => {
                  setLoopStart(0);
                  setLoopEnd(bars.length - 1);
                  setLoop(true);
                }}
              >
                All
              </button>
              {onTempo && (
                <button
                  title="메트로놈에 템포 적용"
                  aria-label="메트로놈에 템포 적용"
                  onClick={() => onTempo(bpm)}
                >
                  <Timer size={13} />
                  {bpm}
                </button>
              )}
            </div>
          </details>
        </>
      ) : (
        <div className="practice-file-panel">
          <input
            ref={fileInput}
            className="practice-file-input"
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac"
            aria-label="연습 음원 선택"
            onChange={(event) => {
              void loadFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {fileName ? (
            <>
              <div className="practice-file-name">
                <Music2 size={14} />
                <span title={fileName}>{fileName}</span>
                <button
                  className="icon-button"
                  title="다른 음원"
                  aria-label="다른 음원 선택"
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload size={15} />
                </button>
                <button
                  className="icon-button"
                  title="음원 닫기"
                  aria-label="음원 닫기"
                  onClick={closeFile}
                >
                  <X size={15} />
                </button>
              </div>
              <input
                className="practice-seek"
                type="range"
                aria-label="음원 재생 위치"
                min="0"
                max={trackState.duration || 1}
                step=".1"
                value={Math.min(trackState.position, trackState.duration)}
                onChange={(event) => local.current?.seek(+event.target.value)}
              />
              <div className="practice-file-options">
                <div className="practice-ab">
                  <button
                    title="현재 위치를 반복 시작으로"
                    onClick={() => {
                      const start = Math.min(
                        trackState.position,
                        Math.max(0, trackState.duration - 0.25),
                      );
                      setFileA(start);
                      if (fileB <= start) setFileB(trackState.duration);
                      setFileLoop(true);
                    }}
                    aria-label="A 반복 시작 설정"
                  >
                    A <small>{formatTime(fileA)}</small>
                  </button>
                  <span>—</span>
                  <button
                    title="현재 위치를 반복 끝으로"
                    onClick={() => {
                      setFileB(
                        Math.min(
                          trackState.duration,
                          Math.max(trackState.position, fileA + 0.25),
                        ),
                      );
                      setFileLoop(true);
                    }}
                    aria-label="B 반복 끝 설정"
                  >
                    B <small>{formatTime(fileB)}</small>
                  </button>
                </div>
                <label
                  className="practice-original-key"
                  title="업로드한 음원 원래 키의 근음"
                >
                  원음 키
                  <select
                    value={fileRoot}
                    aria-label="음원 원래 키"
                    onChange={(event) => setFileRoot(+event.target.value)}
                  >
                    {pitchClasses.map((name, i) => (
                      <option key={i} value={i}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="practice-pitch" title="음원의 실제 피치 이동">
                  {filePitch > 0 ? "+" : ""}
                  {trackState.pitchSupported ? filePitch : 0} st
                </span>
              </div>
            </>
          ) : (
            <button
              className="practice-upload"
              disabled={loading}
              onClick={() => fileInput.current?.click()}
            >
              {loading ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <Upload size={18} />
              )}
              <span>{loading ? "음원 여는 중" : "음원 선택"}</span>
            </button>
          )}
          {!trackState.pitchSupported && fileName && (
            <span className="practice-fallback" role="status">
              이 브라우저는 속도 조절만 지원합니다.
            </span>
          )}
        </div>
      )}
      <div className="practice-bottom">
        <label className="practice-master" title="전체 볼륨">
          <Volume2 size={14} />
          <input
            type="range"
            aria-label="반주 전체 볼륨"
            min="0"
            max="1"
            step=".05"
            value={volume}
            onChange={(event) => setVolume(+event.target.value)}
          />
        </label>
      </div>
      {error && (
        <div className="practice-error" role="alert">
          {error}
          <button
            onClick={() => setError("")}
            title="닫기"
            aria-label="오류 닫기"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </section>
  );
}
