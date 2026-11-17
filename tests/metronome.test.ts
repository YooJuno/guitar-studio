import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultMetronome, Metronome, stepDuration, tapTempo } from '../src/lib/metronome.ts';
import type { MetronomeConfig, Tick } from '../src/lib/metronome.ts';

test('subdivisions and swing preserve the selected beat duration in /4 and /8', () => {
  for (const denominator of [4, 8]) {
    const cfg = { ...defaultMetronome, denominator, bpm: 120, subdivision: 4 };
    assert.equal([0, 1, 2, 3].reduce((sum, sub) => sum + stepDuration(cfg, sub), 0), 0.5);
    const swing = { ...cfg, subdivision: 2, swing: true };
    assert.ok(Math.abs(stepDuration(swing, 0) + stepDuration(swing, 1) - 0.5) < 1e-10);
    assert.equal(stepDuration(swing, 0) / stepDuration(swing, 1), 2);
  }
});
test('tap tempo resists one extra or missed tap, and rejects unusable input', () => {
  assert.equal(tapTempo([0, 500, 1000, 1050, 1500, 2000]), 120);
  assert.equal(tapTempo([0, 500, 1000, 2000, 2500, 3000]), 120);
  assert.equal(tapTempo([0, 500, 1000, 1500]), 120);
  assert.equal(tapTempo([0, 499, 1001, 1498, 2002, 2500]), 120);
  assert.equal(tapTempo([0]), null);
  assert.equal(tapTempo([0, 10, 100, NaN]), null);
});

/** Virtual JavaScript and audio clocks exercise the scheduler, not wall-clock luck. */
class Clock {
  time = 0;
  nextId = 1;
  tasks = new Map<number, { at: number; interval: number | null; fn: () => void }>();
  contexts: FakeContext[] = [];
  resumeError: Error | null = null;
  pendingResume: (() => void) | null = null;
  deferResume = false;
  set(fn: () => void, delay = 0, interval: number | null = null) {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.time + delay, interval, fn });
    return id;
  }
  advance(milliseconds: number) {
    const end = this.time + milliseconds;
    let guard = 0;
    while (true) {
      const next = [...this.tasks.entries()].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      assert.ok(++guard < 20000, 'scheduler must not loop forever');
      const [id, task] = next;
      this.time = task.at;
      if (task.interval === null) this.tasks.delete(id); else task.at += task.interval;
      task.fn();
    }
    this.time = end;
  }
  jump(milliseconds: number) {
    this.time += milliseconds;
    const pending = [...this.tasks.entries()].filter(([, task]) => task.at <= this.time).sort((a, b) => a[1].at - b[1].at);
    for (const [id, task] of pending) {
      if (!this.tasks.has(id)) continue;
      if (task.interval === null) this.tasks.delete(id); else task.at = this.time + task.interval;
      task.fn();
    }
  }
  install() {
    const original = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval, AudioContext: globalThis.AudioContext };
    globalThis.setTimeout = ((fn: () => void, delay: number) => this.set(fn, delay)) as unknown as typeof setTimeout;
    globalThis.setInterval = ((fn: () => void, delay: number) => this.set(fn, delay, delay)) as unknown as typeof setInterval;
    globalThis.clearTimeout = ((id: number) => this.tasks.delete(id)) as unknown as typeof clearTimeout;
    globalThis.clearInterval = ((id: number) => this.tasks.delete(id)) as unknown as typeof clearInterval;
    const clock = this;
    globalThis.AudioContext = class { constructor() { const context = new FakeContext(clock); clock.contexts.push(context); return context; } } as unknown as typeof AudioContext;
    return () => { Object.assign(globalThis, original); };
  }
}
class Param {
  events: { type: string; value: number; time: number }[] = [];
  setValueAtTime(value: number, time: number) { this.events.push({ type: 'set', value, time }); }
  exponentialRampToValueAtTime(value: number, time: number) { this.events.push({ type: 'ramp', value, time }); }
}
class FakeVoice {
  frequency = new Param();
  type = '';
  startTime = 0;
  stopTime = 0;
  disconnected = false;
  onended: (() => void) | null = null;
  endTask: number | null = null;
  gain: FakeGain | null = null;
  constructor(public context: FakeContext) {}
  connect(gain: FakeGain) { this.gain = gain; }
  disconnect() { this.disconnected = true; }
  start(time: number) { this.startTime = time; this.context.starts.push({ time, at: this.context.currentTime, voice: this }); }
  stop(time = this.context.currentTime) {
    this.stopTime = time;
    if (this.endTask !== null) this.context.clock.tasks.delete(this.endTask);
    this.endTask = this.context.clock.set(() => { this.onended?.(); }, Math.max(0, (time - this.context.currentTime) * 1000));
  }
}
class FakeGain {
  gain = new Param(); disconnected = false;
  connect() {}
  disconnect() { this.disconnected = true; }
}
class FakeContext {
  state = 'suspended';
  destination = {};
  starts: { time: number; at: number; voice: FakeVoice }[] = [];
  voices: FakeVoice[] = [];
  constructor(public clock: Clock) {}
  get currentTime() { return this.clock.time / 1000; }
  resume() {
    if (this.clock.resumeError) return Promise.reject(this.clock.resumeError);
    this.state = 'running';
    if (this.clock.deferResume) return new Promise<void>(resolve => { this.clock.pendingResume = resolve; });
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    this.voices.forEach(voice => {
      if (voice.endTask !== null) this.clock.tasks.delete(voice.endTask);
      voice.onended?.();
    });
    return Promise.resolve();
  }
  createOscillator() { const voice = new FakeVoice(this); this.voices.push(voice); return voice; }
  createGain() { return new FakeGain(); }
}
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('audio beats remain on time with swing, muted beats, accents and count-in', async t => {
  const clock = new Clock(); t.after(clock.install());
  const metronome = new Metronome();
  metronome.config = { ...defaultMetronome, bpm: 120, beats: 3, denominator: 8, subdivision: 2, swing: true, countIn: 1, sound: 'digital', accents: [2, 0, 1] };
  const ticks: Tick[] = [];
  await metronome.start(tick => ticks.push(tick), () => {});
  clock.advance(3200);
  const starts = clock.contexts[0].starts;
  // The muted second beat suppresses both its main and subdivided clicks.
  const expected = [0.08, 0.08 + 1 / 3, 1.08, 1.08 + 1 / 3, 1.58, 1.58 + 1 / 3, 2.58, 2.58 + 1 / 3, 3.08];
  assert.equal(starts.length, expected.length);
  starts.forEach((start, index) => { close(start.time, expected[index]); assert.ok(start.time > start.at); });
  assert.equal(starts[0].voice.frequency.events[0].value, 1440); // Accented digital click.
  assert.equal(starts[1].voice.frequency.events[0].value, 630); // Soft subdivision.
  assert.equal(starts[2].voice.frequency.events[0].value, 900); // Unaccented beat.
  assert.equal(ticks.filter(tick => tick.countIn).length, 6);
  assert.deepEqual(ticks[6], { beat: 0, sub: 0, bar: 1, countIn: false, bpm: 120 });
  assert.ok(clock.contexts[0].voices.slice(0, -1).every(voice => voice.disconnected && voice.gain?.disconnected));
  metronome.stop();
});

test('tempo ramp starts after count-in and increments at completed bar boundaries', async t => {
  const clock = new Clock(); t.after(clock.install());
  const metronome = new Metronome();
  metronome.config = { ...defaultMetronome, bpm: 120, beats: 2, countIn: 1, rampEvery: 2, rampBy: 10 };
  const ticks: Tick[] = [];
  await metronome.start(tick => ticks.push(tick), () => {});
  clock.advance(4200);
  const downbeats = ticks.filter(tick => tick.beat === 0);
  assert.deepEqual(downbeats.slice(0, 5).map(tick => [tick.countIn, tick.bar, tick.bpm]), [[true, 1, 120], [false, 1, 120], [false, 2, 120], [false, 3, 130], [false, 4, 130]]);
  const starts = clock.contexts[0].starts;
  close(starts[7].time - starts[6].time, 60 / 130);
  metronome.stop();
});

test('automatic stop never schedules audio past its deadline and fires once', async t => {
  const clock = new Clock(); t.after(clock.install());
  const metronome = new Metronome();
  metronome.config = { ...defaultMetronome, bpm: 300, subdivision: 4, timerMinutes: 0.01 };
  let stops = 0;
  await metronome.start(() => {}, () => { stops++; });
  clock.advance(2000);
  const context = clock.contexts[0];
  assert.equal(stops, 1);
  assert.equal(context.state, 'closed');
  assert.ok(context.starts.length > 8);
  context.starts.forEach(start => { assert.ok(start.time < 0.68); assert.ok(start.voice.stopTime <= 0.68); });
  assert.equal(clock.tasks.size, 0);
});

test('suspended tabs skip late audio and visual ticks; stop clears all future work', async t => {
  const clock = new Clock(); t.after(clock.install());
  const metronome = new Metronome();
  metronome.config = { ...defaultMetronome, bpm: 300, subdivision: 4 };
  const ticks: Tick[] = [];
  await metronome.start(tick => ticks.push(tick), () => {});
  const before = clock.contexts[0].starts.length;
  clock.jump(10000);
  const resumed = clock.contexts[0].starts.slice(before);
  assert.ok(resumed.length <= 2, 'must not enqueue a catch-up burst');
  resumed.forEach(start => assert.ok(start.time > 10));
  assert.equal(ticks.length, 0, 'stale visual callbacks must not flash');
  clock.advance(100);
  assert.ok(ticks.length > 0);
  metronome.stop();
  const count = ticks.length;
  clock.advance(2000);
  assert.equal(ticks.length, count);
  assert.equal(clock.tasks.size, 0);
});

test('stop during context resume and resume rejection both release the audio context', async t => {
  const clock = new Clock(); t.after(clock.install());
  clock.deferResume = true;
  const metronome = new Metronome();
  const starting = metronome.start(() => assert.fail('must not tick'), () => {});
  metronome.stop();
  clock.pendingResume?.();
  await starting;
  assert.equal(clock.contexts[0].state, 'closed');
  assert.equal(clock.tasks.size, 0);
  clock.deferResume = false;
  clock.resumeError = new Error('audio unavailable');
  await assert.rejects(metronome.start(() => {}, () => {}), /audio unavailable/);
  assert.equal(clock.contexts[1].state, 'closed');
  assert.equal(clock.tasks.size, 0);
});

test('volume zero is silent and invalid stored tempo cannot cause a scheduling loop', async t => {
  const clock = new Clock(); t.after(clock.install());
  const metronome = new Metronome();
  metronome.config = { ...defaultMetronome, bpm: 0, subdivision: 0, beats: 0, volume: 0 } as MetronomeConfig;
  const ticks: Tick[] = [];
  await metronome.start(tick => ticks.push(tick), () => {});
  clock.advance(1100);
  assert.equal(clock.contexts[0].starts.length, 0);
  assert.ok(ticks.length > 0 && ticks.length < 10);
  metronome.stop();
});
