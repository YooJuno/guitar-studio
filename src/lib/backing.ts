import { parseJazzChord, transposeChord } from "./jazz";
import { JazzInstruments } from "./instruments";
import type { JazzDrum, JazzInstrumentOutputs } from "./instruments";

export interface BackingConfig {
  bars: string[][];
  bpm: number;
  transpose: number;
  beats: number;
  style: "swing" | "bossa" | "ballad" | "straight";
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  countIn: number;
  volume: number;
  piano: number;
  bass: number;
  drums: number;
}
export interface BackingPosition {
  bar: number;
  beat: number;
  chorus: number;
  countIn: boolean;
  chord: string;
  bpm: number;
}
export interface BackingEvent {
  offset: number;
  duration: number;
  instrument: "piano" | "bass" | "ride" | "hat" | "snare" | "kick" | "brush";
  notes: number[];
  velocity: number;
  chord: string;
}
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
const safe = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;
const pc = (value: number) => ((value % 12) + 12) % 12;
function normalize(config: BackingConfig): BackingConfig {
  const bars = Array.isArray(config.bars)
    ? config.bars.map((bar) =>
        Array.isArray(bar) && bar.length
          ? bar.filter((chord) => typeof chord === "string")
          : ["N.C."],
      )
    : [];
  const last = Math.max(0, bars.length - 1);
  const loopStart = clamp(Math.floor(safe(config.loopStart, 0)), 0, last);
  return {
    ...config,
    bars,
    bpm: clamp(safe(config.bpm, 120), 30, 320),
    transpose: clamp(Math.round(safe(config.transpose, 0)), -24, 24),
    beats: clamp(Math.round(safe(config.beats, 4)), 1, 12),
    countIn: clamp(Math.floor(safe(config.countIn, 0)), 0, 4),
    loopStart,
    loopEnd: clamp(Math.floor(safe(config.loopEnd, last)), loopStart, last),
    volume: clamp(safe(config.volume, 0.7), 0, 1),
    piano: clamp(safe(config.piano, 0.7), 0, 1),
    bass: clamp(safe(config.bass, 0.7), 0, 1),
    drums: clamp(safe(config.drums, 0.5), 0, 1),
  };
}
function chordColors(
  chord: NonNullable<ReturnType<typeof parseJazzChord>>,
  name: string,
): number[] {
  const intervals = [...new Set(chord.intervals)];
  const seventh =
    intervals.find((interval) => [10, 11].includes(interval)) ??
    (intervals.includes(9) ? 9 : undefined);
  if (seventh === undefined) return intervals;
  const naturalEleventh =
    /11/.test(name) &&
    intervals.includes(17) &&
    intervals.includes(4) &&
    !intervals.includes(21);
  const third = naturalEleventh
    ? 5
    : (intervals.find((interval) => interval === 3 || interval === 4) ??
      intervals.find((interval) => interval === 2 || interval === 5));
  const result = [third, seventh].filter(
    (interval): interval is number => interval !== undefined,
  );
  const colors = [21, 18, 17, 14, 13, 15, 20].filter((interval) =>
    intervals.includes(interval),
  );
  // Keep the written 13th/9th, rather than blindly stacking every lower extension.
  if (intervals.includes(21) && intervals.includes(14)) {
    colors.splice(
      0,
      colors.length,
      21,
      14,
      ...colors.filter((interval) => interval !== 21 && interval !== 14),
    );
  }
  for (const interval of colors)
    if (
      !result.some((value) => pc(value) === pc(interval)) &&
      result.length < 4
    )
      result.push(interval);
  if (result.length < 3) {
    const fifth = intervals.find((interval) => [6, 7, 8].includes(interval));
    if (fifth !== undefined) result.push(fifth);
  }
  return [...new Set(result.length >= 2 ? result : intervals)];
}

/** Close-position rootless shells chosen by voice movement, not root-position jumps. */
function pianoNotes(
  chord: NonNullable<ReturnType<typeof parseJazzChord>>,
  name: string,
  previous: number[] | null,
): number[] {
  const classes = [
    ...new Set(
      chordColors(chord, name).map((interval) => pc(chord.root + interval)),
    ),
  ];
  const options = classes.map((pitch) =>
    Array.from({ length: 4 }, (_, octave) => pitch + 12 * (octave + 3)).filter(
      (note) => note >= 50 && note <= 77,
    ),
  );
  let best: number[] = [];
  let bestScore = Infinity;
  const visit = (index: number, notes: number[]) => {
    if (index < options.length) {
      options[index].forEach((note) => visit(index + 1, [...notes, note]));
      return;
    }
    const sorted = [...notes].sort((a, b) => a - b);
    const span = sorted.at(-1)! - sorted[0];
    if (span > 19) return;
    let score =
      Math.abs(
        sorted.reduce((sum, note) => sum + note, 0) / sorted.length - 63,
      ) * 0.55;
    score += Math.max(0, span - 13) * 0.7;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i] - sorted[i - 1];
      score += gap === 1 ? 7 : gap === 2 ? 1.4 : gap > 7 ? (gap - 7) * 2 : 0;
    }
    if (previous?.length) {
      score +=
        sorted.reduce(
          (sum, note) =>
            sum + Math.min(...previous.map((prior) => Math.abs(note - prior))),
          0,
        ) * 1.7;
      score +=
        previous.reduce(
          (sum, prior) =>
            sum + Math.min(...sorted.map((note) => Math.abs(note - prior))),
          0,
        ) * 0.8;
    }
    if (score < bestScore) {
      bestScore = score;
      best = sorted;
    }
  };
  visit(0, []);
  return best.length ? best : classes.map((pitch) => 60 + pitch);
}
function uniqueOffsets(values: number[]): number[] {
  return [
    ...new Set(values.map((value) => Math.round(value * 1e9) / 1e9)),
  ].sort((a, b) => a - b);
}
function bassNote(pitch: number, previous: number | null): number {
  const options = Array.from(
    { length: 5 },
    (_, octave) => pc(pitch) + octave * 12,
  ).filter((note) => note >= 28 && note <= 47);
  return options.sort(
    (a, b) =>
      Math.abs(a - (previous ?? 38)) +
      Math.abs(a - 38) * 0.16 -
      (Math.abs(b - (previous ?? 38)) + Math.abs(b - 38) * 0.16),
  )[0];
}
function bassRegister(note: number): number {
  let result = Math.round(note);
  while (result < 28) result += 12;
  while (result > 47) result -= 12;
  return result;
}
function nextChordName(config: BackingConfig, bar: number): string {
  const next =
    bar >= (config.loop ? config.loopEnd : config.bars.length - 1)
      ? config.loop
        ? config.loopStart
        : bar
      : bar + 1;
  return config.bars[next]?.[0] ?? "N.C.";
}

function bassPart(
  cfg: BackingConfig,
  barIndex: number,
  previousBass: number | null,
): { events: BackingEvent[]; last: number | null } {
  const chords = cfg.bars[barIndex] ?? [];
  const events: BackingEvent[] = [];
  if (!chords.length) return { events, last: previousBass };
  const length = cfg.beats / chords.length;
  const chordAt = (offset: number) =>
    Math.min(chords.length - 1, Math.floor((offset + 1e-8) / length));
  const chordBoundaries = chords.map((_, index) => index * length);
  const bassTimes =
    cfg.style === "bossa"
      ? Array.from({ length: Math.ceil(cfg.beats / 2) }, (_, index) => [
          index * 2,
          index * 2 + 1.5,
        ]).flat()
      : cfg.style === "ballad"
        ? [0, cfg.beats / 2]
        : Array.from({ length: cfg.beats }, (_, index) => index);
  const bassOffsets = uniqueOffsets(
    [...bassTimes, ...chordBoundaries].filter(
      (offset) => offset >= 0 && offset < cfg.beats,
    ),
  );
  const following = parseJazzChord(nextChordName(cfg, barIndex));
  bassOffsets.forEach((offset, index) => {
    const chordIndex = chordAt(offset);
    const name = chords[chordIndex];
    const chord = parseJazzChord(name);
    if (!chord) return;
    const within = offset - chordIndex * length;
    const remaining = (chordIndex + 1) * length - offset;
    const third =
      chord.intervals.find((interval) => interval === 3 || interval === 4) ?? 0;
    const fifth =
      chord.intervals.find((interval) => [6, 7, 8].includes(interval)) ?? 0;
    let pitch = chord.bass;
    if (within > 0.001) {
      pitch =
        cfg.style === "bossa"
          ? Math.abs(within % 2) < 1e-6
            ? chord.bass
            : chord.root + fifth
          : cfg.style === "ballad"
            ? chord.root + fifth
            : chord.root + (Math.floor(within) % 2 ? third : fifth);
      if (cfg.style === "swing" && remaining <= 1.01 && within > 0.25) {
        const next =
          chordIndex + 1 < chords.length
            ? parseJazzChord(chords[chordIndex + 1])
            : following;
        if (next) {
          const allowed = chord.intervals.map((interval) =>
            pc(chord.root + interval),
          );
          const approaches = [next.bass - 1, next.bass + 1];
          const chordTone = approaches.find((note) =>
            allowed.includes(pc(note)),
          );
          pitch = chordTone ?? approaches[0];
        }
      }
    }
    let note = bassNote(pitch + cfg.transpose, previousBass);
    if (
      within > 0.001 &&
      previousBass !== null &&
      (Math.abs(note - previousBass) > 7 ||
        (note === previousBass && remaining > 1.01))
    ) {
      const tones = [
        ...new Set(
          chord.intervals.map((interval) => pc(chord.root + interval)),
        ),
      ];
      const candidates = tones
        .flatMap((tone) => [
          pc(tone + cfg.transpose) + 24,
          pc(tone + cfg.transpose) + 36,
          pc(tone + cfg.transpose) + 48,
        ])
        .filter(
          (candidate) =>
            candidate >= 28 && candidate <= 47 && candidate !== previousBass,
        );
      candidates.sort(
        (a, b) =>
          Math.abs(a - previousBass!) +
          Math.abs(a - note) * 0.15 -
          (Math.abs(b - previousBass!) + Math.abs(b - note) * 0.15),
      );
      if (candidates.length) note = candidates[0];
    }
    previousBass = note;
    const nextTime = bassOffsets[index + 1] ?? cfg.beats;
    events.push({
      offset,
      duration: Math.max(
        0.06,
        (nextTime - offset) * (cfg.style === "ballad" ? 0.88 : 0.91),
      ),
      instrument: "bass",
      notes: [note],
      velocity: within < 0.001 ? 0.72 : 0.64,
      chord: name,
    });
  });
  return { events, last: previousBass };
}

/** Pure musical plan. Offsets and durations use the selected beat unit. */
export function planBackingBar(
  config: BackingConfig,
  barIndex: number,
  _chorus = 1,
): BackingEvent[] {
  const cfg = normalize(config);
  const chords = cfg.bars[barIndex] ?? [];
  if (!chords.length) return [];
  const events: BackingEvent[] = [];
  const length = cfg.beats / chords.length;
  const chordAt = (offset: number) =>
    Math.min(chords.length - 1, Math.floor((offset + 1e-8) / length));
  let previousPiano: number[] | null = null;
  for (let bar = 0; bar < barIndex; bar++)
    for (const name of cfg.bars[bar]) {
      const chord = parseJazzChord(name);
      if (chord) previousPiano = pianoNotes(chord, name, previousPiano);
    }
  const voicings = chords.map((name) => {
    const chord = parseJazzChord(name);
    if (!chord) return [];
    previousPiano = pianoNotes(chord, name, previousPiano);
    return previousPiano.map((note) => note + cfg.transpose);
  });
  const compPattern =
    cfg.style === "bossa" || cfg.style === "straight"
      ? Array.from({ length: Math.ceil(cfg.beats / 2) }, (_, index) => [
          index * 2,
          index * 2 + 1.5,
        ]).flat()
      : cfg.style === "ballad"
        ? [0, cfg.beats / 2]
        : [0, barIndex % 2 ? 1 + 2 / 3 : 2 + 2 / 3];
  const chordBoundaries = chords.map((_, index) => index * length);
  const compTimes = uniqueOffsets(
    [...compPattern, ...chordBoundaries].filter(
      (offset) => offset >= 0 && offset < cfg.beats,
    ),
  );
  compTimes.forEach((offset) => {
    const index = chordAt(offset);
    const name = chords[index];
    if (!voicings[index].length) return;
    const remaining = (index + 1) * length - offset;
    if (remaining < 0.18) return;
    const onChange = Math.abs(offset - index * length) < 1e-6;
    const duration =
      cfg.style === "ballad"
        ? Math.min(remaining * 0.88, 2.7)
        : Math.min(remaining * 0.78, cfg.style === "bossa" ? 0.85 : 0.65);
    events.push({
      offset,
      duration,
      instrument: "piano",
      notes: voicings[index],
      velocity: onChange ? 0.68 : cfg.style === "bossa" ? 0.58 : 0.48,
      chord: name,
    });
  });

  let previousBass: number | null = null;
  for (let bar = 0; bar < barIndex; bar++)
    previousBass = bassPart(cfg, bar, previousBass).last;
  events.push(...bassPart(cfg, barIndex, previousBass).events);
  const drum = (
    offset: number,
    instrument: BackingEvent["instrument"],
    velocity: number,
  ) => {
    if (offset >= 0 && offset < cfg.beats)
      events.push({
        offset,
        duration: 0.15,
        instrument,
        notes: [],
        velocity,
        chord: chords[chordAt(offset)],
      });
  };
  for (let beat = 0; beat < cfg.beats; beat++) {
    if (cfg.style === "swing") {
      drum(beat, "ride", beat % 2 ? 0.62 : 0.47);
      if (beat % 2) {
        drum(beat + 2 / 3, "ride", 0.32);
        drum(beat, "hat", 0.4);
      }
      if (beat % 2 === 0) drum(beat, "kick", 0.19);
      if (barIndex % 4 === 2 && beat === 2) drum(beat + 2 / 3, "snare", 0.18);
    } else if (cfg.style === "bossa") {
      drum(beat, "hat", 0.34);
      drum(beat + 0.5, "hat", 0.24);
      if (beat % 2 === 0) {
        drum(beat, "kick", 0.37);
        drum(beat + 1.5, "kick", 0.26);
      } else drum(beat, "snare", 0.28);
    } else if (cfg.style === "ballad") {
      if (beat % 2 === 0) drum(beat, "ride", 0.27);
      else drum(beat, "hat", 0.22);
      if (beat === 0) drum(beat, "kick", 0.16);
    } else {
      drum(beat, "hat", 0.42);
      drum(beat + 0.5, "hat", 0.28);
      drum(beat, beat % 2 ? "snare" : "kick", beat % 2 ? 0.38 : 0.4);
    }
  }
  return events.sort((a, b) => a.offset - b.offset);
}

interface Slot {
  offset: number;
  events: BackingEvent[];
  position: boolean;
}
function slotsFor(config: BackingConfig, bar: number, chorus: number): Slot[] {
  const events = planBackingBar(config, bar, chorus);
  const chords = config.bars[bar] ?? [];
  const positions = [
    ...Array.from({ length: config.beats }, (_, beat) => beat),
    ...chords.map((_, index) => (index * config.beats) / chords.length),
  ];
  return uniqueOffsets([
    ...events.map((event) => event.offset),
    ...positions,
    config.beats,
  ]).map((offset) => ({
    offset,
    events: events.filter((event) => Math.abs(event.offset - offset) < 1e-7),
    position: positions.some((value) => Math.abs(value - offset) < 1e-7),
  }));
}

export interface BackingRenderer {
  playPiano(
    notes: number[],
    at: number,
    duration: number,
    velocity: number,
  ): void;
  playBass(note: number, at: number, duration: number, velocity: number): void;
  playDrum(kind: JazzDrum, at: number, velocity: number): void;
  dispose(): void;
}
type InstrumentFactory = (
  context: BaseAudioContext,
  outputs: JazzInstrumentOutputs,
  options?: { signal?: AbortSignal },
) => Promise<BackingRenderer>;

/** Acoustic sampled accompaniment with audio-clock scheduling. */
export class JazzBacking {
  private config: BackingConfig | null = null;
  private context: AudioContext | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private callbacks = new Set<ReturnType<typeof setTimeout>>();
  private sources = new Set<AudioScheduledSourceNode>();
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private buses: Record<"piano" | "bass" | "drums", GainNode> | null = null;
  private instruments: BackingRenderer | null = null;
  private loading: AbortController | null = null;
  private generation = 0;
  private bar = 0;
  private chorus = 1;
  private countBars = 0;
  private slot = 0;
  private slots: Slot[] = [];
  private plannedTranspose = 0;
  private plannedBeats = 4;
  private plannedChords: string[] = [];
  private nextTime = 0;

  constructor(
    private readonly createInstruments: InstrumentFactory = JazzInstruments.create,
  ) {}

  async start(
    config: BackingConfig,
    onPosition: (position: BackingPosition) => void,
    onEnd: () => void,
    startBar?: number,
  ): Promise<void> {
    this.stop();
    const cfg = normalize(config);
    if (!cfg.bars.length) throw new Error("재생할 마디가 없습니다.");
    this.config = cfg;
    const generation = ++this.generation;
    const context = new AudioContext({ latencyHint: "interactive" });
    this.context = context;
    try {
      await context.resume();
      if (generation !== this.generation) {
        if (context.state !== "closed") await context.close();
        return;
      }
      this.setupAudio(context);
      const loading = new AbortController();
      this.loading = loading;
      const instruments = await this.createInstruments(context, this.buses!, {
        signal: loading.signal,
      });
      if (generation !== this.generation || loading.signal.aborted) {
        instruments.dispose();
        if (context.state !== "closed") await context.close();
        return;
      }
      this.loading = null;
      this.instruments = instruments;
      this.bar = clamp(
        Math.floor(safe(startBar ?? (cfg.loop ? cfg.loopStart : 0), 0)),
        cfg.loop ? cfg.loopStart : 0,
        cfg.loop ? cfg.loopEnd : cfg.bars.length - 1,
      );
      this.chorus = 1;
      this.countBars = cfg.countIn;
      this.nextTime = context.currentTime + 0.08;
      this.loadBar();
      const schedule = () => {
        if (
          this.context !== context ||
          generation !== this.generation ||
          !this.config
        )
          return;
        const current = this.config;
        this.applyLevels(current);
        if (this.nextTime < context.currentTime) {
          // Skip stale visual work and resume this musical position without an audio burst.
          this.callbacks.forEach(clearTimeout);
          this.callbacks.clear();
          this.nextTime = context.currentTime + 0.04;
        }
        let guard = 0;
        while (this.nextTime < context.currentTime + 0.12 && guard++ < 128) {
          if (this.nextTime < context.currentTime)
            this.nextTime = context.currentTime + 0.04;
          const item = this.slots[this.slot];
          if (!item) break;
          if (item.offset >= this.plannedBeats - 1e-7) {
            if (!this.advanceBar()) {
              const endAt = this.nextTime;
              const timer = setTimeout(
                () => {
                  this.callbacks.delete(timer);
                  if (generation !== this.generation) return;
                  this.stop();
                  onEnd();
                },
                Math.max(0, (endAt - context.currentTime) * 1000),
              );
              this.callbacks.add(timer);
              if (this.interval !== null) clearInterval(this.interval);
              this.interval = null;
              return;
            }
            continue;
          }
          if (this.countBars > 0) {
            if (Number.isInteger(item.offset))
              this.countClick(this.nextTime, item.offset === 0);
          } else {
            for (const event of item.events)
              this.playEvent(
                event,
                this.nextTime,
                current.bpm,
                current.transpose - this.plannedTranspose,
              );
          }
          if (item.position) {
            const names = this.plannedChords.length
              ? this.plannedChords
              : ["N.C."];
            const chord =
              names[
                Math.min(
                  names.length - 1,
                  Math.floor(
                    ((item.offset + 1e-8) * names.length) / this.plannedBeats,
                  ),
                )
              ] ?? "N.C.";
            const position: BackingPosition = {
              bar: this.bar,
              beat: Math.floor(item.offset + 1e-8),
              chorus: this.chorus,
              countIn: this.countBars > 0,
              chord:
                this.countBars > 0
                  ? ""
                  : transposeChord(chord, current.transpose),
              bpm: current.bpm,
            };
            const scheduledAt = this.nextTime;
            const timer = setTimeout(
              () => {
                this.callbacks.delete(timer);
                if (
                  generation === this.generation &&
                  context.currentTime - scheduledAt < 0.15
                )
                  onPosition(position);
              },
              Math.max(0, (scheduledAt - context.currentTime) * 1000),
            );
            this.callbacks.add(timer);
          }
          const nextOffset =
            this.slots[this.slot + 1]?.offset ?? this.plannedBeats;
          this.nextTime += ((nextOffset - item.offset) * 60) / current.bpm;
          this.slot++;
        }
      };
      schedule();
      this.interval = setInterval(schedule, 25);
    } catch (error) {
      if (generation === this.generation) this.stop();
      throw error;
    }
  }

  update(patch: Partial<BackingConfig>): void {
    if (!this.config) return;
    this.config = normalize({ ...this.config, ...patch });
    this.applyLevels(this.config);
  }
  private loadBar() {
    const cfg = this.config!;
    this.plannedTranspose = cfg.transpose;
    this.plannedBeats = cfg.beats;
    this.plannedChords = cfg.bars[this.bar] ?? [];
    this.slot = 0;
    this.slots =
      this.countBars > 0
        ? Array.from({ length: cfg.beats + 1 }, (_, offset) => ({
            offset,
            events: [],
            position: offset < cfg.beats,
          }))
        : slotsFor(cfg, this.bar, this.chorus);
  }
  private advanceBar(): boolean {
    const cfg = this.config!;
    if (this.countBars > 0) {
      this.countBars--;
      this.loadBar();
      return true;
    }
    const end = cfg.loop ? cfg.loopEnd : cfg.bars.length - 1;
    if (this.bar >= end) {
      if (!cfg.loop) return false;
      this.bar = cfg.loopStart;
      this.chorus++;
    } else this.bar++;
    this.loadBar();
    return true;
  }
  private setupAudio(context: AudioContext) {
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    compressor.connect(master);
    master.connect(context.destination);
    const piano = context.createGain();
    const bass = context.createGain();
    const drums = context.createGain();
    piano.connect(compressor);
    bass.connect(compressor);
    drums.connect(compressor);
    this.master = master;
    this.compressor = compressor;
    this.buses = { piano, bass, drums };
    this.applyLevels(this.config!);
  }
  private applyLevels(config: BackingConfig) {
    if (!this.context || !this.master || !this.buses) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(config.volume * 1.75, now, 0.015);
    this.buses.piano.gain.setTargetAtTime(config.piano, now, 0.015);
    this.buses.bass.gain.setTargetAtTime(config.bass, now, 0.015);
    this.buses.drums.gain.setTargetAtTime(config.drums, now, 0.015);
  }
  private countClick(time: number, accent: boolean) {
    const context = this.context;
    const bus = this.compressor;
    if (!context || !bus) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = accent ? 1320 : 880;
    gain.gain.setValueAtTime(0.06, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
    oscillator.connect(gain);
    gain.connect(bus);
    this.sources.add(oscillator);
    oscillator.onended = () => {
      this.sources.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(time);
    oscillator.stop(time + 0.06);
  }
  private playEvent(
    event: BackingEvent,
    time: number,
    bpm: number,
    transposeDelta: number,
  ) {
    const cfg = this.config!;
    if (!this.instruments || cfg.volume <= 0) return;
    const duration = (event.duration * 60) / bpm;
    if (event.instrument === "piano" && cfg.piano > 0)
      this.instruments.playPiano(
        event.notes.map((note) => note + transposeDelta),
        time,
        duration,
        event.velocity,
      );
    else if (event.instrument === "bass" && cfg.bass > 0)
      this.instruments.playBass(
        bassRegister(event.notes[0] + transposeDelta),
        time,
        duration,
        event.velocity,
      );
    else if (
      cfg.drums > 0 &&
      event.instrument !== "piano" &&
      event.instrument !== "bass"
    )
      this.instruments.playDrum(event.instrument, time, event.velocity);
  }
  stop(): void {
    this.generation++;
    this.loading?.abort();
    this.loading = null;
    this.instruments?.dispose();
    this.instruments = null;
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;
    this.callbacks.forEach(clearTimeout);
    this.callbacks.clear();
    const context = this.context;
    this.context = null;
    this.sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* Already stopped. */
      }
    });
    this.sources.clear();
    this.buses?.piano.disconnect();
    this.buses?.bass.disconnect();
    this.buses?.drums.disconnect();
    this.master?.disconnect();
    this.compressor?.disconnect();
    this.master = null;
    this.compressor = null;
    this.buses = null;
    if (context && context.state !== "closed")
      void context.close().catch(() => undefined);
  }
}
