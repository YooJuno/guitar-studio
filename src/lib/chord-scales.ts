import { parseJazzChord } from "./jazz";
import type { JazzChord } from "./jazz";
import { noteName, scales } from "./theory";
import type { Scale } from "./theory";

export interface ChordScaleContext {
  key?: string;
  nextChord?: string;
  modal?: boolean;
}

const scaleById = new Map(scales.map((scale) => [scale.id, scale]));
const pc = (value: number) => ((value % 12) + 12) % 12;
const isDominant = (chord: JazzChord) =>
  chord.intervals.includes(4) && chord.intervals.includes(10);

// The order gives a starting point for practice. A chord can have several
// usable scales, and the melody can settle which option sounds best.
function candidates(chord: JazzChord): string[] {
  const has = (interval: number) => chord.intervals.includes(interval);
  if (isDominant(chord))
    return [
      "mixolydian",
      "lydian-dominant",
      "half-whole-diminished",
      "phrygian-dominant",
      "altered",
      "whole-tone",
    ];
  if (has(3) && has(6)) {
    return has(10)
      ? ["locrian", "locrian-natural-2"]
      : ["whole-half-diminished"];
  }
  if (has(3) && has(11)) return ["melodic-minor", "harmonic-minor"];
  if (has(3))
    return [
      "dorian",
      "aeolian",
      "minor-pentatonic",
      "phrygian",
      "melodic-minor",
    ];
  if (has(4) && has(8)) return ["lydian-augmented", "whole-tone"];
  if (has(4)) return ["ionian", "lydian", "major-pentatonic"];
  if (has(10)) return ["mixolydian", "dorian", "phrygian"];
  return ["ionian", "mixolydian", "dorian", "aeolian"];
}

const diatonicModes: Record<number, string> = {
  0: "ionian",
  2: "dorian",
  4: "phrygian",
  5: "lydian",
  7: "mixolydian",
  9: "aeolian",
  11: "locrian",
};

function contextualMode(chord: JazzChord, context: ChordScaleContext) {
  const next = parseJazzChord(context.nextChord ?? "");
  if (next && pc(next.root - chord.root) === 5) {
    if (
      isDominant(chord) &&
      next.intervals.includes(3) &&
      next.intervals.includes(7)
    )
      return "phrygian-dominant";
    if (isDominant(chord) && next.intervals.includes(4)) return "mixolydian";
    if (chord.intervals.includes(3) && isDominant(next)) return "dorian";
  }
  if (context.modal && chord.intervals.includes(3)) return "dorian";
  const key = context.key?.match(/^([^\s]+)\s+(major|minor)$/i);
  const tonic = key && parseJazzChord(key[1]);
  if (!key || !tonic) return undefined;
  const relativeMajor = tonic.root + (key[2].toLowerCase() === "minor" ? 3 : 0);
  return diatonicModes[pc(chord.root - relativeMajor)];
}

/** Filter by every sounding pitch class, then rank by the local progression. */
export function chordScaleOptions(
  chord: JazzChord,
  context: ChordScaleContext = {},
): Scale[] {
  const required = new Set(chord.intervals.map(pc));
  required.add(pc(chord.bass - chord.root));
  const preferred = contextualMode(chord, context);
  const choices = candidates(chord);
  if (preferred && choices.includes(preferred)) {
    choices.splice(choices.indexOf(preferred), 1);
    choices.unshift(preferred);
  }
  return choices
    .map((id) => scaleById.get(id)!)
    .filter((scale) =>
      [...required].every((interval) => scale.intervals.includes(interval)),
    )
    .slice(0, 3);
}

/** Use the scale degree to keep spellings such as G♭ in D♭ major. */
export function spellChordScale(
  symbol: string,
  root: number,
  scale: Scale,
): string[] {
  const letters = "CDEFGAB";
  const rootLetter = letters.indexOf(symbol[0]?.toUpperCase() ?? "");
  const naturalPitches = [0, 2, 4, 5, 7, 9, 11];
  const degrees = scale.formula.split(" ");
  return scale.intervals.map((interval, index) => {
    const degree = Number(degrees[index]?.match(/\d+/)?.[0]);
    const target = pc(root + interval);
    if (rootLetter < 0 || !degree) return noteName(target, false);
    const letter = (rootLetter + degree - 1) % 7;
    const delta = pc(target - naturalPitches[letter] + 6) - 6;
    return (
      letters[letter] + (delta < 0 ? "♭".repeat(-delta) : "♯".repeat(delta))
    );
  });
}
