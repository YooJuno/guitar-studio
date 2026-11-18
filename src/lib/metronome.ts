import { claimAudioSession, resumeAudioContext } from "./audio-session";

export type BeatStrength = 0 | 1 | 2;
export interface MetronomeConfig {
  bpm: number;
  beats: number;
  denominator: number;
  subdivision: number;
  swing: boolean;
  accents: BeatStrength[];
  volume: number;
  sound: "wood" | "digital";
  countIn: number;
  rampEvery: number;
  rampBy: number;
  timerMinutes: number;
}
export interface Tick {
  beat: number;
  sub: number;
  bar: number;
  countIn: boolean;
  bpm: number;
}
export const defaultMetronome: MetronomeConfig = {
  bpm: 100,
  beats: 4,
  denominator: 4,
  subdivision: 1,
  swing: false,
  accents: [2, 1, 1, 1],
  volume: 0.7,
  sound: "wood",
  countIn: 0,
  rampEvery: 0,
  rampBy: 2,
  timerMinutes: 0,
};
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const numberOr = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
/** Median intervals tolerate an accidental double tap without nudging the tempo. */
export function tapTempo(taps: number[]): number | null {
  const intervals = taps
    .slice(1)
    .map((time, index) => time - taps[index])
    .filter(
      (interval) =>
        Number.isFinite(interval) && interval >= 200 && interval <= 3000,
    );
  if (!intervals.length) return null;
  return clamp(Math.round(60000 / median(intervals)), 20, 300);
}
/** BPM counts the selected beat unit: an eighth-note beat in an /8 signature. */
export function stepDuration(
  config: MetronomeConfig,
  sub: number,
  bpm = config.bpm,
) {
  const tempo = clamp(numberOr(bpm, 100), 20, 300);
  const subdivision = clamp(Math.round(numberOr(config.subdivision, 1)), 1, 4);
  const beat = 60 / tempo;
  if (config.swing && subdivision === 2)
    return beat * (sub === 0 ? 2 / 3 : 1 / 3);
  return beat / subdivision;
}
function safeConfig(config: MetronomeConfig): MetronomeConfig {
  return {
    ...config,
    bpm: clamp(numberOr(config.bpm, 100), 20, 300),
    beats: clamp(Math.round(numberOr(config.beats, 4)), 1, 16),
    subdivision: clamp(Math.round(numberOr(config.subdivision, 1)), 1, 4),
    accents: Array.isArray(config.accents) ? config.accents : [],
    countIn: clamp(Math.round(numberOr(config.countIn, 0)), 0, 8),
    volume: clamp(numberOr(config.volume, 0.7), 0, 1),
    rampEvery: clamp(Math.round(numberOr(config.rampEvery, 0)), 0, 128),
    rampBy: clamp(numberOr(config.rampBy, 2), -50, 50),
    timerMinutes: clamp(numberOr(config.timerMinutes, 0), 0, 180),
  };
}
/** Audio-clock scheduling: UI timers only enqueue events ahead of the audio clock. */
export class Metronome {
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private clockWatch: ReturnType<typeof setInterval> | null = null;
  private startup: AbortController | null = null;
  private visualTimers = new Set<ReturnType<typeof setTimeout>>();
  private voices = new Set<OscillatorNode>();
  private nextTime = 0;
  private step = 0;
  private startedAt = 0;
  private generation = 0;
  private releaseSession: (() => void) | null = null;
  config: MetronomeConfig = {
    ...defaultMetronome,
    accents: [...defaultMetronome.accents],
  };

  async start(
    onTick: (tick: Tick) => void,
    onStop: (reason?: "interrupted") => void,
  ) {
    this.stop();
    const generation = ++this.generation;
    this.releaseSession = claimAudioSession("playback");
    const startup = new AbortController();
    this.startup = startup;
    try {
      const context = new AudioContext({ latencyHint: "interactive" });
      this.context = context;
      await resumeAudioContext(context, startup.signal);
      if (generation !== this.generation) return;
      this.startup = null;
      if (context.state !== "running")
        throw new Error("오디오 출력이 시작되지 않았습니다.");
      this.nextTime = context.currentTime + 0.08;
      this.startedAt = this.nextTime;
      this.step = 0;
      const schedule = () => {
        if (this.context !== context || generation !== this.generation) return;
        if (context.state !== "running") return;
        const cfg = safeConfig(this.config);
        const deadline =
          cfg.timerMinutes > 0
            ? this.startedAt + cfg.timerMinutes * 60
            : Infinity;
        if (context.currentTime >= deadline) {
          this.stop();
          onStop();
          return;
        }
        // Browser background throttling can leave the next beat in the past.
        // Re-anchor instead of asking Web Audio to play all missed notes at once.
        if (this.nextTime < context.currentTime)
          this.nextTime = context.currentTime + 0.04;
        while (this.nextTime < Math.min(context.currentTime + 0.12, deadline)) {
          const stepsPerBar = cfg.beats * cfg.subdivision;
          const rawBar = Math.floor(this.step / stepsPerBar);
          const countIn = rawBar < cfg.countIn;
          const bar = rawBar - cfg.countIn;
          const beat = Math.floor(this.step / cfg.subdivision) % cfg.beats;
          const sub = this.step % cfg.subdivision;
          const ramp =
            !countIn && cfg.rampEvery > 0
              ? Math.floor(bar / cfg.rampEvery) * cfg.rampBy
              : 0;
          const bpm = clamp(cfg.bpm + ramp, 20, 300);
          const strength = cfg.accents[beat] ?? 1;
          if (strength > 0 && cfg.volume > 0)
            this.click(
              this.nextTime,
              sub === 0 ? strength : 0.5,
              cfg,
              deadline,
            );
          const tick = { beat, sub, bar: Math.max(0, bar) + 1, countIn, bpm };
          const scheduledAt = this.nextTime;
          const timer = setTimeout(
            () => {
              this.visualTimers.delete(timer);
              // Do not flash stale queued visual beats after a suspended tab resumes.
              const delay = context.currentTime - scheduledAt;
              if (
                generation === this.generation &&
                context.state === "running" &&
                delay >= -0.02 && delay < 0.15
              )
                onTick(tick);
            },
            Math.max(0, (scheduledAt - context.currentTime) * 1000),
          );
          this.visualTimers.add(timer);
          this.nextTime += stepDuration(cfg, sub, bpm);
          this.step++;
        }
      };
      schedule();
      this.timer = setInterval(schedule, 25);
      let previousTime = context.currentTime;
      this.clockWatch = setInterval(() => {
        if (generation !== this.generation) return;
        const time = context.currentTime;
        if (
          (typeof document === "undefined" || !document.hidden) &&
          (context.state !== "running" || time <= previousTime)
        ) {
          this.stop();
          onStop("interrupted");
          return;
        }
        previousTime = time;
      }, 1500);
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      throw error;
    }
  }

  private click(
    time: number,
    strength: number,
    cfg: MetronomeConfig,
    deadline: number,
  ) {
    if (!this.context) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = cfg.sound === "wood" ? "sine" : "triangle";
    const frequency = cfg.sound === "wood" ? 1300 : 900;
    osc.frequency.setValueAtTime(
      frequency * (strength === 2 ? 1.6 : strength < 1 ? 0.7 : 1),
      time,
    );
    const endTime = Math.min(time + 0.06, deadline);
    if (cfg.sound === "wood")
      osc.frequency.exponentialRampToValueAtTime(
        frequency * 0.5,
        Math.min(time + 0.035, endTime),
      );
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.002, cfg.volume * (strength < 1 ? 0.12 : 0.28)),
      Math.min(time + 0.002, endTime),
    );
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      Math.min(time + 0.055, endTime),
    );
    osc.connect(gain);
    gain.connect(this.context.destination);
    this.voices.add(osc);
    osc.onended = () => {
      this.voices.delete(osc);
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(time);
    osc.stop(endTime);
  }

  stop() {
    this.generation++;
    this.startup?.abort();
    this.startup = null;
    this.releaseSession?.();
    this.releaseSession = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (this.clockWatch !== null) clearInterval(this.clockWatch);
    this.clockWatch = null;
    this.visualTimers.forEach(clearTimeout);
    this.visualTimers.clear();
    this.voices.forEach((voice) => {
      try {
        voice.stop();
      } catch {
        /* Already ended. */
      }
    });
    this.voices.clear();
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed")
      void context.close().catch(() => undefined);
  }
}
