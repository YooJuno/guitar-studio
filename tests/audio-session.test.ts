import test from "node:test";
import assert from "node:assert/strict";
import { claimAudioSession } from "../src/lib/audio-session.ts";

test("music ignores ambient mode and capture survives overlapping playback", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const audioSession = { type: "auto" };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { audioSession },
  });
  try {
    const endMusic = claimAudioSession("playback");
    assert.equal(audioSession.type, "playback");
    const endCapture = claimAudioSession("capture");
    assert.equal(audioSession.type, "play-and-record");
    const endClick = claimAudioSession("playback");
    endMusic();
    endClick();
    assert.equal(audioSession.type, "play-and-record");
    const endNextMusic = claimAudioSession("playback");
    endCapture();
    endCapture();
    assert.equal(audioSession.type, "playback");
    endNextMusic();
    assert.equal(audioSession.type, "auto");
  } finally {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});

test("unsupported or rejected audio session types do not block audio", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
    claimAudioSession("playback")();
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        audioSession: {
          get type() {
            return "ambient";
          },
          set type(_: string) {
            throw new Error("Unsupported");
          },
        },
      },
    });
    assert.doesNotThrow(() => claimAudioSession("capture")());
  } finally {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
