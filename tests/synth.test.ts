import { test } from "node:test";
import assert from "node:assert/strict";
import { playNotes, stopNotes } from "../src/lib/synth.ts";
import { claimAudioSession } from "../src/lib/audio-session.ts";

class Param {
  value = 0;
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
}
class Voice {
  frequency = new Param();
  type = "";
  onended: (() => void) | null = null;
  disconnected = false;
  started = false;
  connect() {}
  disconnect() {
    this.disconnected = true;
  }
  start() {
    this.started = true;
  }
  stop() {}
  finish() {
    this.onended?.();
  }
}
class Context {
  state = "running";
  currentTime = 0;
  destination = {};
  voices: Voice[] = [];
  deferResume = true;
  resumeError: Error | null = null;
  finishResume: (() => void) | null = null;
  async resume() {
    if (this.resumeError) throw this.resumeError;
    if (this.deferResume)
      await new Promise<void>((resolve) => {
        this.finishResume = resolve;
      });
  }
  createOscillator() {
    const voice = new Voice();
    this.voices.push(voice);
    return voice;
  }
  createGain() {
    return { gain: new Param(), connect() {}, disconnect() {} };
  }
}

test("note playback claims synchronously and releases on cancellation, replacement, natural end and errors", async () => {
  const oldContext = globalThis.AudioContext;
  const navigator = globalThis.navigator;
  const previous = Object.getOwnPropertyDescriptor(navigator, "audioSession");
  const session = { type: "auto" };
  const context = new Context();
  let capture: (() => void) | null = null;
  Object.defineProperty(navigator, "audioSession", {
    configurable: true,
    value: session,
  });
  globalThis.AudioContext = class {
    constructor() {
      return context;
    }
  } as unknown as typeof AudioContext;
  try {
    const pending = playNotes([440]);
    assert.equal(session.type, "playback");
    stopNotes();
    assert.equal(session.type, "auto");
    context.finishResume?.();
    await pending;
    assert.equal(
      context.voices.length,
      0,
      "cancelled resume must not create latent notes",
    );
    context.deferResume = false;
    await playNotes([440, 660]);
    assert.equal(session.type, "playback");
    const stale = context.voices[0];
    await playNotes([330]);
    stale.finish();
    assert.equal(
      session.type,
      "playback",
      "an old ended callback cannot release replacement playback",
    );
    context.voices.at(-1)!.finish();
    assert.equal(session.type, "auto");
    capture = claimAudioSession("capture");
    await playNotes([550]);
    stopNotes();
    assert.equal(
      session.type,
      "play-and-record",
      "stopping note playback never releases the tuner capture lease",
    );
    capture();
    capture = null;
    assert.equal(session.type, "auto");
    context.resumeError = new Error("resume denied");
    await assert.rejects(playNotes([440]), /resume denied/);
    assert.equal(session.type, "auto");
    context.resumeError = null;
    await playNotes([]);
    assert.equal(session.type, "auto");
  } finally {
    capture?.();
    stopNotes();
    context.state = "closed";
    globalThis.AudioContext = oldContext;
    if (previous) Object.defineProperty(navigator, "audioSession", previous);
    else Reflect.deleteProperty(navigator, "audioSession");
  }
});
