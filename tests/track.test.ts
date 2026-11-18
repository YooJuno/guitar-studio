import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LocalTrack,
  MAX_TRACK_BYTES,
  normalizeTrackOptions,
} from "../src/lib/track.ts";
import type { TrackEnvironment, TrackState } from "../src/lib/track.ts";
import { claimAudioSession } from "../src/lib/audio-session.ts";

class FakeAudio extends EventTarget {
  duration = 120;
  currentTime = 0;
  paused = true;
  ended = false;
  src = "";
  preload = "";
  loop = false;
  volume = 1;
  playbackRate = 1;
  preservesPitch = true;
  metadataAutomatically = true;
  plays = 0;
  pauses = 0;
  cleared = 0;
  load() {
    if (this.src && this.metadataAutomatically)
      queueMicrotask(() => this.dispatchEvent(new Event("loadedmetadata")));
  }
  async play() {
    this.plays++;
    this.paused = false;
    this.ended = false;
    this.dispatchEvent(new Event("play"));
  }
  pause() {
    this.pauses++;
    const changed = !this.paused;
    this.paused = true;
    if (changed) this.dispatchEvent(new Event("pause"));
  }
  removeAttribute(name: string) {
    if (name === "src") {
      this.src = "";
      this.cleared++;
    }
  }
}
class FakeNode extends EventTarget {
  connections: unknown[] = [];
  disconnects = 0;
  closed = false;
  playbackRate = { value: 1 };
  pitch = { value: 1 };
  pitchSemitones = { value: 0 };
  gain = { value: 1 };
  port = {
    close: () => {
      this.closed = true;
    },
  };
  connect(node: unknown) {
    this.connections.push(node);
    return node;
  }
  disconnect() {
    this.disconnects++;
    this.connections = [];
  }
}
class FakeContext {
  state = "suspended";
  resumes = 0;
  suspends = 0;
  closes = 0;
  destination = new FakeNode();
  source = new FakeNode();
  gain = new FakeNode();
  createGain() {
    return this.gain;
  }
  createMediaElementSource() {
    return this.source;
  }
  async resume() {
    this.resumes++;
    this.state = "running";
  }
  async suspend() {
    this.suspends++;
    this.state = "suspended";
  }
  async close() {
    this.closes++;
    this.state = "closed";
  }
}
function harness({ support = true, metadata = true, fail = false } = {}) {
  const audios: FakeAudio[] = [];
  const contexts: FakeContext[] = [];
  const processors: FakeNode[] = [];
  const urls: string[] = [];
  const revoked: string[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  let now = 0;
  let pageHide: (() => void) | null = null;
  const environment: TrackEnvironment = {
    createAudio: () => {
      const audio = new FakeAudio();
      audio.metadataAutomatically = metadata;
      audios.push(audio);
      return audio as unknown as HTMLAudioElement;
    },
    createContext: () => {
      const context = new FakeContext();
      contexts.push(context);
      return context as unknown as AudioContext;
    },
    loadPitchFactory: async () => {
      if (fail) throw new Error("worklet network error");
      if (!support) return null;
      return () => {
        const node = new FakeNode();
        processors.push(node);
        return node as never;
      };
    },
    createURL: (file) => {
      const url = `blob:test/${file.name}/${urls.length}`;
      urls.push(url);
      return url;
    },
    revokeURL: (url) => {
      revoked.push(url);
    },
    requestFrame: (callback) => {
      const token = ++id;
      frames.set(token, callback);
      return token;
    },
    cancelFrame: (token) => {
      frames.delete(token);
    },
    now: () => now,
    addPageHide: (callback) => {
      pageHide = callback;
    },
    removePageHide: (callback) => {
      if (pageHide === callback) pageHide = null;
    },
  };
  return {
    player: new LocalTrack(environment),
    environment,
    audios,
    contexts,
    processors,
    urls,
    revoked,
    frames,
    frame(time: number) {
      now = time;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(time));
    },
    hide() {
      pageHide?.();
    },
    hasPageListener: () => !!pageHide,
  };
}
const file = (name = "take.mp3") =>
  new File(["local audio"], name, { type: "audio/mpeg" });

test("track option bounds preserve finite rates and valid A-B ranges", () => {
  const defaults = normalizeTrackOptions({}, undefined, 100);
  assert.deepEqual(defaults, {
    rate: 1,
    pitch: 0,
    volume: 0.8,
    loop: false,
    loopStart: 0,
    loopEnd: 100,
  });
  const limits = normalizeTrackOptions(
    { rate: 4, pitch: -30, volume: -1, loop: true, loopStart: 110 },
    defaults,
    100,
  );
  assert.equal(limits.rate, 1.5);
  assert.equal(limits.pitch, -12);
  assert.equal(limits.volume, 0);
  assert.equal(limits.loopStart, 99.75);
  assert.equal(limits.loopEnd, 100);
  assert.equal(limits.loop, true);
  const earlierB = normalizeTrackOptions(
    { loopEnd: 20 },
    { ...defaults, loopStart: 30 },
    100,
  );
  assert.equal(earlierB.loopStart, 19.75);
  assert.equal(earlierB.loopEnd, 20);
  assert.equal(
    normalizeTrackOptions({ rate: NaN, pitch: Infinity }, defaults, 100).rate,
    1,
  );
  assert.equal(normalizeTrackOptions({ loop: true }, defaults, 0).loop, false);
});

test("local streaming mirrors source rate while pitch stays independent and UI frames are throttled", async () => {
  const h = harness();
  const states: TrackState[] = [];
  const metadata = await h.player.load(file(), (state) => states.push(state));
  assert.deepEqual(metadata, {
    name: "take.mp3",
    duration: 120,
    pitchSupported: true,
  });
  h.player.update({ rate: 0.75, pitch: 3, volume: 0.4 });
  assert.equal(h.audios[0].playbackRate, 0.75);
  assert.equal(h.audios[0].preservesPitch, false);
  assert.equal(h.processors[0].playbackRate.value, 0.75);
  assert.equal(h.processors[0].pitchSemitones.value, 3);
  assert.equal(h.processors[0].pitch.value, 1);
  assert.equal(h.contexts[0].gain.gain.value, 0.4);
  await h.player.play();
  const startCount = states.length;
  for (let i = 1; i <= 60; i++) {
    h.audios[0].currentTime = i * 0.125;
    h.frame((i * 1000) / 60);
  }
  assert.ok(
    states.length - startCount <= 10,
    "animation callbacks must not cause React renders at 60fps",
  );
  assert.equal(
    states.at(-1)?.position,
    7.5,
    "position comes from native media clock, not wall-time increments",
  );
  assert.equal(states.at(-1)?.playing, true);
  h.player.dispose();
});

test("A-B looping seeks on the native clock, flushes DSP, and preserves settings", async () => {
  const h = harness();
  const states: TrackState[] = [];
  await h.player.load(file(), (state) => states.push(state));
  h.player.update({
    rate: 1.2,
    pitch: -2,
    loop: true,
    loopStart: 30,
    loopEnd: 35,
  });
  await h.player.play();
  assert.equal(h.audios[0].currentTime, 30);
  h.audios[0].currentTime = 35.3;
  h.frame(100);
  assert.equal(h.audios[0].currentTime, 30);
  assert.ok(
    h.processors[0].closed,
    "previous worklet port must close when flushing its buffered samples",
  );
  assert.equal(h.processors.at(-1)?.pitchSemitones.value, -2);
  assert.equal(h.processors.at(-1)?.playbackRate.value, 1.2);
  h.processors[0].dispatchEvent(new Event("processorerror"));
  assert.equal(
    states.at(-1)?.pitchSupported,
    true,
    "late errors from a replaced processor cannot disable the new one",
  );
  h.player.update({ loop: false });
  h.player.seek(88);
  assert.equal(states.at(-1)?.position, 88);
  h.player.pause();
  assert.equal(h.frames.size, 0);
  assert.equal(states.at(-1)?.playing, false);
  h.player.stop();
  assert.equal(h.audios[0].currentTime, 0);
  h.player.dispose();
});

test("unsupported or failed worklet keeps tempo-only audio and rejects an unimplemented key shift", async () => {
  for (const options of [{ support: false }, { fail: true }]) {
    const h = harness(options);
    const states: TrackState[] = [];
    const result = await h.player.load(file(), (state) => states.push(state));
    assert.equal(result.pitchSupported, false);
    assert.equal(h.audios[0].preservesPitch, true);
    h.player.update({ rate: 0.5, volume: 0.25 });
    assert.equal(h.audios[0].playbackRate, 0.5);
    assert.equal(h.audios[0].volume, 0.25);
    assert.throws(() => h.player.update({ pitch: 2 }), /키 변경/);
    await h.player.play();
    assert.equal(states.at(-1)?.playing, true);
    h.player.dispose();
    assert.equal(h.contexts[0].state, "closed");
  }
});

test("superseded loading and disposal revoke URLs and never activate stale files", async () => {
  const h = harness({ metadata: false });
  const oldStates: TrackState[] = [];
  const newStates: TrackState[] = [];
  const first = h.player.load(file("first.mp3"), (state) =>
    oldStates.push(state),
  );
  const rejected = assert.rejects(first, { name: "AbortError" });
  const second = h.player.load(file("second.mp3"), (state) =>
    newStates.push(state),
  );
  h.audios[0].dispatchEvent(new Event("loadedmetadata"));
  h.audios[1].dispatchEvent(new Event("loadedmetadata"));
  await rejected;
  await second;
  assert.deepEqual(h.revoked, [h.urls[0]]);
  assert.equal(oldStates.length, 1);
  await h.player.play();
  h.hide();
  assert.equal(h.audios[1].paused, true);
  assert.equal(h.contexts[0].state, "suspended");
  h.player.dispose();
  assert.deepEqual(h.revoked, h.urls);
  assert.equal(h.hasPageListener(), false);
  assert.equal(h.contexts[0].state, "closed");
  assert.ok(h.processors.every((node) => node.closed));
  assert.equal(h.audios[1].src, "");
  assert.equal(h.frames.size, 0);
});

test("runtime DSP failure pauses audio rather than silently continuing in the wrong key", async () => {
  const h = harness();
  const states: TrackState[] = [];
  await h.player.load(file(), (state) => states.push(state));
  h.player.update({ pitch: 5 });
  await h.player.play();
  h.processors[0].dispatchEvent(new Event("processorerror"));
  assert.equal(h.audios[0].paused, true);
  assert.equal(states.at(-1)?.pitchSupported, false);
  assert.match(states.at(-1)?.error ?? "", /키 변경/);
  assert.equal(h.audios[0].preservesPitch, true);
  assert.throws(() => h.player.update({ pitch: 1 }), /키 변경/);
  h.player.dispose();
});

test("disposing during async worklet registration cannot bind or reactivate a stale file", async () => {
  const h = harness();
  let finish!: () => void;
  let factories = 0;
  const registration = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const player = new LocalTrack({
    ...h.environment,
    loadPitchFactory: async () => {
      await registration;
      return () => {
        factories++;
        return new FakeNode() as never;
      };
    },
  });
  const loading = player.load(file(), () => {});
  const rejected = assert.rejects(loading, { name: "AbortError" });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(h.contexts.length, 1);
  player.dispose();
  finish();
  await rejected;
  assert.equal(factories, 0);
  assert.equal(h.contexts[0].state, "closed");
  assert.deepEqual(h.revoked, h.urls);
  assert.equal(h.frames.size, 0);
});

test("file limits and decoding errors do not leak a selected file", async () => {
  const h = harness({ metadata: false });
  await assert.rejects(
    h.player.load(
      {
        name: "huge.wav",
        type: "audio/wav",
        size: MAX_TRACK_BYTES + 1,
      } as File,
      () => {},
    ),
    /150MB/,
  );
  assert.equal(h.urls.length, 0);
  const load = h.player.load(file(), () => {});
  const rejected = assert.rejects(load, /음원을 읽지/);
  h.audios[0].dispatchEvent(new Event("error"));
  await rejected;
  assert.deepEqual(h.revoked, h.urls);
  h.player.dispose();
});

test("track playback leases survive capture and release on pause, end, replacement and error", async () => {
  const navigator = globalThis.navigator;
  const previous = Object.getOwnPropertyDescriptor(navigator, "audioSession");
  const session = { type: "auto" };
  Object.defineProperty(navigator, "audioSession", {
    configurable: true,
    value: session,
  });
  const h = harness();
  let releaseCapture: (() => void) | null = null;
  try {
    await h.player.load(file(), () => {});
    releaseCapture = claimAudioSession("capture");
    await h.player.play();
    assert.equal(session.type, "play-and-record");
    releaseCapture();
    releaseCapture = null;
    assert.equal(
      session.type,
      "playback",
      "the local track keeps its own playback lease",
    );
    h.player.pause();
    assert.equal(session.type, "auto");
    await h.player.play();
    assert.equal(session.type, "playback");
    h.audios[0].paused = true;
    h.audios[0].ended = true;
    h.audios[0].dispatchEvent(new Event("ended"));
    assert.equal(session.type, "auto", "natural end releases music intent");
    await h.player.play();
    await h.player.load(file("next.mp3"), () => {});
    assert.equal(
      session.type,
      "auto",
      "replacing a playing file releases old intent",
    );
    await h.player.play();
    h.processors.at(-1)!.dispatchEvent(new Event("processorerror"));
    assert.equal(session.type, "auto", "DSP failure releases music intent");
  } finally {
    releaseCapture?.();
    h.player.dispose();
    if (previous) Object.defineProperty(navigator, "audioSession", previous);
    else Reflect.deleteProperty(navigator, "audioSession");
  }
});
