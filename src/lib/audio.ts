import { claimAudioSession } from "./audio-session";

export interface AudioFrame {
  samples: Float32Array;
  sampleRate: number;
  level: number;
  peak: number;
  clipped: boolean;
}

/** Local microphone capture; stop() immediately releases every microphone track. */
export class TunerAudio {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private animation = 0;
  private generation = 0;
  private releaseSession: (() => void) | null = null;

  async start(
    onFrame: (frame: AudioFrame) => void,
    deviceId?: string,
    channel: "mix" | "left" | "right" = "mix",
  ): Promise<void> {
    this.stop();
    const generation = this.generation;
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "이 브라우저에서 마이크를 사용할 수 없습니다. HTTPS 또는 localhost에서 열어 주세요.",
      );
    this.releaseSession = claimAudioSession("capture");
    try {
      const context = new AudioContext({ latencyHint: "interactive" });
      this.context = context;
      // Resume inside the initiating user gesture, before a permission dialog.
      await context.resume();
      if (generation !== this.generation) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: 2 },
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
        video: false,
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        if (context.state !== "closed") await context.close();
        return;
      }
      this.stream = stream;
      if (context.state !== "running") await context.resume();
      if (generation !== this.generation) return;
      if (context.state !== "running")
        throw new Error("오디오 입력이 중단됐습니다. 다시 시작해 주세요.");
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 32768;
      analyser.smoothingTimeConstant = 0;
      if (channel === "mix") {
        source.connect(analyser);
      } else {
        const splitter = context.createChannelSplitter(2);
        source.connect(splitter);
        const channels = stream.getAudioTracks()[0]?.getSettings().channelCount;
        splitter.connect(
          analyser,
          channel === "right" && channels !== 1 ? 1 : 0,
        );
        this.splitter = splitter;
      }
      // Deliberately no connection to destination: no microphone feedback.
      this.source = source;
      this.analyser = analyser;
      const samples = new Float32Array(analyser.fftSize);
      let last = 0;
      const tick = (time: number) => {
        if (generation !== this.generation || context.state === "closed")
          return;
        this.animation = requestAnimationFrame(tick);
        if (time - last < 80) return;
        last = time;
        if (context.state !== "running") {
          // A suspended analyser may retain its last periodic waveform. Emit
          // loss, not fresh pitch evidence, while preserving the live capture.
          samples.fill(0);
          onFrame({
            samples,
            sampleRate: context.sampleRate,
            level: 0,
            peak: 0,
            clipped: false,
          });
          return;
        }
        analyser.getFloatTimeDomainData(samples);
        let energy = 0;
        let peak = 0;
        // Use recent samples for an input meter that responds faster than FFT.
        for (let i = samples.length - 2048; i < samples.length; i++) {
          energy += samples[i] * samples[i];
          peak = Math.max(peak, Math.abs(samples[i]));
        }
        onFrame({
          samples,
          sampleRate: context.sampleRate,
          level: Math.sqrt(energy / 2048),
          peak,
          clipped: peak >= 0.985,
        });
      };
      this.animation = requestAnimationFrame(tick);
    } catch (error) {
      if (generation === this.generation) this.stop();
      throw error;
    }
  }

  stop(): void {
    this.generation++;
    if (this.animation) cancelAnimationFrame(this.animation);
    this.animation = 0;
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.splitter?.disconnect();
    this.splitter = null;
    this.source = null;
    this.analyser = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.releaseSession?.();
    this.releaseSession = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed")
      void context.close().catch(() => undefined);
  }
}

let referenceRequest: { cancel: () => void } | null = null;

/** Play a short, gently enveloped local reference tone after a user gesture. */
export async function playReference(
  frequency: number,
  duration = 1.2,
): Promise<void> {
  if (!Number.isFinite(frequency) || frequency < 20 || frequency > 5000) return;
  const releaseSession = claimAudioSession("playback");
  const seconds = Math.max(
    0.15,
    Math.min(5, Number.isFinite(duration) ? duration : 1.2),
  );
  let context: AudioContext | null = null;
  let gain: GainNode | null = null;
  const voices = new Set<{ oscillator: OscillatorNode; partial: GainNode }>();
  let disposed = false;
  let startupError: Error | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelResume!: () => void;
  const cancelled = new Promise<false>((resolve) => {
    cancelResume = () => resolve(false);
  });
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    cancelResume();
    for (const voice of voices) {
      voice.oscillator.onended = null;
      try {
        voice.oscillator.stop();
      } catch {
        /* Already ended or not started. */
      }
      voice.oscillator.disconnect();
      voice.partial.disconnect();
    }
    voices.clear();
    gain?.disconnect();
    releaseSession();
    if (referenceRequest === request) referenceRequest = null;
    if (context && context.state !== "closed")
      void context.close().catch(() => undefined);
  };
  const request = { cancel: cleanup };
  const previous = referenceRequest;
  referenceRequest = request;
  previous?.cancel();
  // A blocked resume has no audio clock; cancellation and expiry must still settle.
  timer = setTimeout(() => {
    startupError = new Error(
      "기준음을 시작하지 못했습니다. 다시 재생해 주세요.",
    );
    cleanup();
  }, 4000);
  try {
    context = new AudioContext();
    const resumed = await Promise.race([
      context.resume().then(() => true),
      cancelled,
    ]);
    if (!resumed || disposed || referenceRequest !== request) {
      if (startupError) throw startupError;
      return;
    }
    if (context.state !== "running")
      throw new Error("기준음 출력이 중단됐습니다. 다시 재생해 주세요.");
    if (timer !== null) clearTimeout(timer);
    // Wall-clock cleanup also releases the lease when interruption freezes onended.
    timer = setTimeout(cleanup, seconds * 1000 + 250);
    gain = context.createGain();
    gain.connect(context.destination);
    const now = context.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    for (const [harmonic, amplitude] of [
      [1, 1],
      [2, 0.22],
      [3, 0.08],
    ]) {
      const oscillator = context.createOscillator();
      const partial = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency * harmonic;
      partial.gain.value = amplitude;
      oscillator.connect(partial);
      partial.connect(gain);
      const voice = { oscillator, partial };
      voices.add(voice);
      oscillator.onended = () => {
        if (disposed || !voices.delete(voice)) return;
        oscillator.disconnect();
        partial.disconnect();
        if (!voices.size) cleanup();
      };
      oscillator.start(now);
      oscillator.stop(now + seconds + 0.05);
    }
  } catch (error) {
    const obsolete = disposed && !startupError;
    cleanup();
    if (obsolete) return;
    throw error;
  }
}
