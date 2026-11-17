import { test } from "node:test";
import assert from "node:assert/strict";
import { JazzBacking, planBackingBar } from "../src/lib/backing.ts";
import type { BackingConfig, BackingPosition } from "../src/lib/backing.ts";
import { parseJazzChord } from "../src/lib/jazz.ts";
const base: BackingConfig = {
  bars: [["Dm7"], ["G7"], ["Cmaj7"]],
  bpm: 120,
  transpose: 0,
  beats: 4,
  style: "swing",
  loop: false,
  loopStart: 0,
  loopEnd: 2,
  countIn: 0,
  volume: 0.7,
  piano: 0.7,
  bass: 0.7,
  drums: 0.5,
};
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const mod = (n: number) => ((n % 12) + 12) % 12;

test("three chords in four beats retain fractional boundaries, qualities and slash bass", () => {
  const chords = ["Cm7", "F7♭9", "B♭maj7/D"];
  const events = planBackingBar({ ...base, bars: [chords] }, 0);
  const starts = events.filter(
    (event) => event.instrument === "piano" && event.velocity > 0.7,
  );
  assert.equal(starts.length, 3);
  starts.forEach((event, index) => {
    near(event.offset, (index * 4) / 3);
    assert.equal(event.chord, chords[index]);
  });
  for (const event of events.filter((event) => event.instrument === "piano")) {
    const chord = parseJazzChord(event.chord)!;
    const allowed = chord.intervals.map((interval) =>
      mod(chord.root + interval),
    );
    event.notes.forEach((note) =>
      assert.ok(
        allowed.includes(mod(note)),
        `${event.chord}: invalid note ${note}`,
      ),
    );
    const nextBoundary = ((chords.indexOf(event.chord) + 1) * 4) / 3;
    assert.ok(event.offset + event.duration <= nextBoundary + 1e-7);
  }
  const slashRoot = events.find(
    (event) =>
      event.instrument === "bass" && Math.abs(event.offset - 8 / 3) < 1e-7,
  )!;
  assert.equal(mod(slashRoot.notes[0]), 2);
});

test("transposition shifts every pitched note and keeps altered/extended chord character", () => {
  const config = { ...base, bars: [["C13", "G7alt", "Dm7♭5"]] };
  const original = planBackingBar(config, 0);
  const shifted = planBackingBar({ ...config, transpose: 5 }, 0);
  assert.equal(original.length, shifted.length);
  original.forEach((event, index) => {
    assert.equal(event.offset, shifted[index].offset);
    assert.deepEqual(
      shifted[index].notes,
      event.notes.map((note) => note + 5),
    );
  });
  const c13 = original.find((event) => event.instrument === "piano")!;
  assert.ok(
    c13.notes.some((note) => mod(note) === 9),
    "13th must be retained",
  );
  const altered = original.find(
    (event) => event.instrument === "piano" && event.chord === "G7alt",
  )!;
  assert.ok(
    altered.notes.some((note) => mod(note - 7) === 1),
    "flat ninth must be retained",
  );
  assert.ok(
    altered.notes.some((note) => mod(note - 7) === 3),
    "sharp ninth must be retained",
  );
});

test("styles have distinct rhythmic plans and all events stay inside a three-beat bar", () => {
  const patterns = new Set<string>();
  for (const style of ["swing", "bossa", "ballad", "straight"] as const) {
    const events = planBackingBar({ ...base, beats: 3, style }, 0);
    assert.ok(events.length > 0);
    events.forEach((event) => {
      assert.ok(event.offset >= 0 && event.offset < 3);
      assert.ok(event.duration > 0);
    });
    patterns.add(
      events
        .filter((event) => !["piano", "bass"].includes(event.instrument))
        .map((event) => `${event.instrument}@${event.offset}`)
        .join(","),
    );
  }
  assert.equal(patterns.size, 4);
  const silent = planBackingBar({ ...base, bars: [["N.C."]] }, 0);
  assert.equal(silent.filter((event) => event.notes.length).length, 0);
});

class Param {
  value = 0;
  events: Array<{ value: number; time: number }> = [];
  setValueAtTime(value: number, time: number) {
    this.events.push({ value, time });
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.events.push({ value, time });
  }
  setTargetAtTime(value: number, time: number) {
    this.events.push({ value, time });
  }
}
class Node {
  disconnected = false;
  connections: Node[] = [];
  connect(destination: Node) {
    this.connections.push(destination);
  }
  disconnect() {
    this.disconnected = true;
  }
}
class Gain extends Node {
  gain = new Param();
}
class Source extends Node {
  frequency = new Param();
  type = "";
  buffer: unknown = null;
  onended: (() => void) | null = null;
  task: number | null = null;
  startAt = 0;
  stopAt = 0;
  constructor(
    public context: Context,
    public kind: "oscillator" | "noise",
  ) {
    super();
  }
  start(time: number) {
    this.startAt = time;
    this.context.starts.push({
      source: this,
      time,
      createdAt: this.context.currentTime,
    });
  }
  stop(time = this.context.currentTime) {
    this.stopAt = time;
    if (this.task !== null) this.context.clock.tasks.delete(this.task);
    this.task = this.context.clock.set(
      () => this.onended?.(),
      Math.max(0, (time - this.context.currentTime) * 1000),
    );
  }
}
class Context {
  state = "suspended";
  sampleRate = 48000;
  destination = new Node();
  starts: Array<{ source: Source; time: number; createdAt: number }> = [];
  sources: Source[] = [];
  gains: Gain[] = [];
  constructor(public clock: Clock) {}
  get currentTime() {
    return this.clock.time / 1000;
  }
  resume() {
    if (this.clock.failResume)
      return Promise.reject(new Error("audio unavailable"));
    this.state = "running";
    if (this.clock.deferResume)
      return new Promise<void>((resolve) => {
        this.clock.resolveResume = resolve;
      });
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    this.sources.forEach((source) => {
      if (source.task !== null) this.clock.tasks.delete(source.task);
      source.onended?.();
    });
    return Promise.resolve();
  }
  createGain() {
    const gain = new Gain();
    this.gains.push(gain);
    return gain;
  }
  createOscillator() {
    const source = new Source(this, "oscillator");
    this.sources.push(source);
    return source;
  }
  createBufferSource() {
    const source = new Source(this, "noise");
    this.sources.push(source);
    return source;
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  createBiquadFilter() {
    return Object.assign(new Node(), {
      type: "",
      frequency: new Param(),
      Q: new Param(),
    });
  }
  createDynamicsCompressor() {
    return Object.assign(new Node(), {
      threshold: new Param(),
      knee: new Param(),
      ratio: new Param(),
      attack: new Param(),
      release: new Param(),
    });
  }
}
class Clock {
  time = 0;
  next = 1;
  contexts: Context[] = [];
  failResume = false;
  deferResume = false;
  resolveResume: (() => void) | null = null;
  tasks = new Map<
    number,
    { time: number; interval: number | null; callback: () => void }
  >();
  set(callback: () => void, delay = 0, interval: number | null = null) {
    const id = this.next++;
    this.tasks.set(id, { time: this.time + delay, interval, callback });
    return id;
  }
  advance(milliseconds: number) {
    const end = this.time + milliseconds;
    let guard = 0;
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.time <= end)
        .sort((a, b) => a[1].time - b[1].time)[0];
      if (!next) break;
      assert.ok(++guard < 50000, "must not schedule an infinite burst");
      const [id, task] = next;
      this.time = task.time;
      if (task.interval === null) this.tasks.delete(id);
      else task.time += task.interval;
      task.callback();
    }
    this.time = end;
  }
  jump(milliseconds: number) {
    this.time += milliseconds;
    const ready = [...this.tasks.entries()]
      .filter(([, task]) => task.time <= this.time)
      .sort((a, b) => a[1].time - b[1].time);
    for (const [id, task] of ready) {
      if (!this.tasks.has(id)) continue;
      if (task.interval === null) this.tasks.delete(id);
      else task.time = this.time + task.interval;
      task.callback();
    }
  }
  install() {
    const original = {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
      AudioContext: globalThis.AudioContext,
    };
    globalThis.setTimeout = ((callback: () => void, delay: number) =>
      this.set(callback, delay)) as unknown as typeof setTimeout;
    globalThis.setInterval = ((callback: () => void, delay: number) =>
      this.set(callback, delay, delay)) as unknown as typeof setInterval;
    globalThis.clearTimeout = ((id: number) =>
      this.tasks.delete(id)) as unknown as typeof clearTimeout;
    globalThis.clearInterval = ((id: number) =>
      this.tasks.delete(id)) as unknown as typeof clearInterval;
    const clock = this;
    globalThis.AudioContext = class {
      constructor() {
        const context = new Context(clock);
        clock.contexts.push(context);
        return context;
      }
    } as unknown as typeof AudioContext;
    return () => Object.assign(globalThis, original);
  }
}

test("count-in follows the meter, finite form visits every bar and ends exactly once", async (t) => {
  const clock = new Clock();
  t.after(clock.install());
  const backing = new JazzBacking();
  const positions: Array<BackingPosition & { at: number }> = [];
  let ended = 0;
  await backing.start(
    { ...base, bars: [["Dm7"], ["G7"]], beats: 3, countIn: 1 },
    (position) => positions.push({ ...position, at: clock.time / 1000 }),
    () => ended++,
  );
  clock.advance(5000);
  const count = positions.filter((position) => position.countIn);
  assert.deepEqual(
    count.map((position) => position.beat),
    [0, 1, 2],
  );
  near(count[0].at, 0.08);
  near(count[2].at, 1.08);
  const downbeats = positions.filter(
    (position) => !position.countIn && position.beat === 0,
  );
  assert.deepEqual(
    downbeats.map((position) => [position.bar, position.chord]),
    [
      [0, "Dm7"],
      [1, "G7"],
    ],
  );
  near(downbeats[0].at, 1.58);
  near(downbeats[1].at, 3.08);
  assert.equal(ended, 1);
  assert.equal(clock.contexts[0].state, "closed");
  assert.equal(clock.tasks.size, 0);
  assert.ok(clock.contexts[0].sources.every((source) => source.disconnected));
});

test("an inclusive loop range wraps only selected bars, increments choruses and stops cleanly", async (t) => {
  const clock = new Clock();
  t.after(clock.install());
  const backing = new JazzBacking();
  const positions: BackingPosition[] = [];
  let ended = 0;
  await backing.start(
    { ...base, loop: true, loopStart: 1, loopEnd: 2 },
    (position) => positions.push(position),
    () => ended++,
  );
  clock.advance(8200);
  assert.deepEqual(
    positions
      .filter((position) => position.beat === 0)
      .slice(0, 5)
      .map((position) => [position.bar, position.chorus]),
    [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
      [1, 3],
    ],
  );
  backing.stop();
  const count = positions.length;
  clock.advance(5000);
  assert.equal(positions.length, count);
  assert.equal(ended, 0);
  assert.equal(clock.tasks.size, 0);
});

test("live tempo and key changes affect newly scheduled audio and chord labels", async (t) => {
  const clock = new Clock();
  t.after(clock.install());
  const backing = new JazzBacking();
  const positions: Array<BackingPosition & { at: number }> = [];
  await backing.start(
    { ...base, bars: [["Cmaj7"]], loop: true, loopEnd: 0, drums: 0 },
    (position) => positions.push({ ...position, at: clock.time / 1000 }),
    () => {},
  );
  clock.advance(250);
  backing.update({ bpm: 60, transpose: 2 });
  const before = clock.contexts[0].starts.length;
  clock.advance(3000);
  const updated = positions.filter((position) => position.at > 0.25);
  assert.ok(updated.length > 2);
  assert.ok(
    updated.every(
      (position) => position.bpm === 60 && position.chord === "Dmaj7",
    ),
  );
  const starts = clock.contexts[0].starts
    .slice(before)
    .filter((start) => start.source.frequency.events.length);
  // Piano/bass are Cmaj7 transposed to Dmaj7: D,F#,A,C# and their harmonics.
  assert.ok(
    starts.some((start) => {
      const frequency = start.source.frequency.events[0].value;
      const midi = 69 + 12 * Math.log2(frequency / 440);
      return (
        Math.abs(midi - Math.round(midi)) < 1e-7 && mod(Math.round(midi)) === 2
      );
    }),
  );
  const fullBeats = updated.filter(
    (position) => position.beat === 2 || position.beat === 3,
  );
  if (fullBeats.length >= 2) near(fullBeats[1].at - fullBeats[0].at, 1);
  backing.stop();
});

test("background resumption skips stale callbacks and never schedules audio in the past", async (t) => {
  const clock = new Clock();
  t.after(clock.install());
  const backing = new JazzBacking();
  const positions: BackingPosition[] = [];
  await backing.start(
    { ...base, loop: true },
    (position) => positions.push(position),
    () => {},
  );
  const before = clock.contexts[0].starts.length;
  clock.jump(10000);
  assert.equal(positions.length, 0);
  const starts = clock.contexts[0].starts.slice(before);
  assert.ok(starts.length < 50, "resume must not enqueue ten seconds of notes");
  starts.forEach((start) =>
    assert.ok(start.time >= 10.04 && start.time > start.createdAt),
  );
  clock.advance(700);
  assert.ok(positions.length > 0);
  backing.stop();
  assert.equal(clock.tasks.size, 0);
});

test("empty form, resume errors, pending-start cancellation and muted mix release resources", async (t) => {
  const clock = new Clock();
  t.after(clock.install());
  const backing = new JazzBacking();
  await assert.rejects(
    backing.start(
      { ...base, bars: [] },
      () => {},
      () => {},
    ),
    /마디/,
  );
  clock.failResume = true;
  await assert.rejects(
    backing.start(
      base,
      () => {},
      () => {},
    ),
    /audio unavailable/,
  );
  assert.equal(clock.contexts[0].state, "closed");
  clock.failResume = false;
  clock.deferResume = true;
  const start = backing.start(
    base,
    () => assert.fail("cancelled callback"),
    () => {},
  );
  backing.stop();
  clock.resolveResume?.();
  await start;
  assert.equal(clock.contexts[1].state, "closed");
  clock.deferResume = false;
  await backing.start(
    { ...base, volume: 0 },
    () => {},
    () => {},
  );
  clock.advance(500);
  assert.equal(clock.contexts[2].starts.length, 0);
  backing.stop();
  assert.equal(clock.tasks.size, 0);
});
