import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  JazzInstruments,
  JAZZ_SAMPLES,
  chooseJazzSample,
} from "../src/lib/instruments.ts";

class BufferData {
  channels: Float32Array[];
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.channels = Array.from(
      { length: numberOfChannels },
      () => new Float32Array(length),
    );
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(channel: number) {
    return this.channels[channel];
  }
}
class Param {
  events: { value: number; at: number }[] = [];
  setValueAtTime(value: number, at: number) {
    this.events.push({ value, at });
  }
  linearRampToValueAtTime(value: number, at: number) {
    this.events.push({ value, at });
  }
}
class NodeData {
  gain = new Param();
  playbackRate = new Param();
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  target: unknown;
  disconnected = false;
  starts: number[] = [];
  stops: number[] = [];
  connect(target: unknown) {
    this.target = target;
  }
  disconnect() {
    this.disconnected = true;
  }
  start(at: number) {
    this.starts.push(at);
  }
  stop(at: number) {
    this.stops.push(at);
  }
}
class ContextData {
  currentTime = 2;
  sources: NodeData[] = [];
  gains: NodeData[] = [];
  decodes = 0;
  rejectedAAC = 0;
  constructor(
    public sampleRate = 48000,
    private rejectAAC = false,
    private rejectAll = false,
  ) {}
  createBuffer(channels: number, length: number, rate: number) {
    return new BufferData(channels, length, rate);
  }
  async decodeAudioData(data: ArrayBuffer) {
    this.decodes++;
    if (this.rejectAll || (this.rejectAAC && new Uint8Array(data)[0] === 1)) {
      this.rejectedAAC++;
      throw new Error("unsupported codec");
    }
    const buffer = new BufferData(1, 24000, this.sampleRate);
    buffer.channels[0].forEach((_, i, wave) => {
      wave[i] = Math.sin(i * 0.05) * 0.4;
    });
    return buffer;
  }
  createBufferSource() {
    const source = new NodeData();
    this.sources.push(source);
    return source;
  }
  createGain() {
    const gain = new NodeData();
    this.gains.push(gain);
    return gain;
  }
}
const outputs = () => ({
  piano: new NodeData() as unknown as AudioNode,
  bass: new NodeData() as unknown as AudioNode,
  drums: new NodeData() as unknown as AudioNode,
});
const response = (format = 1) =>
  ({
    ok: true,
    arrayBuffer: async () => new Uint8Array([format]).buffer,
  }) as Response;

test("every shipped acoustic sample matches its source hash and renderer descriptor", () => {
  const manifest = JSON.parse(
    fs.readFileSync(
      new URL("../public/samples/jazz-v1/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(JAZZ_SAMPLES.length, 40);
  assert.equal(manifest.files.length, 80);
  for (const descriptor of JAZZ_SAMPLES)
    for (const format of ["m4a", "ogg"]) {
      const entry = manifest.files.find(
        (entry: { id: string; format: string }) =>
          entry.id === descriptor.id && entry.format === format,
      );
      assert.ok(entry, `${descriptor.id} ${format} provenance exists`);
      const bytes = fs.readFileSync(
        new URL(
          `../public/samples/jazz-v1/${descriptor.id}.${format}`,
          import.meta.url,
        ),
      );
      assert.equal(bytes.length, entry.bytes);
      assert.equal(
        crypto.createHash("sha256").update(bytes).digest("hex"),
        entry.sha256,
      );
    }
  assert.equal(chooseJazzSample("piano", 61, 0.4).root, 60);
  assert.equal(chooseJazzSample("piano", 61, 0.4).layer, "soft");
  assert.equal(chooseJazzSample("piano", 61, 0.8).layer, "medium");
  assert.notEqual(
    chooseJazzSample("bass", 31, 0.8, 0).id,
    chooseJazzSample("bass", 31, 0.8, 1).id,
  );
});

test("cancelled sample preparation exits before creating any scheduled sound", async () => {
  const oldFetch = globalThis.fetch;
  const pending: ((response: Response) => void)[] = [];
  globalThis.fetch = (() =>
    new Promise<Response>((resolve) => {
      pending.push(resolve);
    })) as typeof fetch;
  try {
    const context = new ContextData(44101);
    const abort = new AbortController();
    const create = JazzInstruments.create(
      context as unknown as BaseAudioContext,
      outputs(),
      { signal: abort.signal },
    );
    const rejected = assert.rejects(create, { name: "AbortError" });
    abort.abort();
    await rejected;
    assert.equal(context.sources.length, 0);
  } finally {
    pending.forEach((resolve) => resolve(response()));
    await new Promise<void>((resolve) => setImmediate(resolve));
    globalThis.fetch = oldFetch;
  }
});

test("sample voices use exact audio-clock times, true pitch roots, bounded peaks and cleanup", async () => {
  const oldFetch = globalThis.fetch;
  let downloads = 0;
  globalThis.fetch = (async (url: string | URL | Request) => {
    downloads++;
    return response(String(url).endsWith(".ogg") ? 2 : 1);
  }) as typeof fetch;
  try {
    const context = new ContextData();
    const buses = outputs();
    const player = await JazzInstruments.create(
      context as unknown as BaseAudioContext,
      buses,
    );
    player.playPiano([61, 64, 67], 5, 0.2, 0.8);
    player.playBass(32, 5.5, 0.3, 0.8);
    player.playDrum("ride", 6, 0.5);
    assert.equal(context.sources.length, 5);
    assert.equal(context.sources[0].starts[0], 5);
    assert.ok(
      Math.abs(
        context.sources[0].playbackRate.events[0].value - 2 ** (1 / 12),
      ) < 1e-12,
    );
    assert.equal(context.gains[0].target, buses.piano);
    assert.equal(context.gains[3].target, buses.bass);
    assert.equal(context.gains[4].target, buses.drums);
    for (const source of context.sources) {
      const data = source.buffer!.getChannelData(0);
      let peak = 0;
      for (const value of data) peak = Math.max(peak, Math.abs(value));
      assert.ok(peak <= 0.800001 && peak > 0.79);
    }
    const coldDownloads = downloads;
    const next = new ContextData();
    const cached = await JazzInstruments.create(
      next as unknown as BaseAudioContext,
      outputs(),
    );
    assert.equal(
      next.decodes,
      0,
      "a prepared bank is reused across subsequent contexts",
    );
    assert.equal(downloads, coldDownloads);
    cached.dispose();
    player.dispose();
    assert.ok(
      context.sources.every(
        (source) =>
          source.disconnected && source.stops.at(-1) === context.currentTime,
      ),
    );
    assert.ok(context.gains.every((gain) => gain.disconnected));
    player.playBass(32, 8, 0.5, 1);
    assert.equal(
      context.sources.length,
      5,
      "disposed sampler cannot start latent notes",
    );
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("AAC decoder failure loads OGG; total codec failure reports an error without synthesized fallback", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) =>
    response(String(url).endsWith(".ogg") ? 2 : 1)) as typeof fetch;
  try {
    const fallback = new ContextData(48002, true);
    const player = await JazzInstruments.create(
      fallback as unknown as BaseAudioContext,
      outputs(),
    );
    assert.equal(fallback.rejectedAAC, 40);
    player.dispose();
    const unavailable = new ContextData(48003, false, true);
    await assert.rejects(
      JazzInstruments.create(
        unavailable as unknown as BaseAudioContext,
        outputs(),
      ),
      /악기 샘플을 불러오지 못했습니다/,
    );
    assert.equal(unavailable.sources.length, 0);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
