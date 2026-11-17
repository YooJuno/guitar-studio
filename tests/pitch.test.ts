import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectPitch, detectPolyphonic } from '../src/lib/pitch.ts';

const rate = 48000;
const samples = 32768;
const cents = (actual: number, expected: number) => 1200 * Math.log2(actual / expected);
function tone(frequency: number, amplitude = 0.2, harmonics = [1, 0.45, 0.2, 0.12, 0.08, 0.05]): Float32Array {
  return Float32Array.from({ length: samples }, (_, i) => {
    let value = 0;
    for (let h = 0; h < harmonics.length; h++) value += amplitude * harmonics[h] * Math.sin(2 * Math.PI * frequency * (h + 1) * i / rate + h * 0.37);
    return value;
  });
}
function mixture(frequencies: number[]): Float32Array {
  const result = new Float32Array(samples);
  frequencies.forEach((frequency, index) => {
    const signal = tone(frequency, 0.09 + index * 0.006);
    signal.forEach((value, i) => { result[i] += value; });
  });
  return result;
}

test('YIN detects guitar and five/six-string bass fundamentals including low B', () => {
  for (const frequency of [30.8677, 41.2034, 55, 73.4162, 82.4069, 110, 146.8324, 195.9977, 246.9417, 329.6276, 440, 1046.502]) {
    const found = detectPitch(tone(frequency), rate);
    assert.ok(found, `no pitch for ${frequency}`);
    assert.ok(Math.abs(cents(found.frequency, frequency)) < 3, `${frequency}: got ${found.frequency}`);
    assert.ok(found.confidence > 0.95);
  }
});

test('YIN handles pure, detuned, DC-offset and harmonic-rich DI tones', () => {
  for (const detune of [-38, -7, 0, 19, 44]) {
    const frequency = 110 * 2 ** (detune / 1200);
    const signal = tone(frequency, 0.12, [0.6, 1, 0.35, 0.2]);
    signal.forEach((value, i) => { signal[i] = value + 0.25; });
    const found = detectPitch(signal, rate);
    assert.ok(found);
    assert.ok(Math.abs(cents(found.frequency, frequency)) < 3);
  }
  const pure = detectPitch(tone(440, 0.1, [1]), 48000);
  assert.ok(pure && Math.abs(cents(pure.frequency, 440)) < 2);
});

test('silence, DC, low level, invalid and aperiodic input do not show a pitch', () => {
  assert.equal(detectPitch(new Float32Array(samples), rate), null);
  assert.equal(detectPitch(new Float32Array(samples).fill(0.3), rate), null);
  assert.equal(detectPitch(tone(110, 0.0001), rate), null);
  assert.equal(detectPitch(new Float32Array([NaN, Infinity]), rate), null);
  let state = 123456;
  const noise = Float32Array.from({ length: samples }, () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return (state / 4294967296 - 0.5) * 0.2;
  });
  assert.equal(detectPitch(noise, rate), null);
  assert.deepEqual(detectPolyphonic(noise, rate, [82.4069, 110, 146.8324, 195.9977, 246.9417, 329.6276]), [null, null, null, null, null, null]);
});

test('polyphonic detector estimates six simultaneous detuned guitar strings', () => {
  const targets = [82.4069, 110, 146.8324, 195.9977, 246.9417, 329.6276];
  const detunes = [-17, 9, -12, 20, -6, 25];
  const frequencies = targets.map((target, i) => target * 2 ** (detunes[i] / 1200));
  const results = detectPolyphonic(mixture(frequencies), rate, targets);
  results.forEach((result, i) => {
    assert.ok(result, `string ${i} missing`);
    assert.ok(Math.abs(result.cents - detunes[i]) < 6, `string ${i}: got ${result.cents}, expected ${detunes[i]}`);
  });
});

test('polyphonic detector supports six-string bass and low B', () => {
  const targets = [30.8677, 41.2034, 55, 73.4162, 97.9989, 130.8128];
  const detunes = [14, -19, 7, -11, 23, -8];
  const frequencies = targets.map((target, i) => target * 2 ** (detunes[i] / 1200));
  const results = detectPolyphonic(mixture(frequencies), rate, targets);
  results.forEach((result, i) => {
    assert.ok(result, `bass string ${i} missing`);
    assert.ok(Math.abs(result.cents - detunes[i]) < 9, `bass string ${i}: got ${result.cents}, expected ${detunes[i]}`);
  });
});

test('muted strings and lower-string harmonics are not all reported as played', () => {
  const targets = [82.4069, 110, 146.8324, 195.9977, 246.9417, 329.6276];
  const results = detectPolyphonic(tone(targets[0]), rate, targets);
  assert.ok(results[0]);
  for (let i = 1; i < results.length; i++) assert.equal(results[i], null, `unplayed string ${i} reported`);
  assert.deepEqual(detectPolyphonic(new Float32Array(samples), rate, targets), targets.map(() => null));
});
