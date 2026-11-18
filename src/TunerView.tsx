import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Mic,
  RotateCcw,
  Square,
  Star,
  Volume2,
} from "lucide-react";
import { tunings } from "./data/tunings";
import { TunerAudio, playReference } from "./lib/audio";
import { detectPitch, detectPolyphonic } from "./lib/pitch";
import { PitchTracker } from "./lib/pitch-tracker";
import type { TrackedPitch } from "./lib/pitch-tracker";
type TrackedString = TrackedPitch & { cents: number };
import { frequencyToMidi, midiToFrequency, noteName } from "./lib/theory";
import "./tuner.css";

type Patch = {
  tuningId?: string;
  customStrings?: number[] | null;
  a4?: number;
};
export interface TunerViewProps {
  tuningId: string;
  customStrings: number[] | null;
  a4: number;
  onChange: (patch: Patch) => void;
  favorites: string[];
  onFavorite: (id: string) => void;
  onActiveChange?: (active: boolean) => void;
  visible?: boolean;
}
const groups = [
  { id: "guitar-6", name: "기타 · 6현" },
  { id: "guitar-7", name: "기타 · 7현" },
  { id: "guitar-8", name: "기타 · 8현" },
  { id: "bass-4", name: "베이스 · 4현" },
  { id: "bass-5", name: "베이스 · 5현" },
  { id: "bass-6", name: "베이스 · 6현" },
];
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
const signed = (value: number) => `${value > 0 ? "+" : ""}${Math.round(value)}`;
function inputError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError")
    return "오디오 입력 권한이 필요합니다. 주소창의 사이트 권한에서 마이크를 허용한 뒤 다시 시작해 주세요.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return "오디오 입력 장치를 찾지 못했습니다. 인터페이스 또는 마이크를 연결해 주세요.";
  if (name === "NotReadableError" || name === "TrackStartError")
    return "입력 장치를 열지 못했습니다. 다른 앱의 장치 사용 여부와 운영체제 입력 설정을 확인해 주세요.";
  if (name === "OverconstrainedError")
    return "선택한 입력 장치를 사용할 수 없습니다. 기본 입력 또는 다른 장치를 선택해 주세요.";
  if (name === "SecurityError")
    return "브라우저가 오디오 입력을 차단했습니다. HTTPS 주소와 사이트 권한을 확인해 주세요.";
  return error instanceof Error
    ? error.message
    : "오디오 입력을 시작하지 못했습니다. 연결과 권한을 확인해 주세요.";
}

export default function TunerView({
  tuningId,
  customStrings,
  a4,
  onChange,
  favorites,
  onFavorite,
  onActiveChange,
  visible = true,
}: TunerViewProps) {
  const tuning = tunings.find((item) => item.id === tuningId) ?? tunings[0];
  const strings = customStrings ?? tuning.strings;
  const frequencies = useMemo(
    () => strings.map((midi) => midiToFrequency(midi, a4)),
    [strings, a4],
  );
  const group = `${tuning.instrument}-${tuning.strings.length}`;
  const available = tunings.filter(
    (item) => `${item.instrument}-${item.strings.length}` === group,
  );
  const [mode, setMode] = useState<"single" | "poly">("single");
  const [target, setTarget] = useState<number | "auto">("auto");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [channel, setChannel] = useState<"mix" | "left" | "right">("left");
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [pitch, setPitch] = useState<TrackedPitch | null>(null);
  const [poly, setPoly] = useState<Array<TrackedString | null>>([]);
  const [level, setLevel] = useState(0);
  const [clipping, setClipping] = useState(false);
  const [reference, setReference] = useState<number | null>(null);
  const audio = useRef<TunerAudio | null>(null);
  const request = useRef(0);
  const tracker = useRef(new PitchTracker());
  const polyTrackers = useRef<PitchTracker[]>([]);
  const meterEnvelope = useRef({ level: 0, time: 0 });
  const clipUntil = useRef(0);
  const suppressUntil = useRef(0);
  const toneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onActive = useRef(onActiveChange);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const lastAnalysis = useRef(0);
  onActive.current = onActiveChange;
  const settings = useRef({ frequencies, mode });
  settings.current = { frequencies, mode };

  const clearReadings = useCallback(() => {
    setPitch(null);
    setPoly([]);
    tracker.current.reset();
    polyTrackers.current = [];
  }, []);
  const refreshDevices = useCallback(async () => {
    try {
      if (navigator.mediaDevices?.enumerateDevices) {
        const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
          (device) => device.kind === "audioinput",
        );
        setDevices(inputs);
      }
    } catch {
      /* Labels can remain unavailable until the user grants input access. */
    }
  }, []);
  useEffect(() => {
    void refreshDevices();
    navigator.mediaDevices?.addEventListener("devicechange", refreshDevices);
    return () =>
      navigator.mediaDevices?.removeEventListener(
        "devicechange",
        refreshDevices,
      );
  }, [refreshDevices]);
  useEffect(() => {
    clearReadings();
  }, [tuningId, customStrings, a4, mode, clearReadings]);
  useEffect(() => {
    setTarget("auto");
  }, [tuningId, customStrings]);
  useEffect(() => {
    onActive.current?.(active || starting);
  }, [active, starting]);
  useEffect(
    () => () => {
      request.current++;
      audio.current?.stop();
      if (toneTimer.current) clearTimeout(toneTimer.current);
      onActive.current?.(false);
    },
    [],
  );

  const stop = useCallback(() => {
    request.current++;
    audio.current?.stop();
    setActive(false);
    setStarting(false);
    setLevel(0);
    meterEnvelope.current = { level: 0, time: 0 };
    setClipping(false);
    clearReadings();
  }, [clearReadings]);
  useEffect(() => {
    window.addEventListener("juno:stop-tuner", stop);
    return () => window.removeEventListener("juno:stop-tuner", stop);
  }, [stop]);
  async function start(nextDevice = deviceId, nextChannel = channel) {
    setError("");
    if (!window.isSecureContext) {
      setError(
        "오디오 입력은 HTTPS 또는 localhost에서 사용할 수 있습니다. 배포된 HTTPS 주소로 접속해 주세요.",
      );
      return;
    }
    const currentRequest = ++request.current;
    setStarting(true);
    clearReadings();
    audio.current ??= new TunerAudio();
    try {
      await audio.current.start(
        (frame) => {
          if (request.current !== currentRequest) return;
          const now = performance.now();
          if (!visibleRef.current && now - lastAnalysis.current < 250) return;
          lastAnalysis.current = now;
          const envelope = meterEnvelope.current;
          const elapsed = envelope.time ? now - envelope.time : 80;
          const displayLevel = Math.max(
            frame.level,
            envelope.level * Math.exp(-elapsed / 220),
          );
          meterEnvelope.current = { level: displayLevel, time: now };
          setLevel(displayLevel);
          if (frame.clipped) clipUntil.current = now + 1500;
          setClipping(now < clipUntil.current);
          if (now < suppressUntil.current) {
            clearReadings();
            return;
          }
          const current = settings.current;
          if (current.mode === "poly") {
            const estimates = detectPolyphonic(
              frame.samples,
              frame.sampleRate,
              current.frequencies,
            );
            if (polyTrackers.current.length !== estimates.length) {
              polyTrackers.current = estimates.map(
                () =>
                  new PitchTracker({
                    attackConfidence: 0.7,
                    sustainConfidence: 0.62,
                    holdMs: 650,
                  }),
              );
            }
            setPoly(
              estimates.map((estimate, index) => {
                const tracked = polyTrackers.current[index].update(
                  estimate,
                  now,
                  frame.level,
                );
                return tracked
                  ? {
                      ...tracked,
                      cents:
                        1200 *
                        Math.log2(
                          tracked.frequency / current.frequencies[index],
                        ),
                    }
                  : null;
              }),
            );
          } else {
            const found = detectPitch(frame.samples, frame.sampleRate);
            setPitch(tracker.current.update(found, now, frame.level));
          }
        },
        nextDevice || undefined,
        nextChannel,
      );
      if (request.current !== currentRequest) return;
      setActive(true);
      void refreshDevices();
    } catch (failure) {
      if (request.current === currentRequest) {
        setError(inputError(failure));
        setActive(false);
      }
    } finally {
      if (request.current === currentRequest) setStarting(false);
    }
  }
  function changeInput(
    nextDevice: string,
    nextChannel: "mix" | "left" | "right",
  ) {
    const resume = active || starting;
    setError("");
    setDeviceId(nextDevice);
    setChannel(nextChannel);
    if (resume) void start(nextDevice, nextChannel);
  }
  async function sound(index: number) {
    if (toneTimer.current) clearTimeout(toneTimer.current);
    setReference(index);
    suppressUntil.current = performance.now() + 1600;
    clearReadings();
    toneTimer.current = setTimeout(() => {
      setReference(null);
    }, 1400);
    try {
      await playReference(frequencies[index]);
    } catch (failure) {
      setError(inputError(failure));
      setReference(null);
    }
  }
  const nearest = pitch
    ? frequencies.reduce(
        (best, frequency, index) =>
          Math.abs(Math.log2(pitch.frequency / frequency)) <
          Math.abs(Math.log2(pitch.frequency / frequencies[best]))
            ? index
            : best,
        0,
      )
    : 0;
  const targetIndex =
    target === "auto" ? nearest : Math.min(target, strings.length - 1);
  const targetFrequency = frequencies[targetIndex];
  const cents = pitch
    ? 1200 * Math.log2(pitch.frequency / targetFrequency)
    : null;
  const inTune = cents !== null && !pitch?.held && Math.abs(cents) <= 4;
  const measuredNote = pitch
    ? noteName(Math.round(frequencyToMidi(pitch.frequency, a4)), false)
    : "—";
  const measuredOctave = pitch
    ? Math.floor(Math.round(frequencyToMidi(pitch.frequency, a4)) / 12) - 1
    : "";
  const meter =
    level > 0 ? clamp(((20 * Math.log10(level) + 80) / 80) * 100, 0, 100) : 0;
  const detectedCount = poly.filter((result) => result && !result.held).length;
  const favorited = favorites.includes(tuning.id);

  return (
    <div className="tuner-view">
      <div className="tuner-toolbar">
        <button
          type="button"
          className={`button tuner-mobile-start ${active || starting ? "secondary" : "primary"}`}
          onClick={active || starting ? stop : () => void start()}
          aria-label={active || starting ? "튜너 입력 정지" : "튜너 입력 시작"}
        >
          {active || starting ? <Square size={15} /> : <Mic size={16} />}{" "}
          {starting ? "취소" : active ? "정지" : "시작"}
        </button>
        <div className="segmented tuner-mode" aria-label="튜닝 모드">
          <button
            type="button"
            className={mode === "single" ? "active" : ""}
            aria-pressed={mode === "single"}
            onClick={() => setMode("single")}
          >
            한 현씩
          </button>
          <button
            type="button"
            className={mode === "poly" ? "active" : ""}
            aria-pressed={mode === "poly"}
            title="실험 기능: 개방현을 함께 분석합니다. 배음이 겹치거나 신호가 약하면 미검출·오검출이 생길 수 있습니다. 마지막은 한 현씩 확인하세요."
            onClick={() => setMode("poly")}
          >
            동시에 <span className="tuner-beta">실험</span>
          </button>
        </div>
      </div>

      <div className="tuner-preset-row">
        <label>
          악기
          <select
            aria-label="악기 종류"
            value={group}
            onChange={(event) => {
              const first = tunings.find(
                (item) =>
                  `${item.instrument}-${item.strings.length}` ===
                  event.target.value,
              )!;
              onChange({ tuningId: first.id, customStrings: null });
            }}
          >
            {groups.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="tuner-preset-select">
          {customStrings ? "튜닝 · 사용자" : "튜닝"}
          <select
            aria-label="튜닝 프리셋"
            value={tuning.id}
            onChange={(event) =>
              onChange({ tuningId: event.target.value, customStrings: null })
            }
          >
            {tunings.some((item) => favorites.includes(item.id)) && (
              <optgroup label="즐겨찾기">
                {tunings
                  .filter((item) => favorites.includes(item.id))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      ★ {item.name}
                    </option>
                  ))}
              </optgroup>
            )}
            <optgroup label={groups.find((item) => item.id === group)?.name}>
              {available.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <button
          type="button"
          className={`tuner-favorite icon-button ${favorited ? "is-favorite" : ""}`}
          aria-label={favorited ? "튜닝 즐겨찾기 해제" : "튜닝 즐겨찾기 추가"}
          aria-pressed={favorited}
          onClick={() => onFavorite(tuning.id)}
        >
          <Star size={19} fill={favorited ? "currentColor" : "none"} />
        </button>
      </div>

      <section
        className={`tuner-screen ${active ? "is-listening" : ""}`}
        aria-label={mode === "single" ? "단음 튜너 화면" : "동시 튜너 화면"}
      >
        <div className="tuner-screen-top">
          <span
            className="tuner-listening"
            aria-label={
              starting ? "입력 연결 중" : active ? "입력 연결됨" : "입력 대기"
            }
            title={
              starting ? "입력 연결 중" : active ? "입력 연결됨" : "입력 대기"
            }
          >
            <Mic size={16} aria-hidden="true" />
            <i className={active ? "on" : ""} />
          </span>
          {reference !== null && (
            <span
              className="tuner-reference-status"
              aria-label={`${noteName(strings[reference])} 기준음 재생 중`}
            >
              <Volume2 size={16} />
              {noteName(strings[reference])}
            </span>
          )}
        </div>
        {mode === "single" ? (
          <>
            <div
              className={`tuner-note-area ${inTune ? "is-tuned" : ""} ${pitch?.held ? "is-held" : ""}`}
            >
              <div className="tuner-pitch-note">
                {measuredNote}
                <sub>{measuredOctave}</sub>
              </div>
              <div className="tuner-cents">
                {cents === null ? null : pitch?.held ? (
                  <span
                    className="tuner-held-label"
                    title="신호가 약해 마지막 측정값을 잠시 유지합니다. 현재 튜닝 판정이 아닙니다."
                  >
                    마지막 측정 · {signed(cents)} ¢
                  </span>
                ) : (
                  <>
                    {inTune ? (
                      <Check size={19} aria-label="정음" />
                    ) : cents < 0 ? (
                      <ArrowUp size={19} aria-label="높이기" />
                    ) : (
                      <ArrowDown size={19} aria-label="낮추기" />
                    )}
                    <span>{signed(cents)} ¢</span>
                  </>
                )}
              </div>
            </div>
            <div
              className={`tuner-gauge ${pitch?.held ? "is-held" : ""}`}
              aria-label={
                cents === null
                  ? "측정값 없음"
                  : `${pitch?.held ? "마지막 측정 " : ""}${signed(cents)} 센트`
              }
            >
              <div className="tuner-gauge-zone" />
              {Array.from({ length: 21 }, (_, index) => (
                <i
                  key={index}
                  className={index % 5 === 0 ? "major" : ""}
                  style={{ left: `${index * 5}%` }}
                />
              ))}
              <div
                className="tuner-gauge-needle"
                style={{
                  left: `${50 + clamp(cents ?? 0, -50, 50)}%`,
                  opacity: cents === null ? 0 : pitch?.held ? 0.4 : 1,
                }}
              />
              <div className="tuner-gauge-labels">
                <span>−50</span>
                <span>0</span>
                <span>+50</span>
              </div>
            </div>
            <div className="tuner-measurements">
              <span>
                {pitch?.held ? "마지막" : "측정"}{" "}
                <b>{pitch ? `${pitch.frequency.toFixed(2)} Hz` : "— Hz"}</b>
              </span>
              <span>
                목표{" "}
                <b>
                  {target === "auto" && !pitch
                    ? "자동 선택"
                    : `${noteName(strings[targetIndex])} · ${targetFrequency.toFixed(2)} Hz`}
                </b>
                <button
                  type="button"
                  className="tuner-reference"
                  title={`${noteName(strings[targetIndex])} 기준음`}
                  aria-label={`${noteName(strings[targetIndex])} 기준음 듣기`}
                  onClick={() => void sound(targetIndex)}
                >
                  <Volume2 size={15} />
                </button>
              </span>
            </div>
          </>
        ) : (
          <div className="tuner-poly-area">
            {active && (
              <div
                className="tuner-poly-heading"
                aria-label={`${strings.length}개 현 중 ${detectedCount}개 감지`}
              >
                {detectedCount} / {strings.length}
              </div>
            )}
            <div
              className="tuner-poly-grid"
              style={{ "--strings": strings.length } as CSSProperties}
            >
              {strings.map((midi, index) => {
                const result = poly[index] ?? null;
                const tuned =
                  result !== null &&
                  !result.held &&
                  Math.abs(result.cents) <= 5;
                return (
                  <div
                    className={`tuner-poly-string ${result ? "has-signal" : ""} ${tuned ? "is-tuned" : ""} ${result?.held ? "is-held" : ""}`}
                    key={index}
                  >
                    <span className="tuner-string-number">
                      {strings.length - index}번
                    </span>
                    <b>
                      {noteName(midi, false)}
                      <sub>{Math.floor(midi / 12) - 1}</sub>
                    </b>
                    <div className="tuner-mini-gauge">
                      <i
                        style={{
                          bottom: `${50 + clamp(result?.cents ?? 0, -45, 45)}%`,
                          opacity: result ? (result.held ? 0.35 : 1) : 0,
                        }}
                      />
                      <span />
                    </div>
                    <span className="tuner-string-cents">
                      {result ? `${signed(result.cents)} ¢` : "—"}
                    </span>
                    <span className="tuner-string-frequency">
                      {result
                        ? result.held
                          ? "마지막 측정"
                          : `${result.frequency.toFixed(1)} Hz`
                        : "미검출"}
                    </span>
                    <button
                      type="button"
                      className="tuner-poly-reference"
                      title={`${noteName(midi)} 기준음`}
                      aria-label={`${strings.length - index}번 현 ${noteName(midi)} 기준음 듣기`}
                      onClick={() => void sound(index)}
                    >
                      <Volume2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {mode === "single" && (
        <div className="tuner-string-picker">
          <button
            type="button"
            className={target === "auto" ? "selected" : ""}
            onClick={() => setTarget("auto")}
            aria-pressed={target === "auto"}
          >
            자동
          </button>
          {strings.map((midi, index) => (
            <button
              type="button"
              className={target === index ? "selected" : ""}
              key={index}
              onClick={() => {
                setTarget(index);
              }}
              aria-pressed={target === index}
              aria-label={`${strings.length - index}번 현 ${noteName(midi)} 선택`}
            >
              <small>{strings.length - index}</small>
              {noteName(midi)}
            </button>
          ))}
        </div>
      )}

      <div className="tuner-input-panel">
        <div className="tuner-input-fields">
          <label className="tuner-device-select">
            입력
            <select
              aria-label="오디오 입력 장치"
              value={deviceId}
              onChange={(event) => changeInput(event.target.value, channel)}
            >
              <option value="">기본 입력</option>
              {devices
                .filter(
                  (device) => device.deviceId && device.deviceId !== "default",
                )
                .map((device, index) => (
                  <option value={device.deviceId} key={device.deviceId}>
                    {device.label || `오디오 입력 ${index + 1}`}
                  </option>
                ))}
            </select>
          </label>
          <label className="tuner-channel-select">
            채널
            <select
              aria-label="입력 채널"
              value={channel}
              onChange={(event) =>
                changeInput(
                  deviceId,
                  event.target.value as "mix" | "left" | "right",
                )
              }
            >
              <option value="left">L · 1</option>
              <option value="right">R · 2</option>
              <option value="mix">L + R</option>
            </select>
          </label>
          <button
            type="button"
            className={`button ${active || starting ? "secondary" : "primary"} tuner-start`}
            onClick={active || starting ? stop : () => void start()}
            aria-label={
              active || starting ? "튜너 입력 정지" : "튜너 입력 시작"
            }
          >
            {active || starting ? <Square size={16} /> : <Mic size={17} />}
            {starting ? "취소" : active ? "정지" : "시작"}
          </button>
        </div>
        <div className={`tuner-level-row ${clipping ? "is-clipping" : ""}`}>
          <Mic size={16} aria-hidden="true" />
          <div
            className="tuner-level-meter"
            role="meter"
            aria-label="입력 레벨"
            aria-valuemin={-80}
            aria-valuemax={0}
            aria-valuenow={
              level > 0
                ? Math.max(-80, Math.round(20 * Math.log10(level)))
                : -80
            }
          >
            <i style={{ width: `${meter}%` }} />
            <b />
          </div>
          <span title={clipping ? "입력 게인을 낮추세요" : "입력 레벨"}>
            {clipping
              ? "CLIP"
              : active
                ? level > 0
                  ? `${Math.max(-80, Math.round(20 * Math.log10(level)))} dBFS`
                  : "−∞ dBFS"
                : null}
          </span>
        </div>
      </div>
      {error && (
        <div className="tuner-error" role="alert">
          {error}
        </div>
      )}

      <details className="tuner-settings">
        <summary>
          기준음 · 튜닝
          <ChevronDown size={16} />
        </summary>
        <div className="tuner-settings-content">
          <div className="tuner-calibration">
            <label htmlFor="tuner-a4">A4</label>
            <div>
              <input
                id="tuner-a4"
                type="number"
                min="430"
                max="450"
                step="1"
                value={a4}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (value >= 430 && value <= 450) onChange({ a4: value });
                }}
              />
              <span>Hz</span>
              <button
                type="button"
                onClick={() => onChange({ a4: 440 })}
                title="440 Hz로 복원"
                aria-label="기준 피치 440 Hz로 복원"
              >
                <RotateCcw size={17} />
              </button>
            </div>
          </div>
          <div className="tuner-custom-heading">
            <p>현별 목표음</p>
            {customStrings && (
              <button
                type="button"
                onClick={() => onChange({ customStrings: null })}
                title="프리셋 복원"
                aria-label="프리셋 복원"
              >
                <RotateCcw size={17} />
              </button>
            )}
          </div>
          <div className="tuner-custom-strings">
            {strings.map((midi, index) => (
              <div key={index}>
                <label>
                  {strings.length - index}번 현
                  <select
                    aria-label={`${strings.length - index}번 현 목표음`}
                    value={midi}
                    onChange={(event) => {
                      const next = [...strings];
                      next[index] = Number(event.target.value);
                      onChange({ customStrings: next });
                    }}
                  >
                    {Array.from({ length: 64 }, (_, i) => i + 21).map(
                      (value) => (
                        <option key={value} value={value}>
                          {noteName(value)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <button
                  type="button"
                  className={reference === index ? "playing" : ""}
                  aria-label={`${noteName(midi)} 기준음 듣기`}
                  title={`${noteName(midi)} 기준음`}
                  onClick={() => void sound(index)}
                >
                  <Volume2 size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
