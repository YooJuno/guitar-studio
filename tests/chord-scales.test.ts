import test from "node:test";
import assert from "node:assert/strict";
import { standards } from "../src/data/standards";
import {
  chordScaleOptions,
  spellChordScale,
  type ChordScaleContext,
} from "../src/lib/chord-scales";
import { flattenBars, parseJazzChord, transposeChord } from "../src/lib/jazz";

function options(symbol: string, context?: ChordScaleContext) {
  const chord = parseJazzChord(symbol);
  assert.ok(chord, symbol);
  return chordScaleOptions(chord, context);
}

test("ii–V–I and major-key modes are ranked by progression", () => {
  const minorSeventh = options("Dm7", { key: "A minor", nextChord: "G7" });
  assert.equal(minorSeventh[0]?.id, "dorian");
  assert.match(minorSeventh[0].reason, /장6도 B.*G7.*장3도/);
  assert.match(minorSeventh[1].reason, /단6도/);
  assert.equal(options("G7", { nextChord: "Cmaj7" })[0]?.id, "mixolydian");
  assert.equal(options("Fmaj7", { key: "C major" })[0]?.id, "lydian");
  assert.match(options("Fmaj7", { key: "C major" })[0].reason, /C 장음계/);
  assert.equal(options("Cmaj7", { key: "C major" })[0]?.id, "ionian");
  assert.equal(
    options("Dm7", { key: "D minor", modal: true })[0]?.id,
    "dorian",
  );
});

test("minor resolution and explicit tensions override the plain dominant choice", () => {
  const minorResolution = options("D7", { nextChord: "Gm7" })[0];
  assert.equal(minorResolution?.id, "phrygian-dominant");
  assert.match(minorResolution.reason, /G 하모닉 마이너.*Gm7/);
  assert.deepEqual(
    options("G7alt").map((scale) => scale.id),
    ["altered"],
  );
  assert.equal(options("G7♯11")[0]?.id, "lydian-dominant");
  const flatNinth = options("G7♭9", { nextChord: "Cmaj7" })[0];
  assert.equal(flatNinth?.id, "half-whole-diminished");
  assert.match(flatNinth.reason, /♭9/);
  assert.doesNotMatch(flatNinth.reason, /Cmaj7/);
  assert.equal(
    options("G7♭9♭13", { nextChord: "Cm6" })[0]?.id,
    "phrygian-dominant",
  );
});

test("half-diminished and fully diminished use different scale families", () => {
  assert.deepEqual(
    options("Am7♭5").map((scale) => scale.id),
    ["locrian", "locrian-natural-2"],
  );
  assert.equal(options("Am9♭5")[0]?.id, "locrian-natural-2");
  assert.deepEqual(
    options("Bdim7").map((scale) => scale.id),
    ["whole-half-diminished"],
  );
  assert.equal(options("Cm(maj7)")[0]?.id, "melodic-minor");
  assert.equal(options("Cmaj7♯5")[0]?.id, "lydian-augmented");
});

test("slash bass constrains candidates and flat roots retain diatonic spelling", () => {
  assert.deepEqual(
    options("Cmaj7/F♯").map((scale) => scale.id),
    ["lydian"],
  );
  assert.deepEqual(options("Cmaj7/D♭"), []);
  const scale = options("D♭maj7")[0];
  assert.deepEqual(spellChordScale("D♭maj7", 1, scale), [
    "D♭",
    "E♭",
    "F",
    "G♭",
    "A♭",
    "B♭",
    "C",
  ]);
});

test("all library chord symbols have a compatible scale across 12 keys", () => {
  const symbols = new Set(
    standards.flatMap((standard) => flattenBars(standard).flat()),
  );
  for (const original of symbols) {
    for (let transpose = 0; transpose < 12; transpose++) {
      const symbol = transposeChord(original, transpose);
      const chord = parseJazzChord(symbol);
      assert.ok(chord, symbol);
      const compatible = chordScaleOptions(chord);
      assert.ok(compatible.length, symbol);
      for (const scale of compatible) {
        assert.ok(scale.reason, scale.id);
        assert.ok(
          chord.intervals.every((interval) =>
            scale.intervals.includes(interval % 12),
          ),
          symbol,
        );
      }
    }
  }
});
