import test from "node:test";
import assert from "node:assert/strict";
import {
  flattenBars,
  getMeter,
  parseJazzChord,
  transposeChord,
} from "../src/lib/jazz.ts";
import { standards } from "../src/data/standards.ts";

test("every library chord parses completely, including half-diminished and altered dominants", () => {
  for (const standard of standards)
    for (const bar of flattenBars(standard))
      for (const chord of bar) {
        assert.ok(parseJazzChord(chord), `${standard.id}: ${chord}`);
      }
  assert.deepEqual(parseJazzChord("Dm7♭5"), {
    root: 2,
    bass: 2,
    intervals: [0, 3, 6, 10],
  });
  assert.deepEqual(parseJazzChord("Cm(maj7)"), {
    root: 0,
    bass: 0,
    intervals: [0, 3, 7, 11],
  });
  assert.deepEqual(parseJazzChord("G7♭9"), {
    root: 7,
    bass: 7,
    intervals: [0, 4, 7, 10, 13],
  });
  assert.deepEqual(parseJazzChord("C7♯5"), {
    root: 0,
    bass: 0,
    intervals: [0, 4, 8, 10],
  });
});

test("parser recognizes enharmonics, symbols, slash bass and extensions without guessing", () => {
  assert.deepEqual(parseJazzChord("B♭maj9/D"), {
    root: 10,
    bass: 2,
    intervals: [0, 4, 7, 11, 14],
  });
  assert.deepEqual(parseJazzChord("F#ø7/C#"), {
    root: 6,
    bass: 1,
    intervals: [0, 3, 6, 10],
  });
  assert.deepEqual(parseJazzChord("C°7"), {
    root: 0,
    bass: 0,
    intervals: [0, 3, 6, 9],
  });
  assert.deepEqual(parseJazzChord("C6/9"), {
    root: 0,
    bass: 0,
    intervals: [0, 4, 7, 9, 14],
  });
  assert.deepEqual(parseJazzChord("A-add9"), {
    root: 9,
    bass: 9,
    intervals: [0, 3, 7, 14],
  });
  assert.deepEqual(parseJazzChord("G13sus4"), {
    root: 7,
    bass: 7,
    intervals: [0, 5, 7, 10, 14, 17, 21],
  });
  assert.deepEqual(parseJazzChord("C7b9#9#11"), {
    root: 0,
    bass: 0,
    intervals: [0, 4, 7, 10, 13, 15, 18],
  });
  for (const chord of [
    "",
    "N.C.",
    "unknown",
    "H7",
    "Cgarbage",
    "C7foo",
    "Cmaj7/Garbage",
    "Cm(maj7",
    "C7sus2sus4",
  ])
    assert.equal(parseJazzChord(chord), null, chord);
});

test("transposition wraps large positive and negative intervals and preserves quality/slash bass", () => {
  assert.equal(transposeChord("B♭maj7/D", 26), "Cmaj7/E");
  assert.equal(transposeChord("C7/G", -25), "B7/F♯");
  assert.equal(transposeChord("C6/9", 2), "D6/9");
  assert.equal(transposeChord("E♭ minor", -38), "C♯ minor");
  assert.equal(transposeChord("C7♭9", -60), "C7♭9");
  assert.equal(transposeChord("N.C.", 2), "N.C.");
  assert.equal(transposeChord("Cgarbage", 2), "Cgarbage");
  assert.equal(transposeChord("C7", NaN), "C7");
});

test("flattening retains complete forms and copies bars", () => {
  const standard = standards.find((s) => s.id === "all-the-things-you-are")!;
  const bars = flattenBars(standard);
  assert.equal(bars.length, 36);
  assert.deepEqual(bars[0], ["Fm7"]);
  bars[0][0] = "changed";
  assert.deepEqual(standard.sections[0].bars[0], ["Fm7"]);
});

test("meter follows explicit score meter, then form notation, then common time", () => {
  assert.deepEqual(getMeter(standards.find((s) => s.id === "take-five")!), {
    beats: 5,
    denominator: 4,
  });
  assert.deepEqual(getMeter(standards.find((s) => s.id === "amazing-grace")!), {
    beats: 3,
    denominator: 4,
  });
  assert.deepEqual(getMeter({ form: "12 bars · 6/8" }), {
    beats: 6,
    denominator: 8,
  });
  assert.deepEqual(getMeter({ form: "12 bars", meter: "9/8" }), {
    beats: 9,
    denominator: 8,
  });
  assert.deepEqual(getMeter({ form: "32 bars", meter: "0/4" }), {
    beats: 4,
    denominator: 4,
  });
});
