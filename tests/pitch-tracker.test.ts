import test from "node:test";
import assert from "node:assert/strict";
import { detectPitch } from "../src/lib/pitch.ts";
import { PitchTracker } from "../src/lib/pitch-tracker.ts";

const sampleRate = 48000;
function guitarFrame(endSeconds: number, noise = 0.00008): Float32Array {
  let seed = 18273;
  return Float32Array.from({ length: 32768 }, (_, i) => {
    const time = Math.max(0, endSeconds - (32768 - i) / sampleRate);
    const amplitude = 0.02 * Math.exp(-time / 0.8);
    seed = (1664525 * seed + 1013904223) >>> 0;
    const random = (seed / 4294967296 - 0.5) * noise * 2;
    return (
      amplitude *
        (Math.sin(2 * Math.PI * 110 * time) +
          0.4 * Math.sin(2 * Math.PI * 220 * time + 0.2) +
          0.18 * Math.sin(2 * Math.PI * 330 * time + 0.4)) +
      random
    );
  });
}
const rms = (samples: Float32Array) =>
  Math.sqrt(
    samples.reduce((sum, value) => sum + value * value, 0) / samples.length,
  );
const cents = (frequency: number, target: number) =>
  1200 * Math.log2(frequency / target);

test("phone-level exponential guitar decay stays measurable below the former RMS cutoff", () => {
  const tracker = new PitchTracker();
  for (const time of [0.8, 1.6, 2.4, 3.2]) {
    const samples = guitarFrame(time);
    const found = detectPitch(samples, sampleRate);
    assert.ok(found, `tail not detected at ${time}s, rms ${rms(samples)}`);
    assert.ok(Math.abs(cents(found.frequency, 110)) < 4);
    const result = tracker.update(
      found,
      time * 1000,
      rms(samples.subarray(-2048)),
    );
    assert.ok(
      result && !result.held,
      `tail incorrectly held/cleared at ${time}s`,
    );
    assert.ok(Math.abs(cents(result.frequency, 110)) < 4);
    if (time >= 2.4)
      assert.ok(
        rms(samples) < 0.002,
        "test must exercise previously rejected input",
      );
  }
  const silent = detectPitch(new Float32Array(32768), sampleRate);
  const held = tracker.update(silent, 3280, 0);
  assert.ok(held?.held);
  assert.equal(held.frequency, tracker.update(null, 3440, 0)?.frequency);
  assert.equal(
    tracker.update(null, 4000, 0),
    null,
    "true silence eventually clears",
  );
});

test("brief dropouts hold a marked historical value and strong new notes switch immediately", () => {
  const tracker = new PitchTracker();
  const initial = tracker.update({ frequency: 110, confidence: 0.99 }, 0, 0.01);
  assert.ok(initial && !initial.held);
  assert.ok(tracker.update(null, 80, 0)?.held);
  assert.ok(tracker.update(null, 240, 0)?.held);
  const next = tracker.update(
    { frequency: 146.8324, confidence: 0.99 },
    320,
    0.015,
  );
  assert.ok(next && !next.held);
  assert.equal(next.frequency, 146.8324);
  assert.equal(tracker.update(null, 1200, 0), null);
});

test("small jitter is smoothed without delaying acquisition; one weak jump cannot move the needle", () => {
  const tracker = new PitchTracker();
  assert.equal(
    tracker.update({ frequency: 110, confidence: 0.99 }, 0, 0.01)?.frequency,
    110,
  );
  const jitter = 110 * 2 ** (12 / 1200);
  const smoothed = tracker.update(
    { frequency: jitter, confidence: 0.94 },
    80,
    0.008,
  )!;
  assert.ok(
    cents(smoothed.frequency, 110) > 0 && cents(smoothed.frequency, 110) < 12,
  );
  const weakJump = tracker.update(
    { frequency: 164.81, confidence: 0.91 },
    160,
    0.007,
  )!;
  assert.ok(weakJump.held);
  assert.ok(Math.abs(cents(weakJump.frequency, 110)) < 12);
  const confirmed = tracker.update(
    { frequency: 164.82, confidence: 0.91 },
    240,
    0.007,
  )!;
  assert.ok(!confirmed.held);
  assert.equal(confirmed.frequency, 164.82);
});

test("quiet broadband noise, DC and silence never acquire a pitch; reset clears held evidence", () => {
  let seed = 312998;
  const noise = Float32Array.from({ length: 32768 }, () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return (seed / 4294967296 - 0.5) * 0.002;
  });
  assert.equal(detectPitch(noise, sampleRate), null);
  const tracker = new PitchTracker();
  for (let time = 0; time < 1000; time += 80)
    assert.equal(
      tracker.update(detectPitch(noise, sampleRate), time, rms(noise)),
      null,
    );
  assert.equal(
    tracker.update({ frequency: 110, confidence: 0.7 }, 1100, 0.0004),
    null,
  );
  tracker.update({ frequency: 110, confidence: 0.99 }, 1180, 0.01);
  tracker.reset();
  assert.equal(tracker.update(null, 1260, 0), null);
});
