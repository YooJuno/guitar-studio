import type { Standard } from "../data/standards";

export interface JazzChord {
  root: number;
  bass: number;
  /** Semitone offsets from the root; extensions retain their compound octave. */
  intervals: number[];
}

const naturals: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
const names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const mod12 = (value: number) => ((value % 12) + 12) % 12;
const normalizeAccidentals = (value: string) =>
  value.replace(/♭/g, "b").replace(/♯/g, "#");
function notePitch(letter: string, accidentals: string): number {
  return mod12(
    naturals[letter.toUpperCase()] +
      [...accidentals].reduce((sum, sign) => sum + (sign === "#" ? 1 : -1), 0),
  );
}

/** Parses supported chord symbols completely. Unknown symbols return null, never a guessed major chord. */
export function parseJazzChord(chord: string): JazzChord | null {
  if (typeof chord !== "string") return null;
  let source = normalizeAccidentals(chord.trim()).replace(/\s+/g, "");
  if (!source || /^(?:N\.?C\.?|rest|%)$/i.test(source)) return null;
  const rootMatch = source.match(/^([A-Ga-g])([#b]{0,2})/);
  if (!rootMatch) return null;
  const root = notePitch(rootMatch[1], rootMatch[2]);
  source = source.slice(rootMatch[0].length);
  const bassMatch = source.match(/\/([A-Ga-g])([#b]{0,2})$/);
  const bass = bassMatch ? notePitch(bassMatch[1], bassMatch[2]) : root;
  if (bassMatch) source = source.slice(0, -bassMatch[0].length);
  if ((source.match(/\(/g)?.length ?? 0) !== (source.match(/\)/g)?.length ?? 0))
    return null;
  source = source
    .replace(/[()]/g, "")
    .replace(/(?:Δ|△)/g, "maj")
    .replace(/(?:°|º)/g, "dim")
    .replace(/^M(?=\d|$)/, "maj")
    .replace(/^major/i, "maj")
    .replace(/^minor/i, "m")
    .replace(/^min/i, "m")
    .replace(/^[−-]/, "m")
    .replace(/^mMaj/, "mmaj")
    .replace(/^69$/, "6/9");

  let minor = false;
  let majorSeventh = false;
  let diminished = false;
  let halfDiminished = false;
  let augmented = false;
  if (source.startsWith("mmaj")) {
    minor = true;
    majorSeventh = true;
    source = source.slice(4);
  } else if (source.startsWith("maj")) {
    majorSeventh = true;
    source = source.slice(3);
  } else if (source.startsWith("m")) {
    minor = true;
    source = source.slice(1);
  } else if (source.startsWith("dim")) {
    diminished = true;
    source = source.slice(3);
  } else if (source.startsWith("o")) {
    diminished = true;
    source = source.slice(1);
  } else if (source.startsWith("ø")) {
    halfDiminished = true;
    source = source.slice(1);
  } else if (source.startsWith("aug")) {
    augmented = true;
    source = source.slice(3);
  } else if (source.startsWith("+")) {
    augmented = true;
    source = source.slice(1);
  }

  const extensionMatch = source.match(/^(6\/9|13|11|9|7|6|5)/);
  const extension = extensionMatch?.[0] ?? "";
  if (extensionMatch) source = source.slice(extension.length);
  let intervals =
    diminished || halfDiminished
      ? [0, 3, 6]
      : augmented
        ? [0, 4, 8]
        : minor
          ? [0, 3, 7]
          : [0, 4, 7];
  if (extension === "5") intervals = [0, 7];
  if (extension === "6" || extension === "6/9") intervals.push(9);
  if (["7", "9", "11", "13"].includes(extension))
    intervals.push(majorSeventh ? 11 : diminished ? 9 : 10);
  if (halfDiminished && !intervals.includes(10)) intervals.push(10);
  if (["9", "11", "13", "6/9"].includes(extension)) intervals.push(14);
  if (["11", "13"].includes(extension)) intervals.push(17);
  if (extension === "13") intervals.push(21);

  const degreeIntervals: Record<string, number> = {
    "2": 2,
    "4": 5,
    "6": 9,
    "9": 14,
    "11": 17,
    "13": 21,
  };
  let suspensions = 0;
  while (source) {
    let match: RegExpMatchArray | null;
    if ((match = source.match(/^sus(2|4)?/))) {
      if (++suspensions > 1) return null;
      intervals = intervals.filter((n) => n !== 3 && n !== 4);
      intervals.push(match[1] === "2" ? 2 : 5);
    } else if ((match = source.match(/^add(13|11|9|6|4|2)/))) {
      intervals.push(degreeIntervals[match[1]]);
    } else if ((match = source.match(/^(?:omit|no)(3|5)/))) {
      const pitch =
        match[1] === "3"
          ? minor || diminished || halfDiminished
            ? 3
            : 4
          : diminished || halfDiminished
            ? 6
            : augmented
              ? 8
              : 7;
      intervals = intervals.filter((n) => n !== pitch);
    } else if ((match = source.match(/^([b#])(13|11|9|5)/))) {
      const natural = match[2] === "5" ? 7 : degreeIntervals[match[2]];
      intervals = intervals.filter((n) => n !== natural);
      intervals.push(natural + (match[1] === "b" ? -1 : 1));
    } else if ((match = source.match(/^alt/))) {
      if (!intervals.includes(10) || minor || diminished || halfDiminished)
        return null;
      intervals = [0, 4, 6, 8, 10, 13, 15];
    } else return null;
    source = source.slice(match[0].length);
  }
  return {
    root,
    bass,
    intervals: [...new Set(intervals)].sort((a, b) => a - b),
  };
}

/** Preserves quality text and independently transposes a slash bass. Also accepts key labels. */
export function transposeChord(name: string, semitones: number): string {
  if (typeof name !== "string" || !Number.isFinite(semitones)) return name;
  const shift = mod12(Math.trunc(semitones));
  if (shift === 0) return name;
  const source = name.trim();
  const root = source.match(/^([A-Ga-g])([#♯b♭]{0,2})/);
  if (!root) return name;
  const keyLabel =
    /^(?:major|minor|maj|min|dorian|phrygian|lydian|mixolydian|aeolian|locrian)$/i.test(
      source.slice(root[0].length).trim(),
    );
  if (!keyLabel && !parseJazzChord(source)) return name;
  let tail = source.slice(root[0].length);
  tail = tail.replace(
    /\/([A-Ga-g])([#♯b♭]{0,2})$/,
    (_, letter: string, accidental: string) =>
      `/${names[mod12(notePitch(letter, normalizeAccidentals(accidental)) + shift)]}`,
  );
  return `${names[mod12(notePitch(root[1], normalizeAccidentals(root[2])) + shift)]}${tail}`;
}

export function flattenBars(standard: Pick<Standard, "sections">): string[][] {
  return standard.sections.flatMap((section) =>
    section.bars.map((bar) => [...bar]),
  );
}

export function getMeter(standard: Pick<Standard, "meter" | "form">): {
  beats: number;
  denominator: number;
} {
  for (const source of [standard.meter ?? "", standard.form]) {
    const match = source.match(
      /(?:^|[^\d])(\d{1,2})\s*\/\s*(2|4|8|16)(?:[^\d]|$)/,
    );
    if (match && Number(match[1]) >= 1 && Number(match[1]) <= 32)
      return { beats: Number(match[1]), denominator: Number(match[2]) };
  }
  return { beats: 4, denominator: 4 };
}
