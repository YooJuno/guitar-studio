/** A small self-hosted acoustic sample bank. No oscillator fallback. */
export type JazzDrum = "ride" | "hat" | "kick" | "snare" | "brush";
export interface JazzSample {
  id: string;
  instrument: "piano" | "bass" | "drums";
  root: number;
  layer?: "soft" | "medium";
  kind?: Exclude<JazzDrum, "brush">;
  variant: number;
}
const pianoRoots = [48, 52, 55, 60, 64, 67, 72, 76, 79, 83];
const bassRoots = [24, 31, 34, 38, 45, 48, 57];
export const JAZZ_SAMPLES: readonly JazzSample[] = [
  ...pianoRoots.flatMap((root) =>
    (["soft", "medium"] as const).map((layer) => ({
      id: `piano-${layer}-${root}`,
      instrument: "piano" as const,
      root,
      layer,
      variant: 0,
    })),
  ),
  ...bassRoots.flatMap((root) =>
    [0, 1].map((variant) => ({
      id: `bass-${root}-${variant}`,
      instrument: "bass" as const,
      root,
      variant,
    })),
  ),
  { id: "ride-soft", instrument: "drums", root: 60, kind: "ride", variant: 0 },
  { id: "ride-hard", instrument: "drums", root: 60, kind: "ride", variant: 1 },
  { id: "hat-closed", instrument: "drums", root: 60, kind: "hat", variant: 0 },
  { id: "hat-pedal", instrument: "drums", root: 60, kind: "hat", variant: 1 },
  { id: "kick-soft", instrument: "drums", root: 60, kind: "kick", variant: 0 },
  {
    id: "snare-soft",
    instrument: "drums",
    root: 60,
    kind: "snare",
    variant: 0,
  },
];
export const jazzSampleURL = (sample: Pick<JazzSample, "id">, format = "m4a") =>
  `/samples/jazz-v1/${sample.id}.${format}`;
export interface JazzInstrumentOutputs {
  piano: AudioNode;
  bass: AudioNode;
  drums: AudioNode;
}
type Bank = ReadonlyMap<string, AudioBuffer>;
const banks = new Map<number, Bank>();
const pendingBanks = new WeakMap<BaseAudioContext, Promise<Bank>>();
const compressed = new Map<string, Promise<ArrayBuffer>>();
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

/** Nearest recorded root; every target is transposed from its true source pitch. */
export function chooseJazzSample(
  instrument: "piano" | "bass",
  midi: number,
  velocity: number,
  variant = 0,
): JazzSample {
  const layer = velocity < 0.58 ? "soft" : "medium";
  const choices = JAZZ_SAMPLES.filter(
    (sample) =>
      sample.instrument === instrument &&
      (instrument === "piano"
        ? sample.layer === layer
        : sample.variant === Math.abs(variant) % 2),
  );
  return choices.reduce((best, sample) =>
    Math.abs(sample.root - midi) < Math.abs(best.root - midi) ? sample : best,
  );
}

async function bytes(url: string): Promise<ArrayBuffer> {
  let request = compressed.get(url);
  if (!request) {
    request = (async () => {
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 15000);
      try {
        const response = await fetch(url, { signal: abort.signal });
        if (!response.ok) throw new Error(`Sample HTTP ${response.status}`);
        return await response.arrayBuffer();
      } finally {
        clearTimeout(timeout);
      }
    })().catch((error) => {
      compressed.delete(url);
      throw error;
    });
    compressed.set(url, request);
  }
  return request;
}

function normalizeBuffer(
  context: BaseAudioContext,
  source: AudioBuffer,
  sample: JazzSample,
): AudioBuffer {
  // Keep attacks and useful natural decay without retaining ten-second tails
  // for every piano sample. AudioBuffers can be reused by later contexts.
  const maximum =
    sample.instrument === "piano" ? 4.5 : sample.instrument === "bass" ? 3 : 3;
  const length = Math.min(
    source.length,
    Math.ceil(source.sampleRate * maximum),
  );
  if (!length) throw new Error("Empty acoustic sample");
  const result = context.createBuffer(
    source.numberOfChannels,
    length,
    source.sampleRate,
  );
  let peak = 0;
  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    const data = source.getChannelData(channel);
    for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  if (!Number.isFinite(peak) || peak < 0.00001)
    throw new Error("Silent acoustic sample");
  const scale = 0.8 / peak;
  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    const input = source.getChannelData(channel);
    const output = result.getChannelData(channel);
    for (let i = 0; i < length; i++) output[i] = input[i] * scale;
    // Trimming must not create a hard DC step at the tail.
    const fade = Math.min(length, Math.ceil(source.sampleRate * 0.025));
    for (let i = 0; i < fade; i++) output[length - fade + i] *= 1 - i / fade;
  }
  return result;
}

function aborted(signal: AbortSignal): never {
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("재생 준비가 취소되었습니다.", "AbortError");
}
function during<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    try {
      aborted(signal);
    } catch (error) {
      return Promise.reject(error);
    }
  }
  return new Promise((resolve, reject) => {
    const cancel = () => {
      try {
        aborted(signal);
      } catch (error) {
        reject(error);
      }
    };
    signal.addEventListener("abort", cancel, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", cancel);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", cancel);
        reject(error);
      },
    );
  });
}

async function loadBank(
  context: BaseAudioContext,
  signal: AbortSignal,
): Promise<Bank> {
  const result = new Map<string, AudioBuffer>();
  let next = 0;
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      while (next < JAZZ_SAMPLES.length) {
        if (signal.aborted) aborted(signal);
        const sample = JAZZ_SAMPLES[next++];
        let decoded: AudioBuffer | null = null;
        for (const format of ["m4a", "ogg"]) {
          try {
            const data = await during(
              bytes(jazzSampleURL(sample, format)),
              signal,
            );
            decoded = await during(
              context.decodeAudioData(data.slice(0)),
              signal,
            );
            break;
          } catch {
            if (signal.aborted)
              aborted(
                signal,
              ); /* OGG fallback supports systems without an AAC decoder. */
          }
        }
        if (!decoded)
          throw new Error(
            "악기 샘플을 불러오지 못했습니다. 연결을 확인하고 다시 재생해 주세요.",
          );
        result.set(sample.id, normalizeBuffer(context, decoded, sample));
      }
    }),
  );
  return result;
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  kind: string;
}

export class JazzInstruments {
  private voices = new Set<Voice>();
  private roundRobin = 0;
  private disposed = false;

  private constructor(
    private context: BaseAudioContext,
    private outputs: JazzInstrumentOutputs,
    private bank: Bank,
  ) {}

  static async create(
    context: BaseAudioContext,
    outputs: JazzInstrumentOutputs,
    options: { signal?: AbortSignal } = {},
  ): Promise<JazzInstruments> {
    const abort = new AbortController();
    const cancel = () =>
      abort.abort(
        new DOMException("재생 준비가 취소되었습니다.", "AbortError"),
      );
    if (options.signal?.aborted) cancel();
    else options.signal?.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(
      () =>
        abort.abort(
          new Error(
            "악기 샘플을 불러오지 못했습니다. 연결을 확인하고 다시 재생해 주세요.",
          ),
        ),
      25000,
    );
    let buffers: Bank;
    try {
      if (abort.signal.aborted) aborted(abort.signal);
      const ready = banks.get(context.sampleRate);
      if (ready) buffers = ready;
      else {
        let bank = pendingBanks.get(context);
        if (!bank) {
          bank = loadBank(context, abort.signal)
            .then((result) => {
              banks.set(context.sampleRate, result);
              return result;
            })
            .finally(() => pendingBanks.delete(context));
          pendingBanks.set(context, bank);
        }
        buffers = await during(bank, abort.signal);
      }
      if (abort.signal.aborted) aborted(abort.signal);
    } catch (error) {
      // Cancel the other decode workers when any required sample fails.
      abort.abort(error);
      throw error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", cancel);
    }
    return new JazzInstruments(context, outputs, buffers);
  }

  playPiano(
    midis: number[],
    at: number,
    duration: number,
    velocity: number,
  ): void {
    const notes = [...new Set(midis.filter(Number.isFinite))];
    const level = 0.38 / Math.sqrt(Math.max(1, notes.length));
    notes.forEach((midi) => {
      const sample = chooseJazzSample("piano", midi, velocity);
      this.play(
        sample,
        midi,
        at,
        duration,
        velocity,
        level,
        0.18,
        this.outputs.piano,
      );
    });
  }

  playBass(midi: number, at: number, duration: number, velocity: number): void {
    if (!Number.isFinite(midi)) return;
    const sample = chooseJazzSample("bass", midi, velocity, this.roundRobin++);
    this.play(
      sample,
      midi,
      at,
      duration,
      velocity,
      0.52,
      0.12,
      this.outputs.bass,
    );
  }

  playDrum(kind: JazzDrum, at: number, velocity: number): void {
    // This bank has no brush sweep. Ballads use quiet acoustic snare/hat hits,
    // rather than pretending synthesized noise is a recorded brush instrument.
    const actual = kind === "brush" ? "snare" : kind;
    const variant =
      actual === "ride"
        ? velocity >= 0.68
          ? 1
          : 0
        : actual === "hat"
          ? this.roundRobin++ % 2
          : 0;
    const sample = JAZZ_SAMPLES.find(
      (sample) =>
        sample.instrument === "drums" &&
        sample.kind === actual &&
        sample.variant === variant,
    )!;
    const level =
      kind === "ride"
        ? 0.24
        : kind === "kick"
          ? 0.32
          : kind === "hat"
            ? 0.24
            : kind === "brush"
              ? 0.12
              : 0.26;
    this.play(
      sample,
      sample.root,
      at,
      this.bank.get(sample.id)!.duration,
      velocity,
      level,
      0.035,
      this.outputs.drums,
    );
  }

  dispose(): void {
    this.disposed = true;
    for (const voice of [...this.voices]) this.remove(voice, true);
  }

  private play(
    sample: JazzSample,
    midi: number,
    at: number,
    duration: number,
    velocity: number,
    level: number,
    release: number,
    output: AudioNode,
  ) {
    if (
      this.disposed ||
      !Number.isFinite(at) ||
      !Number.isFinite(velocity) ||
      velocity <= 0 ||
      !Number.isFinite(duration) ||
      duration <= 0
    )
      return;
    const buffer = this.bank.get(sample.id);
    if (!buffer) throw new Error("필요한 악기 샘플이 준비되지 않았습니다.");
    const start = Math.max(this.context.currentTime, at);
    const rate = 2 ** ((midi - sample.root) / 12);
    const natural = buffer.duration / rate;
    const gate = Math.max(0.025, Math.min(duration, natural));
    const end = Math.min(start + natural, start + gate + release);
    const amplitude = level * clamp(velocity, 0, 1) ** 1.3;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(rate, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(
      amplitude,
      start + Math.min(0.003, gate / 2),
    );
    gain.gain.setValueAtTime(amplitude, start + Math.max(0.003, gate));
    gain.gain.linearRampToValueAtTime(0, start + gate + release);
    source.connect(gain);
    gain.connect(output);
    const voice = { source, gain, kind: sample.instrument };
    this.voices.add(voice);
    source.onended = () => this.remove(voice);
    // Bound polyphony even if a device delays ended callbacks during a long loop.
    if (this.voices.size > 72)
      this.remove(this.voices.values().next().value!, true);
    source.start(start);
    source.stop(Math.max(start + 0.01, end));
  }

  private remove(voice: Voice, stop = false) {
    if (!this.voices.delete(voice)) return;
    if (stop) {
      try {
        voice.source.stop(this.context.currentTime);
      } catch {
        /* already ended */
      }
    }
    voice.source.disconnect();
    voice.gain.disconnect();
    voice.source.onended = null;
  }
}
