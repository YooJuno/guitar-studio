/// <reference types="vite/client" />

/** Original-track seconds, independent of the selected playback rate. */
export interface TrackState {
  playing: boolean;
  position: number;
  duration: number;
  ended: boolean;
  pitchSupported: boolean;
  error: string | null;
}

export interface TrackOptions {
  rate: number;
  pitch: number;
  volume: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
}

export const MAX_TRACK_BYTES = 150 * 1024 * 1024;
const DEFAULT_OPTIONS: TrackOptions = {
  rate: 1,
  pitch: 0,
  volume: 0.8,
  loop: false,
  loopStart: 0,
  loopEnd: 0,
};
const finite = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

/** Keep loop endpoints ordered and inside the original file's time range. */
export function normalizeTrackOptions(
  patch: Partial<TrackOptions>,
  current: TrackOptions = DEFAULT_OPTIONS,
  duration = 0,
): TrackOptions {
  const length = Math.max(0, finite(duration, 0));
  const minimum = Math.min(0.25, length);
  let start = clamp(
    finite(patch.loopStart, current.loopStart),
    0,
    Math.max(0, length - minimum),
  );
  let end = clamp(finite(patch.loopEnd, current.loopEnd || length), 0, length);
  if (end - start < minimum) {
    if (patch.loopStart !== undefined && patch.loopEnd === undefined)
      end = Math.min(length, start + minimum);
    else start = Math.max(0, end - minimum);
  }
  return {
    rate: clamp(finite(patch.rate, current.rate), 0.5, 1.5),
    pitch: Math.round(clamp(finite(patch.pitch, current.pitch), -12, 12)),
    volume: clamp(finite(patch.volume, current.volume), 0, 1),
    loop: (patch.loop ?? current.loop) && length > 0 && end > start,
    loopStart: start,
    loopEnd: end,
  };
}

interface PitchNode extends AudioNode {
  playbackRate: AudioParam;
  pitch: AudioParam;
  pitchSemitones: AudioParam;
  port: Pick<MessagePort, "close">;
}
type PitchFactory = () => PitchNode;

/** Injectable browser boundaries let tests verify resource and cancellation behavior. */
export interface TrackEnvironment {
  createAudio: () => HTMLAudioElement;
  createContext: () => AudioContext | null;
  loadPitchFactory: (context: AudioContext) => Promise<PitchFactory | null>;
  createURL: (file: File) => string;
  revokeURL: (url: string) => void;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
  now: () => number;
  addPageHide: (callback: () => void) => void;
  removePageHide: (callback: () => void) => void;
}

const browserEnvironment: TrackEnvironment = {
  createAudio: () => new Audio(),
  createContext: () =>
    typeof AudioContext === "undefined"
      ? null
      : new AudioContext({ latencyHint: "playback" }),
  loadPitchFactory: async (context) => {
    if (
      typeof AudioWorkletNode === "undefined" ||
      !context.audioWorklet?.addModule
    )
      return null;
    // Do not import SoundTouch at module evaluation: it extends AudioWorkletNode,
    // which is absent on older browsers and in server/test environments.
    const [{ SoundTouchNode }, { default: processorURL }] = await Promise.all([
      import("@soundtouchjs/audio-worklet"),
      import("@soundtouchjs/audio-worklet/processor?url"),
    ]);
    await SoundTouchNode.register(context, processorURL);
    return () => new SoundTouchNode({ context });
  },
  createURL: (file) => URL.createObjectURL(file),
  revokeURL: (url) => URL.revokeObjectURL(url),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
  now: () => performance.now(),
  addPageHide: (callback) => {
    if (typeof window !== "undefined")
      window.addEventListener("pagehide", callback);
  },
  removePageHide: (callback) => {
    if (typeof window !== "undefined")
      window.removeEventListener("pagehide", callback);
  },
};

interface Session {
  audio: HTMLAudioElement;
  url: string;
  duration: number;
  context: AudioContext | null;
  source: MediaElementAudioSourceNode | null;
  gain: GainNode | null;
  processor: PitchNode | null;
  factory: PitchFactory | null;
  pitchSupported: boolean;
  callback: (state: TrackState) => void;
  removeEvents: (() => void)[];
  cancelMetadata: (() => void) | null;
  frame: number;
  lastEmit: number;
  playRequest: number;
  error: string | null;
  ended: boolean;
}

/** Local object-URL player. Audio data never passes through a network service. */
export class LocalTrack {
  private environment: TrackEnvironment;
  private session: Session | null = null;
  private options = { ...DEFAULT_OPTIONS };
  private generation = 0;
  private listening = false;
  private pageHide = () => this.pause();

  constructor(environment: Partial<TrackEnvironment> = {}) {
    this.environment = { ...browserEnvironment, ...environment };
  }

  async load(
    file: File,
    onState: (state: TrackState) => void,
  ): Promise<{ duration: number; name: string; pitchSupported: boolean }> {
    if (!file.size)
      throw new Error("비어 있는 음원입니다. 다른 파일을 선택해 주세요.");
    if (file.size > MAX_TRACK_BYTES)
      throw new Error("음원은 150MB 이하 파일을 선택해 주세요.");
    if (
      !file.type.startsWith("audio/") &&
      !/\.(mp3|wav|wave|m4a|aac|ogg|oga|opus|flac|aif|aiff|webm|mp4)$/i.test(
        file.name,
      )
    ) {
      throw new Error(
        "MP3, WAV 등 브라우저에서 재생할 수 있는 음원을 선택해 주세요.",
      );
    }
    this.release();
    const generation = ++this.generation;
    const audio = this.environment.createAudio();
    const url = this.environment.createURL(file);
    const session: Session = {
      audio,
      url,
      duration: 0,
      context: null,
      source: null,
      gain: null,
      processor: null,
      factory: null,
      pitchSupported: false,
      callback: onState,
      removeEvents: [],
      cancelMetadata: null,
      frame: 0,
      lastEmit: -Infinity,
      playRequest: 0,
      error: null,
      ended: false,
    };
    this.session = session;
    if (!this.listening) {
      this.environment.addPageHide(this.pageHide);
      this.listening = true;
    }
    audio.preload = "metadata";
    audio.loop = false;
    audio.volume = this.options.volume;
    audio.preservesPitch = true;
    this.emit(session, true);
    try {
      const metadata = this.metadata(session);
      audio.src = url;
      audio.load();
      await metadata;
      if (!this.current(session, generation))
        throw new DOMException("음원 선택이 변경되었습니다.", "AbortError");
      session.duration = audio.duration;
      if (!Number.isFinite(session.duration) || session.duration <= 0)
        throw new Error(
          "음원 길이를 읽지 못했습니다. 다른 형식의 파일을 선택해 주세요.",
        );
      this.options = normalizeTrackOptions(
        { loop: false, loopStart: 0, loopEnd: session.duration },
        this.options,
        session.duration,
      );
      await this.prepareGraph(session);
      if (!this.current(session, generation))
        throw new DOMException("음원 선택이 변경되었습니다.", "AbortError");
      if (!session.pitchSupported) this.options.pitch = 0;
      this.applyOptions(session);
      this.listen(session);
      this.emit(session, true);
      return {
        duration: session.duration,
        name: file.name,
        pitchSupported: session.pitchSupported,
      };
    } catch (error) {
      if (this.current(session, generation)) this.release();
      throw error;
    }
  }

  async play(): Promise<void> {
    const session = this.session;
    if (!session || !session.duration)
      throw new Error("먼저 음원을 선택해 주세요.");
    const request = ++session.playRequest;
    session.error = null;
    if (
      this.options.loop &&
      (session.audio.currentTime < this.options.loopStart ||
        session.audio.currentTime >= this.options.loopEnd)
    )
      this.seek(this.options.loopStart);
    else if (
      session.audio.ended ||
      session.audio.currentTime >= session.duration
    )
      this.seek(0);
    try {
      // Always queue resume; a previous pause() may still have a suspend pending.
      if (session.context) await session.context.resume();
      if (this.session !== session || request !== session.playRequest) return;
      await session.audio.play();
      if (this.session !== session || request !== session.playRequest) return;
      session.ended = false;
      this.startFrames(session);
      this.emit(session, true);
    } catch (error) {
      if (this.session === session && request === session.playRequest) {
        session.error =
          "음원을 재생하지 못했습니다. 지원되는 형식과 오디오 출력을 확인해 주세요.";
        this.emit(session, true);
        throw error;
      }
    }
  }

  pause(): void {
    const session = this.session;
    if (!session) return;
    session.playRequest++;
    session.audio.pause();
    this.stopFrames(session);
    if (session.context?.state !== "closed")
      void session.context?.suspend().catch(() => {});
    this.emit(session, true);
  }

  stop(): void {
    this.pause();
    this.seek(0);
  }

  seek(seconds: number): void {
    const session = this.session;
    if (!session?.duration) return;
    const position = clamp(
      finite(seconds, session.audio.currentTime),
      0,
      session.duration,
    );
    session.audio.currentTime = position;
    session.ended = false;
    this.flushProcessor(session);
    this.emit(session, true);
  }

  update(patch: Partial<TrackOptions>): void {
    const session = this.session;
    const next = normalizeTrackOptions(
      patch,
      this.options,
      session?.duration ?? 0,
    );
    if (next.pitch !== 0 && !session?.pitchSupported)
      throw new Error(
        "이 브라우저에서는 키 변경을 사용할 수 없습니다. 속도 조절만 사용할 수 있습니다.",
      );
    this.options = next;
    if (!session) return;
    this.applyOptions(session);
    if (
      next.loop &&
      !session.audio.paused &&
      (session.audio.currentTime < next.loopStart ||
        session.audio.currentTime >= next.loopEnd)
    )
      this.seek(next.loopStart);
  }

  dispose(): void {
    this.release();
    if (this.listening) this.environment.removePageHide(this.pageHide);
    this.listening = false;
  }

  private current(session: Session, generation = this.generation) {
    return this.session === session && generation === this.generation;
  }

  private metadata(session: Session): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = session.audio;
      const finish = (error?: Error) => {
        clearTimeout(timer);
        audio.removeEventListener("loadedmetadata", loaded);
        audio.removeEventListener("error", failed);
        session.cancelMetadata = null;
        if (error) reject(error);
        else resolve();
      };
      const loaded = () => finish();
      const failed = () =>
        finish(
          new Error(
            "음원을 읽지 못했습니다. 브라우저가 지원하는 MP3 또는 WAV 파일을 선택해 주세요.",
          ),
        );
      const timer = setTimeout(
        () =>
          finish(
            new Error(
              "음원 정보를 불러오지 못했습니다. 다른 파일로 다시 시도해 주세요.",
            ),
          ),
        15000,
      );
      session.cancelMetadata = () =>
        finish(new DOMException("음원 선택이 변경되었습니다.", "AbortError"));
      audio.addEventListener("loadedmetadata", loaded);
      audio.addEventListener("error", failed);
    });
  }

  private async prepareGraph(session: Session): Promise<void> {
    let context: AudioContext | null = null;
    try {
      context = this.environment.createContext();
      if (!context) return;
      session.context = context;
      // Some browsers start a context immediately after file selection. Keep
      // the DSP thread asleep until the explicit play gesture.
      await context.suspend();
      if (this.session !== session) return;
      const factory = await this.environment.loadPitchFactory(context);
      if (this.session !== session) return;
      if (!factory) {
        session.context = null;
        void context.close().catch(() => {});
        return;
      }
      // Register/create the worklet before binding the media element. A failed
      // worklet can then fall back to native audio without a silent bound source.
      const processor = factory();
      session.processor = processor;
      session.factory = factory;
      const gain = context.createGain();
      session.gain = gain;
      const source = context.createMediaElementSource(session.audio);
      session.source = source;
      source.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);
      session.pitchSupported = true;
      processor.addEventListener("processorerror", () => {
        if (session.processor === processor) this.processorFailed(session);
      });
    } catch {
      if (this.session !== session) return;
      session.processor?.disconnect();
      session.processor?.port.close();
      session.processor = null;
      session.factory = null;
      session.pitchSupported = false;
      if (session.source && session.gain && context) {
        // A bound media element cannot return to native output; bypass just DSP.
        session.source.disconnect();
        session.source.connect(session.gain);
        session.gain.disconnect();
        session.gain.connect(context.destination);
      } else {
        session.gain?.disconnect();
        session.gain = null;
        session.context = null;
        if (context?.state !== "closed") void context?.close().catch(() => {});
      }
    }
  }

  private processorFailed(session: Session) {
    if (this.session !== session) return;
    this.pause();
    session.processor?.disconnect();
    session.processor?.port.close();
    session.processor = null;
    session.factory = null;
    session.pitchSupported = false;
    this.options.pitch = 0;
    if (session.source && session.gain) {
      session.source.disconnect();
      session.source.connect(session.gain);
    }
    session.error =
      "키 변경 처리가 중단되었습니다. 속도 조절만 사용할 수 있습니다.";
    this.applyOptions(session);
    this.emit(session, true);
  }

  private applyOptions(session: Session) {
    session.audio.playbackRate = this.options.rate;
    session.audio.preservesPitch = !session.pitchSupported;
    if (session.processor) {
      session.processor.playbackRate.value = this.options.rate;
      session.processor.pitch.value = 1;
      session.processor.pitchSemitones.value = this.options.pitch;
    }
    if (session.gain) {
      session.gain.gain.value = this.options.volume;
      session.audio.volume = 1;
    } else session.audio.volume = this.options.volume;
  }

  private flushProcessor(session: Session) {
    if (!session.factory || !session.source || !session.gain) return;
    try {
      session.source.disconnect();
      session.processor?.disconnect();
      session.processor?.port.close();
      const processor = session.factory();
      session.processor = processor;
      processor.addEventListener("processorerror", () => {
        if (session.processor === processor) this.processorFailed(session);
      });
      session.source.connect(processor);
      processor.connect(session.gain);
      this.applyOptions(session);
    } catch {
      this.processorFailed(session);
    }
  }

  private listen(session: Session) {
    const on = (event: string, callback: () => void) => {
      session.audio.addEventListener(event, callback);
      session.removeEvents.push(() =>
        session.audio.removeEventListener(event, callback),
      );
    };
    on("play", () => {
      session.ended = false;
      this.startFrames(session);
      this.emit(session, true);
    });
    on("pause", () => {
      this.stopFrames(session);
      this.emit(session, true);
    });
    on("timeupdate", () => this.tick(session));
    on("seeked", () => this.emit(session, true));
    on("ended", () => {
      if (this.session !== session) return;
      if (this.options.loop) {
        this.seek(this.options.loopStart);
        void this.play().catch(() => {});
      } else {
        session.ended = true;
        this.stopFrames(session);
        if (session.context?.state !== "closed")
          void session.context?.suspend().catch(() => {});
        this.emit(session, true);
      }
    });
    on("error", () => {
      if (this.session !== session) return;
      this.pause();
      session.error =
        "음원을 읽거나 재생하지 못했습니다. 다른 형식의 파일을 선택해 주세요.";
      this.emit(session, true);
    });
  }

  private tick(session: Session) {
    if (this.session !== session) return;
    if (
      !session.audio.paused &&
      this.options.loop &&
      session.audio.currentTime >= this.options.loopEnd
    )
      this.seek(this.options.loopStart);
    this.emit(session);
  }

  private startFrames(session: Session) {
    if (session.frame || this.session !== session) return;
    const frame = () => {
      session.frame = 0;
      if (
        this.session !== session ||
        session.audio.paused ||
        session.audio.ended
      )
        return;
      this.tick(session);
      if (this.session === session && !session.audio.paused)
        session.frame = this.environment.requestFrame(frame);
    };
    session.frame = this.environment.requestFrame(frame);
  }

  private stopFrames(session: Session) {
    if (session.frame) this.environment.cancelFrame(session.frame);
    session.frame = 0;
  }

  private emit(session: Session, force = false) {
    if (this.session !== session) return;
    const now = this.environment.now();
    if (!force && now - session.lastEmit < 100) return;
    session.lastEmit = now;
    session.callback({
      playing: !session.audio.paused && !session.audio.ended,
      position: clamp(
        finite(session.audio.currentTime, 0),
        0,
        session.duration,
      ),
      duration: session.duration,
      ended: session.ended,
      pitchSupported: session.pitchSupported,
      error: session.error,
    });
  }

  private release() {
    this.generation++;
    const session = this.session;
    this.session = null;
    if (!session) return;
    session.playRequest++;
    session.cancelMetadata?.();
    session.removeEvents.forEach((remove) => remove());
    this.stopFrames(session);
    session.audio.pause();
    session.audio.removeAttribute("src");
    session.audio.load();
    session.source?.disconnect();
    session.processor?.disconnect();
    session.processor?.port.close();
    session.gain?.disconnect();
    if (session.context?.state !== "closed")
      void session.context?.close().catch(() => {});
    this.environment.revokeURL(session.url);
  }
}
