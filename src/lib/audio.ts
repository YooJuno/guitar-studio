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
    const context = new AudioContext({ latencyHint: "interactive" });
    this.context = context;
    try {
      // Resume inside the initiating user gesture, before a permission dialog.
      await context.resume();
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
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed")
      void context.close().catch(() => undefined);
  }
}

let referenceContext: AudioContext | null = null;
let referenceOscillators: OscillatorNode[] = [];

/** Play a short, gently enveloped local reference tone after a user gesture. */
export async function playReference(
  frequency: number,
  duration = 1.2,
): Promise<void> {
  if (!Number.isFinite(frequency) || frequency < 20 || frequency > 5000) return;
  if (!referenceContext || referenceContext.state === "closed")
    referenceContext = new AudioContext();
  const context = referenceContext;
  await context.resume();
  referenceOscillators.forEach((oscillator) => {
    try {
      oscillator.stop();
    } catch {
      /* already ended */
    }
  });
  referenceOscillators = [];
  const gain = context.createGain();
  gain.connect(context.destination);
  const now = context.currentTime;
  const seconds = Math.max(0.15, Math.min(5, duration));
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
  let pending = 3;
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
    oscillator.onended = () => {
      oscillator.disconnect();
      partial.disconnect();
      referenceOscillators = referenceOscillators.filter(
        (item) => item !== oscillator,
      );
      if (--pending === 0) gain.disconnect();
    };
    oscillator.start(now);
    oscillator.stop(now + seconds + 0.05);
    referenceOscillators.push(oscillator);
  }
}
