import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Drum,
  Headphones,
  LoaderCircle,
  Music2,
  Pause,
  Piano,
  Play,
  Settings2,
  SkipBack,
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
const practicePanels = [
  { id: "playback", label: "재생", icon: Play },
  { id: "mixer", label: "믹서", icon: Volume2 },
] as const;
const backingChannels = [
  { id: "piano", label: "피아노", icon: Piano },
  { id: "bass", label: "베이스", icon: Music2 },
  { id: "drums", label: "드럼", icon: Drum },
] as const;

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

function JazzPractice({
  standard,
  transpose,
  onTranspose,
  onPosition,
  onActiveChange,
  onTempo,
}: JazzPracticeProps) {
  const bars = useMemo(() => flattenBars(standard), [standard]);
  const meter = getMeter(standard);
  const controlsId = useId();
  const playerRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [settingsPanel, setSettingsPanel] =
    useState<(typeof practicePanels)[number]["id"]>("playback");
  const [source, setSource] = useState<"backing" | "file">("backing");
  const [bpm, setBpm] = useState(standard.bpm);
  const [bpmDraft, setBpmDraft] = useState(String(standard.bpm));
  const [style, setStyle] = useState<BackingConfig["style"]>(() =>
    initialStyle(standard),
  );
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
  const baseRoot = parseJazzChord(standard.key.split(" ")[0])?.root ?? 0;
  const [fileRoot, setFileRoot] = useState(baseRoot);
  const filePitch =
    ((((baseRoot + transpose - fileRoot + 6) % 12) + 12) % 12) - 6;
  const [backing] = useState(() => new JazzBacking());
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
      loop: false,
      loopStart: 0,
      loopEnd: bars.length - 1,
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
    backing.stop();
    local.current?.pause();
    setBackingPlaying(false);
    setStarting(false);
    setPosition(null);
    lastBar.current = null;
    callbacks.current.onPosition(null);
    callbacks.current.onActiveChange?.(false);
  }, [backing]);
  const audioInterrupted = useCallback(() => {
    stopAll();
    setError("오디오가 중단됐습니다. 다시 재생해 주세요.");
  }, [stopAll]);
  useEffect(() => {
    backing.update(config);
  }, [backing, config]);
  useEffect(() => {
    try {
      local.current?.update({
        rate,
        pitch: trackState.pitchSupported ? filePitch : 0,
        volume,
      });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "음원 설정을 적용하지 못했습니다.",
      );
    }
  }, [rate, filePitch, volume, trackState.pitchSupported]);
  useEffect(() => {
    mounted.current = true;
    const pageHide = () => stopAll();
    window.addEventListener("pagehide", pageHide);
    return () => {
      mounted.current = false;
      generation.current++;
      loadGeneration.current++;
      backing.stop();
      local.current?.dispose();
      callbacks.current.onPosition(null);
      callbacks.current.onActiveChange?.(false);
      window.removeEventListener("pagehide", pageHide);
    };
  }, [backing, stopAll]);

  async function playBacking(skipCountIn = false) {
    const token = ++generation.current;
    local.current?.pause();
    setError("");
    setStarting(true);
    setBackingPlaying(false);
    setPosition(null);
    callbacks.current.onActiveChange?.(true);
    try {
      await backing.start(
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
    backing.stop();
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
      const pitch = ((((configRef.current.transpose + 6) % 12) + 12) % 12) - 6;
      player.update({
        rate: 1,
        pitch: info.pitchSupported ? pitch : 0,
        volume: configRef.current.volume,
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
  const needsFile = source === "file" && !fileName;
  const active = playing || starting;
  const playLabel = needsFile
    ? "음원 선택"
    : source === "backing"
      ? active
        ? "반주 정지"
        : "반주 재생"
      : active
        ? "음원 일시정지"
        : "음원 재생";
  function togglePlayback() {
    if (active) stopAll();
    else if (needsFile) fileInput.current?.click();
    else if (source === "backing") void playBacking();
    else void playFile();
  }
  useLayoutEffect(() => {
    const player = playerRef.current;
    if (expanded && player && player.getBoundingClientRect().top < 0)
      player.scrollIntoView({ block: "start" });
  }, [expanded]);
  const keyOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, root) => {
        const shift = ((root - baseRoot + 18) % 12) - 6;
        return { shift, label: transposeChord(standard.key, shift) };
      }),
    [baseRoot, standard.key],
  );
  const selectedShift = ((transpose + 18) % 12) - 6;
  const keyDisabled = source === "file" && !trackState.pitchSupported;
  const progress =
    position && !position.countIn
      ? ((position.bar + position.beat / meter.beats) / bars.length) * 100
      : 0;

  return (
    <section
      ref={playerRef}
      className={`jazz-practice ${active && !expanded ? "practice-follow" : ""}`}
      aria-label="재즈 반주 플레이어"
    >
      <div className="practice-transport">
        <button
          className={`practice-play ${playing ? "is-playing" : ""}`}
          disabled={loading}
          title={playLabel}
          aria-label={playLabel}
          aria-busy={starting || loading}
          onClick={togglePlayback}
        >
          {starting || loading ? (
            <LoaderCircle size={19} className="spin" />
          ) : playing ? (
            source === "file" ? (
              <Pause size={19} fill="currentColor" />
            ) : (
              <Square size={17} fill="currentColor" />
            )
          ) : needsFile ? (
            <Upload size={18} />
          ) : (
            <Play size={20} fill="currentColor" />
          )}
        </button>
        {source === "backing" ? (
          <label className="practice-bpm">
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
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  const step = event.key === "ArrowUp" ? 1 : -1;
                  setTempo((Number(bpmDraft) || bpm) + step);
                }
              }}
            />
            <span>BPM</span>
          </label>
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
        <select
          className="practice-key-label"
          aria-label="연습 키"
          title={`키 선택 · 원키 ${standard.key}`}
          value={selectedShift}
          disabled={keyDisabled}
          onChange={(event) => onTranspose(+event.target.value)}
        >
          {keyOptions.map(({ shift, label }) => (
            <option value={shift} key={shift}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon-button practice-expand"
          aria-controls={controlsId}
          aria-expanded={expanded}
          aria-label={expanded ? "반주 설정 접기" : "반주 설정 펼치기"}
          title={expanded ? "반주 설정 접기" : "반주 설정 펼치기"}
          onClick={() => setExpanded((open) => !open)}
        >
          <Settings2 size={20} />
        </button>
      </div>
      {backingPlaying && (
        <div className="practice-timeline">
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
          <BackingOutput
            engine={backing}
            active={backingPlaying}
            onInterrupted={audioInterrupted}
          />
          <span className="practice-status">
            {position?.countIn
              ? `${position.beat + 1} / ${meter.beats}`
              : `${(position?.bar ?? 0) + 1}/${bars.length}`}
          </span>
        </div>
      )}
      {source === "file" && fileName && (
        <div className="practice-timeline practice-file-timeline">
          <span>{formatTime(trackState.position)}</span>
          <input
            type="range"
            aria-label="음원 재생 위치"
            min="0"
            max={trackState.duration || 1}
            step=".1"
            value={Math.min(trackState.position, trackState.duration)}
            onChange={(event) => local.current?.seek(+event.target.value)}
          />
          <span>{formatTime(trackState.duration)}</span>
        </div>
      )}
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

      <div id={controlsId} className="practice-expanded" hidden={!expanded}>
        {expanded && (
          <>
            <div className="panel-tabs practice-tabs" role="group" aria-label="재생 설정">
              {practicePanels.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={settingsPanel === id}
                  onClick={() => setSettingsPanel(id)}
                >
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            {settingsPanel === "playback" && (
              <div className="practice-settings-content">
                <div className="practice-playback-actions">
                  <div className="practice-source" role="group" aria-label="오디오 소스">
                    <button
                      type="button"
                      onClick={() => changeSource("backing")}
                      aria-pressed={source === "backing"}
                    >
                      <Piano size={16} aria-hidden="true" /> 반주
                    </button>
                    <button
                      type="button"
                      onClick={() => changeSource("file")}
                      aria-pressed={source === "file"}
                    >
                      <Headphones size={16} aria-hidden="true" /> 내 음원
                    </button>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="처음으로"
                    title="처음으로"
                    disabled={needsFile}
                    onClick={() => {
                      if (source === "file") {
                        local.current?.seek(0);
                      } else if (backingPlaying) {
                        void playBacking(true);
                      } else {
                        setPosition(null);
                        callbacks.current.onPosition(null);
                      }
                    }}
                  >
                    <SkipBack size={17} />
                  </button>
                  {source === "backing" && onTempo && (
                    <button
                      type="button"
                      className="icon-button"
                      title="메트로놈에 템포 적용"
                      aria-label="메트로놈에 템포 적용"
                      onClick={() => onTempo(bpm)}
                    >
                      <Timer size={18} />
                    </button>
                  )}
                </div>
                {source === "backing" ? (
                  <div className="practice-playback-options">
                    <select
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
                    <select
                      aria-label="카운트인"
                      value={countIn}
                      onChange={(event) => setCountIn(+event.target.value)}
                    >
                      <option value="0">카운트인 끔</option>
                      <option value="1">카운트인 1마디</option>
                      <option value="2">카운트인 2마디</option>
                    </select>
                  </div>
                ) : fileName && (
                  <>
                    <div className="practice-file-name">
                      <Music2 size={16} aria-hidden="true" />
                      <span title={fileName}>{fileName}</span>
                      <button
                        type="button"
                        className="icon-button"
                        title="다른 음원"
                        aria-label="다른 음원 선택"
                        onClick={() => fileInput.current?.click()}
                      >
                        <Upload size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        title="음원 닫기"
                        aria-label="음원 닫기"
                        onClick={closeFile}
                      >
                        <X size={17} />
                      </button>
                    </div>
                    {trackState.pitchSupported ? (
                      <div className="practice-file-key">
                        <label title="업로드한 음원 원래 키의 근음">
                          원음 키
                          <select
                            value={fileRoot}
                            aria-label="음원 원래 키"
                            onChange={(event) => setFileRoot(+event.target.value)}
                          >
                            {pitchClasses.map((name, i) => (
                              <option key={i} value={i}>{name}</option>
                            ))}
                          </select>
                        </label>
                        <span title="음원의 실제 피치 이동">
                          {filePitch > 0 ? "+" : ""}{filePitch} st
                        </span>
                      </div>
                    ) : (
                      <span className="practice-fallback" role="status">
                        이 브라우저는 속도 조절만 지원합니다.
                      </span>
                    )}
                  </>
                )}
              </div>
            )}

            {settingsPanel === "mixer" && (
              <div className="practice-settings-content practice-mixer">
                <label className="practice-mix-channel">
                  <span><Volume2 size={16} aria-hidden="true" /> 전체</span>
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
                {source === "backing" && backingChannels.map(({ id, label, icon: Icon }) => (
                  <div key={id} className="practice-mix-channel">
                    <button
                      type="button"
                      title={`${label} ${levels[id] ? "음소거" : "켜기"}`}
                      aria-label={`${label} 음소거`}
                      aria-pressed={levels[id] === 0}
                      onClick={() =>
                        setLevels((current) => ({
                          ...current,
                          [id]: current[id] ? 0 : 0.65,
                        }))
                      }
                    >
                      <Icon size={16} aria-hidden="true" /> {label}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step=".05"
                      aria-label={`${label} 볼륨`}
                      value={levels[id]}
                      onChange={(event) =>
                        setLevels((current) => ({
                          ...current,
                          [id]: +event.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
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

export default memo(JazzPractice);
