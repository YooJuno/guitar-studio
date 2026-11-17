import { parseJazzChord, transposeChord } from "./jazz";

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
  instrument: "piano" | "bass" | "ride" | "snare" | "kick" | "brush";
  notes: number[];
  velocity: number;
  chord: string;
}
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
const safe = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;
const pc = (value: number) => ((value % 12) + 12) % 12;
const midiHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
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
function pianoNotes(
  chord: NonNullable<ReturnType<typeof parseJazzChord>>,
  transpose: number,
): number[] {
  const intervals = [...new Set(chord.intervals)];
  // Keep the third/seventh character and written extensions; omit the fifth
  // in dense chords so the comping stays out of the walking bass register.
  const chosen =
    intervals.length > 4
      ? intervals.filter((interval) => interval !== 0 && pc(interval) !== 7)
      : intervals;
  let notes = chosen.map((interval) => 48 + chord.root + interval + transpose);
  while (Math.min(...notes) < 48) notes = notes.map((note) => note + 12);
  while (Math.max(...notes) > 84) notes = notes.map((note) => note - 12);
  return notes;
}
function bassRegister(pitch: number) {
  return 28 + pc(pitch - 4);
}
function uniqueOffsets(values: number[]): number[] {
  return [
    ...new Set(values.map((value) => Math.round(value * 1e9) / 1e9)),
  ].sort((a, b) => a - b);
}

/** Pure musical plan. Offsets and durations are measured in the selected beat unit. */
export function planBackingBar(
  config: BackingConfig,
  barIndex: number,
  chorus = 1,
): BackingEvent[] {
  const cfg = normalize(config);
  const chords = cfg.bars[barIndex] ?? [];
  if (!chords.length) return [];
  const events: BackingEvent[] = [];
  const length = cfg.beats / chords.length;
  const chordAt = (offset: number) =>
    Math.min(chords.length - 1, Math.floor((offset + 1e-8) / length));
  chords.forEach((name, index) => {
    const chord = parseJazzChord(name);
    if (!chord) return;
    const offset = index * length;
    const duration =
      cfg.style === "ballad"
        ? length * 0.85
        : Math.min(length * 0.7, cfg.style === "bossa" ? 0.75 : 0.65);
    const notes = pianoNotes(chord, cfg.transpose);
    events.push({
      offset,
      duration,
      instrument: "piano",
      notes,
      velocity: index === 0 ? 0.85 : 0.73,
      chord: name,
    });
    // A quiet syncopation, bounded by the actual next chord boundary.
    const comp =
      cfg.style === "bossa"
        ? 0.75
        : cfg.style === "swing"
          ? 2 / 3
          : cfg.style === "straight"
            ? 0.5
            : length / 2;
    if (length > comp + 0.3)
      events.push({
        offset: offset + comp,
        duration: Math.min(0.55, length - comp - 0.05),
        instrument: "piano",
        notes,
        velocity: 0.48 + ((barIndex + chorus) % 3) * 0.035,
        chord: name,
      });
  });
  const bassTimes =
    cfg.style === "bossa"
      ? Array.from({ length: Math.ceil(cfg.beats / 2) }, (_, index) => [
          index * 2,
          index * 2 + 1.5,
        ]).flat()
      : cfg.style === "ballad"
        ? [0, cfg.beats / 2]
        : Array.from({ length: cfg.beats }, (_, index) => index);
  const boundaries = chords.map((_, index) => index * length);
  const bassOffsets = uniqueOffsets(
    [...bassTimes, ...boundaries].filter(
      (offset) => offset >= 0 && offset < cfg.beats,
    ),
  );
  bassOffsets.forEach((offset, index) => {
    const chordIndex = chordAt(offset);
    const name = chords[chordIndex];
    const chord = parseJazzChord(name);
    if (!chord) return;
    const within = offset - chordIndex * length;
    const third =
      chord.intervals.find(
        (interval) => pc(interval) === 3 || pc(interval) === 4,
      ) ?? 0;
    const fifth =
      chord.intervals.find((interval) => [6, 7, 8].includes(pc(interval))) ?? 0;
    const seventh =
      chord.intervals.find((interval) => [9, 10, 11].includes(pc(interval))) ??
      fifth;
    const pattern = [
      chord.bass,
      chord.root + third,
      chord.root + fifth,
      chord.root + seventh,
    ];
    const pitch =
      Math.abs(within) < 1e-6
        ? chord.bass
        : cfg.style === "bossa"
          ? Math.abs(within % 2) < 1e-6
            ? chord.bass
            : chord.root + fifth
          : pattern[(Math.floor(within) + chorus - 1) % pattern.length];
    const next = bassOffsets[index + 1] ?? cfg.beats;
    events.push({
      offset,
      duration: Math.max(
        0.07,
        (next - offset) * (cfg.style === "ballad" ? 0.85 : 0.72),
      ),
      instrument: "bass",
      notes: [bassRegister(pitch) + cfg.transpose],
      velocity: within < 1e-6 ? 0.95 : 0.78,
      chord: name,
    });
  });
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
      drum(beat, "ride", beat % 2 ? 0.6 : 0.42);
      if (beat % 2) {
        drum(beat + 2 / 3, "ride", 0.34);
        drum(beat, "snare", 0.2);
      }
      if (beat % 2 === 0) drum(beat, "kick", 0.35);
    } else if (cfg.style === "bossa") {
      drum(beat, "ride", 0.3);
      drum(beat + 0.5, "ride", 0.2);
      if (beat % 2 === 0) {
        drum(beat, "kick", 0.5);
        drum(beat + 1.5, "kick", 0.32);
      } else drum(beat, "snare", 0.34);
    } else if (cfg.style === "ballad") {
      drum(beat, "brush", beat === 0 ? 0.44 : 0.28);
      if (beat === 0) drum(beat, "kick", 0.28);
      if (beat === Math.floor(cfg.beats / 2)) drum(beat, "ride", 0.3);
    } else {
      drum(beat, "ride", 0.38);
      drum(beat + 0.5, "ride", 0.25);
      drum(beat, beat % 2 ? "snare" : "kick", beat % 2 ? 0.44 : 0.48);
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

/** Locally synthesized jazz practice accompaniment with audio-clock scheduling. */
export class JazzBacking {
  private config: BackingConfig | null = null;
  private context: AudioContext | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private callbacks = new Set<ReturnType<typeof setTimeout>>();
  private sources = new Set<AudioScheduledSourceNode>();
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private buses: Record<"piano" | "bass" | "drums", GainNode> | null = null;
  private noise: AudioBuffer | null = null;
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
    const buffer = context.createBuffer(
      1,
      context.sampleRate,
      context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    let random = 89117;
    for (let i = 0; i < data.length; i++) {
      random = (random * 1664525 + 1013904223) >>> 0;
      data[i] = random / 2147483648 - 1;
    }
    this.noise = buffer;
    this.applyLevels(this.config!);
  }
  private applyLevels(config: BackingConfig) {
    if (!this.context || !this.master || !this.buses) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(config.volume * 0.7, now, 0.015);
    this.buses.piano.gain.setTargetAtTime(config.piano, now, 0.015);
    this.buses.bass.gain.setTargetAtTime(config.bass, now, 0.015);
    this.buses.drums.gain.setTargetAtTime(config.drums, now, 0.015);
  }
  private register(source: AudioScheduledSourceNode, cleanup: () => void) {
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      cleanup();
    };
  }
  private tone(
    notes: number[],
    time: number,
    duration: number,
    velocity: number,
    instrument: "piano" | "bass",
  ) {
    const context = this.context;
    const bus = this.buses?.[instrument];
    if (!context || !bus || !notes.length) return;
    const partials =
      instrument === "piano"
        ? [
            [1, 1],
            [2, 0.34],
            [3, 0.13],
            [4, 0.045],
          ]
        : [
            [1, 1],
            [2, 0.22],
            [3, 0.055],
          ];
    notes.forEach((note) => {
      const envelope = context.createGain();
      envelope.connect(bus);
      const seconds = clamp(duration, 0.07, instrument === "piano" ? 5 : 2.5);
      const amplitude =
        velocity *
        (instrument === "piano" ? 0.09 / Math.sqrt(notes.length) : 0.17);
      envelope.gain.setValueAtTime(0.0001, time);
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(0.0002, amplitude),
        time + 0.008,
      );
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, amplitude * 0.23),
        time + Math.max(0.03, seconds * 0.65),
      );
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + seconds + 0.08);
      let remaining = partials.length;
      for (const [harmonic, amplitude] of partials) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(midiHz(note) * harmonic, time);
        gain.gain.value = amplitude;
        oscillator.connect(gain);
        gain.connect(envelope);
        this.register(oscillator, () => {
          gain.disconnect();
          if (--remaining === 0) envelope.disconnect();
        });
        oscillator.start(time);
        oscillator.stop(time + seconds + 0.1);
      }
    });
  }
  private noiseHit(
    time: number,
    kind: "ride" | "snare" | "brush",
    velocity: number,
  ) {
    const context = this.context;
    const bus = this.buses?.drums;
    if (!context || !bus || !this.noise) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noise;
    filter.type = kind === "ride" ? "highpass" : "bandpass";
    filter.frequency.value =
      kind === "ride" ? 5400 : kind === "snare" ? 1900 : 2900;
    filter.Q.value = kind === "snare" ? 0.7 : 0.5;
    const duration = kind === "brush" ? 0.34 : kind === "ride" ? 0.19 : 0.1;
    const amplitude =
      velocity * (kind === "ride" ? 0.045 : kind === "brush" ? 0.055 : 0.08);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, amplitude),
      time + 0.003,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    this.register(source, () => {
      filter.disconnect();
      gain.disconnect();
    });
    source.start(time, 0, duration + 0.01);
    source.stop(time + duration + 0.01);
  }
  private kick(time: number, velocity: number) {
    const context = this.context;
    const bus = this.buses?.drums;
    if (!context || !bus) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(95, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.1);
    gain.gain.setValueAtTime(Math.max(0.0002, velocity * 0.22), time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
    oscillator.connect(gain);
    gain.connect(bus);
    this.register(oscillator, () => gain.disconnect());
    oscillator.start(time);
    oscillator.stop(time + 0.14);
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
    this.register(oscillator, () => gain.disconnect());
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
    if (event.instrument === "piano" || event.instrument === "bass") {
      if (cfg[event.instrument] <= 0 || cfg.volume <= 0) return;
      this.tone(
        event.notes.map((note) => note + transposeDelta),
        time,
        (event.duration * 60) / bpm,
        event.velocity,
        event.instrument,
      );
    } else if (cfg.drums > 0 && cfg.volume > 0) {
      if (event.instrument === "kick") this.kick(time, event.velocity);
      else this.noiseHit(time, event.instrument, event.velocity);
    }
  }
  stop(): void {
    this.generation++;
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
    this.noise = null;
    if (context && context.state !== "closed")
      void context.close().catch(() => undefined);
  }
}
