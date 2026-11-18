import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { TunerAudio, playReference } from "../src/lib/audio.ts";
import { claimAudioSession } from "../src/lib/audio-session.ts";

class Param {
  value = 0;
  setValueAtTime(value: number) {
    this.value = value;
  }
  linearRampToValueAtTime(value: number) {
    this.value = value;
  }
  exponentialRampToValueAtTime(value: number) {
    this.value = value;
  }
}
class Node {
  connections: unknown[] = [];
  disconnected = false;
  connect(node: unknown) {
    this.connections.push(node);
    return node;
  }
  disconnect() {
    this.disconnected = true;
    this.connections = [];
  }
}
class Gain extends Node {
  gain = new Param();
}
class Oscillator extends Node {
  frequency = new Param();
  type = "";
  onended: (() => void) | null = null;
  started = false;
  stops: number[] = [];
  start() {
    this.started = true;
  }
  stop(at = 0) {
    this.stops.push(at);
  }
  end() {
    this.onended?.();
  }
}
class Analyser extends Node {
  fftSize = 0;
  smoothingTimeConstant = 0;
  reads = 0;
  getFloatTimeDomainData(samples: Float32Array) {
    this.reads++;
    samples.forEach((_, i) => {
      samples[i] = 0.2 * Math.sin((2 * Math.PI * 110 * i) / 48000);
    });
  }
}
class Context {
  state = "suspended";
  sampleRate = 48000;
  currentTime = 0;
  destination = new Node();
  gains: Gain[] = [];
  oscillators: Oscillator[] = [];
  source = new Node();
  analyser = new Analyser();
  splitter = new Node();
  resumeCalls = 0;
  resumeAction: (() => Promise<void>) | null = null;
  resume() {
    this.resumeCalls++;
    if (this.resumeAction) return this.resumeAction();
    this.state = "running";
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
  createGain() {
    const gain = new Gain();
    this.gains.push(gain);
    return gain;
  }
  createOscillator() {
    const osc = new Oscillator();
    this.oscillators.push(osc);
    return osc;
  }
  createMediaStreamSource() {
    return this.source;
  }
  createAnalyser() {
    return this.analyser;
  }
  createChannelSplitter() {
    return this.splitter;
  }
}
function stream() {
  const track = {
    stopped: false,
    stop() {
      this.stopped = true;
    },
    getSettings() {
      return { channelCount: 1 };
    },
  };
  return { track, getTracks: () => [track], getAudioTracks: () => [track] };
}
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function fixture(
  t: TestContext,
  configure?: (context: Context, index: number) => void,
) {
  const keys = [
    "navigator",
    "AudioContext",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "setTimeout",
    "clearTimeout",
  ];
  const previous = new Map(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const audioSession = { type: "ambient" };
  const contexts: Context[] = [];
  const frames = new Map<number, (time: number) => void>();
  const timers = new Map<number, { at: number; callback: () => void }>();
  let id = 0,
    now = 0;
  const media = { getUserMedia: async () => stream() };
  const define = (key: string, value: unknown) =>
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  define("navigator", { audioSession, mediaDevices: media });
  define(
    "AudioContext",
    class extends Context {
      constructor() {
        super();
        contexts.push(this);
        configure?.(this, contexts.length - 1);
      }
    },
  );
  define("requestAnimationFrame", (callback: (time: number) => void) => {
    frames.set(++id, callback);
    return id;
  });
  define("cancelAnimationFrame", (token: number) => frames.delete(token));
  define("setTimeout", (callback: () => void, delay: number) => {
    timers.set(++id, { at: now + delay, callback });
    return id;
  });
  define("clearTimeout", (token: number) => timers.delete(token));
  const advance = (milliseconds: number) => {
    const until = now + milliseconds;
    for (let guard = 0; guard < 1000; guard++) {
      const next = [...timers.entries()]
        .filter(([, task]) => task.at <= until)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = until;
  };
  t.after(() => {
    advance(20000);
    contexts.forEach((context) => context.close());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return {
    audioSession,
    contexts,
    frames,
    timers,
    media,
    advance,
    frame(time: number) {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(time));
    },
  };
}

test("a hidden tuner stops reading samples but keeps its input open", async (t) => {
  const env = fixture(t);
  const mic = stream();
  env.media.getUserMedia = async () => mic;
  const tuner = new TunerAudio();
  t.after(() => tuner.stop());
  let readings = 0;

  tuner.setMonitoring(false);
  await tuner.start(() => readings++);
  assert.equal(env.frames.size, 0);
  assert.equal(mic.track.stopped, false);
  assert.equal(env.audioSession.type, "play-and-record");

  tuner.setMonitoring(true);
  env.frame(100);
  assert.equal(readings, 1);
  tuner.setMonitoring(false);
  assert.equal(env.frames.size, 0);
  env.frame(200);
  assert.equal(readings, 1);
  assert.equal(mic.track.stopped, false);

  tuner.setMonitoring(true);
  env.frame(300);
  assert.equal(readings, 2);
  assert.equal(env.contexts.length, 1);
  tuner.stop();
  assert.equal(env.frames.size, 0);
  assert.equal(mic.track.stopped, true);
});

test("interrupted tuner emits loss frames, preserves live capture, then resumes fresh samples", async (t) => {
  const env = fixture(t);
  const mic = stream();
  env.media.getUserMedia = async () => mic;
  const tuner = new TunerAudio();
  t.after(() => tuner.stop());
  const readings: Array<{
    level: number;
    peak: number;
    clipped: boolean;
    samples: Float32Array;
  }> = [];
  await tuner.start((frame) =>
    readings.push({ ...frame, samples: frame.samples.slice() }),
  );
  const context = env.contexts[0];
  env.frame(100);
  assert.ok(readings[0].level > 0.1);
  context.state = "interrupted";
  env.frame(200);
  env.frame(300);
  assert.equal(
    context.analyser.reads,
    1,
    "frozen analyser must not be read as new evidence",
  );
  assert.ok(
    readings
      .slice(1)
      .every(
        (frame) =>
          frame.level === 0 &&
          frame.peak === 0 &&
          !frame.clipped &&
          frame.samples.every((value) => value === 0),
      ),
  );
  assert.equal(mic.track.stopped, false);
  assert.equal(env.audioSession.type, "play-and-record");
  const releasePlayback = claimAudioSession("playback");
  releasePlayback();
  assert.equal(env.audioSession.type, "play-and-record");
  context.state = "running";
  env.frame(400);
  assert.ok(readings.at(-1)!.level > 0.1);
  tuner.stop();
  assert.equal(mic.track.stopped, true);
  assert.equal(env.audioSession.type, "ambient");
  assert.equal(env.frames.size, 0);
});

test("post-permission resume must actually run before tuner start succeeds", async (t) => {
  const env = fixture(t, (context) => {
    context.resumeAction = async () => {
      if (context.resumeCalls === 1) context.state = "running";
    };
  });
  const mic = stream();
  env.media.getUserMedia = async () => {
    env.contexts[0].state = "interrupted";
    return mic;
  };
  const tuner = new TunerAudio();
  await assert.rejects(
    tuner.start(() => assert.fail("no frame before running")),
    /중단/,
  );
  assert.equal(env.contexts[0].resumeCalls, 2);
  assert.equal(env.contexts[0].state, "closed");
  assert.equal(mic.track.stopped, true);
  assert.equal(env.audioSession.type, "ambient");
  assert.equal(env.frames.size, 0);
});

test("cancelling a pending permission request stops its late stream without reclaiming capture", async (t) => {
  const env = fixture(t);
  const mic = stream();
  let allow!: (value: ReturnType<typeof stream>) => void;
  env.media.getUserMedia = () =>
    new Promise((resolve) => {
      allow = resolve;
    });
  const tuner = new TunerAudio();
  const starting = tuner.start(() => assert.fail("cancelled capture frame"));
  await flush();
  tuner.stop();
  assert.equal(env.audioSession.type, "ambient");
  allow(mic);
  await starting;
  assert.equal(mic.track.stopped, true);
  assert.equal(env.frames.size, 0);
  assert.equal(env.contexts[0].state, "closed");
});

test("cancelling post-permission resume cannot stop the replacement capture", async (t) => {
  let finishResume!: () => void;
  const env = fixture(t, (context, index) => {
    if (index === 0)
      context.resumeAction = () => {
        if (context.resumeCalls === 1) {
          context.state = "running";
          return Promise.resolve();
        }
        return new Promise((resolve) => {
          finishResume = resolve;
        });
      };
  });
  const first = stream(),
    second = stream();
  let requests = 0;
  env.media.getUserMedia = async () => {
    if (requests++ === 0) {
      env.contexts[0].state = "interrupted";
      return first;
    }
    return second;
  };
  const tuner = new TunerAudio();
  const stale = tuner.start(() => assert.fail("old capture emitted a frame"));
  await flush();
  tuner.stop();
  let frames = 0;
  await tuner.start(() => frames++);
  finishResume();
  await stale;
  env.frame(100);
  assert.equal(frames, 1);
  assert.equal(first.track.stopped, true);
  assert.equal(second.track.stopped, false);
  assert.equal(env.audioSession.type, "play-and-record");
  tuner.stop();
  assert.equal(second.track.stopped, true);
  assert.equal(env.audioSession.type, "ambient");
});

test("a replacement reference settles an obsolete pending resume and ignores its late completion", async (t) => {
  let oldResume!: () => void;
  const env = fixture(t, (context, index) => {
    if (index === 0)
      context.resumeAction = () =>
        new Promise((resolve) => {
          oldResume = resolve;
        });
  });
  const stale = playReference(440);
  const current = playReference(220);
  await stale;
  await current;
  assert.equal(env.contexts[0].state, "closed");
  assert.equal(env.contexts[0].oscillators.length, 0);
  assert.equal(env.contexts[1].oscillators.length, 3);
  oldResume();
  await flush();
  assert.equal(env.contexts[0].oscillators.length, 0);
  assert.equal(env.audioSession.type, "playback");
  env.contexts[1].oscillators.forEach((voice) => voice.end());
  assert.equal(env.audioSession.type, "ambient");
  assert.equal(env.contexts[1].state, "closed");
  assert.equal(env.timers.size, 0);
});

test("reference wall-clock expiry releases every voice and lease even with a frozen audio clock", async (t) => {
  const env = fixture(t);
  const releaseCapture = claimAudioSession("capture");
  await playReference(110, 0.5);
  const context = env.contexts[0];
  context.state = "interrupted";
  assert.equal(env.audioSession.type, "play-and-record");
  env.advance(800);
  assert.equal(context.state, "closed");
  assert.ok(
    context.oscillators.every(
      (voice) =>
        voice.disconnected &&
        voice.onended === null &&
        voice.stops.length === 2,
    ),
  );
  assert.ok(context.gains.every((gain) => gain.disconnected));
  assert.equal(
    env.audioSession.type,
    "play-and-record",
    "reference cleanup must not release capture",
  );
  releaseCapture();
  assert.equal(env.audioSession.type, "ambient");
  assert.equal(env.timers.size, 0);
});

test("old reference ended callbacks cannot release or disconnect the replacement sound", async (t) => {
  const env = fixture(t);
  await playReference(440);
  const old = env.contexts[0];
  const lateCallbacks = old.oscillators.map((voice) => voice.onended!);
  await playReference(330);
  const current = env.contexts[1];
  lateCallbacks.forEach((callback) => callback());
  assert.equal(old.state, "closed");
  assert.ok(old.oscillators.every((voice) => voice.disconnected));
  assert.equal(current.state, "running");
  assert.ok(current.oscillators.every((voice) => !voice.disconnected));
  assert.equal(env.audioSession.type, "playback");
  current.oscillators.forEach((voice) => voice.end());
  assert.equal(env.audioSession.type, "ambient");
  assert.equal(env.timers.size, 0);
});

test("blocked reference resume expires and late completion cannot restart output", async (t) => {
  let resume!: () => void;
  const env = fixture(t, (context) => {
    context.resumeAction = () =>
      new Promise((resolve) => {
        resume = resolve;
      });
  });
  const result = playReference(440);
  const rejection = assert.rejects(result, /기준음을 시작하지 못했습니다/);
  env.advance(4100);
  await rejection;
  assert.equal(env.audioSession.type, "ambient");
  assert.equal(env.contexts[0].state, "closed");
  resume();
  await flush();
  assert.equal(env.contexts[0].oscillators.length, 0);
  assert.equal(env.timers.size, 0);
});

test("reference creation errors restore the audio category without dangling timers", async (t) => {
  const env = fixture(t, (_context, index) => {
    if (index === 0) throw new Error("context unavailable");
  });
  await assert.rejects(playReference(440), /context unavailable/);
  assert.equal(env.audioSession.type, "ambient");
  assert.equal(env.timers.size, 0);
  // The second request acquires a new lease and can succeed after the first failure.
  await playReference(440);
  env.contexts[1].oscillators.forEach((voice) => voice.end());
  assert.equal(env.audioSession.type, "ambient");
  assert.equal(env.timers.size, 0);
});

test("reference rejected or ineffective resume cannot report successful silent playback", async (t) => {
  const env = fixture(t, (context, index) => {
    context.resumeAction =
      index === 0
        ? () => Promise.reject(new Error("resume denied"))
        : async () => {};
  });
  await assert.rejects(playReference(440), /resume denied/);
  assert.equal(env.audioSession.type, "ambient");
  await assert.rejects(playReference(440), /출력이 중단/);
  assert.ok(
    env.contexts.every(
      (context) =>
        context.state === "closed" && context.oscillators.length === 0,
    ),
  );
  assert.equal(env.audioSession.type, "ambient");
  assert.equal(env.timers.size, 0);
});
