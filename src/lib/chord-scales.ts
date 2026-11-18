import { parseJazzChord } from "./jazz";
import type { JazzChord } from "./jazz";
import { noteName, scales } from "./theory";
import type { Scale } from "./theory";

export interface ChordScaleContext {
  key?: string;
  nextChord?: string;
  modal?: boolean;
}

interface ChordScaleOption extends Scale {
  reason: string;
}

const scaleById = new Map(scales.map((scale) => [scale.id, scale]));
const pc = (value: number) => ((value % 12) + 12) % 12;
const isDominant = (chord: JazzChord) =>
  chord.intervals.includes(4) && chord.intervals.includes(10);

// The order gives a starting point for practice. A chord can have several
// usable scales, and the melody can settle which option sounds best.
function candidates(chord: JazzChord): ChordScaleId[] {
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

const diatonicModes: Partial<Record<number, ChordScaleId>> = {
  0: "ionian",
  2: "dorian",
  4: "phrygian",
  5: "lydian",
  7: "mixolydian",
  9: "aeolian",
  11: "locrian",
};

const scaleReasons = {
  ionian: "장3도·장7도를 쓰는 기본 장음계입니다.",
  dorian: "단3도·단7도와 장6도를 함께 씁니다.",
  phrygian: "단2도(♭9)와 단6도(♭13)를 더합니다.",
  lydian: "증4도(♯11)를 가진 장음계입니다.",
  mixolydian: "장3도와 단7도가 도미넌트의 뼈대를 이룹니다.",
  aeolian: "단6도(♭13)를 쓰는 자연단음계입니다.",
  locrian: "감5도(♭5)와 단7도를 가지며 2도도 낮습니다.",
  "locrian-natural-2": "감5도(♭5)는 유지하고 근음 위 온음인 2도를 씁니다.",
  "major-pentatonic": "메이저 3화음에 2도와 6도를 더한 다섯 음입니다.",
  "minor-pentatonic": "마이너 3화음에 4도와 단7도를 더한 다섯 음입니다.",
  "melodic-minor": "단3도에 장6도와 장7도를 더합니다.",
  "harmonic-minor": "단6도를 유지하고 7도를 올립니다.",
  altered: "장3도·단7도에 ♭9·♯9·♭5·♯5를 더합니다.",
  "lydian-dominant": "장3도·단7도와 함께 ♯11을 씁니다.",
  "whole-tone": "온음만 이어져 증5도(♯5)가 생깁니다.",
  "half-whole-diminished": "반음부터 교대로 쌓아 ♭9·♯9·♯11을 얻습니다.",
  "whole-half-diminished": "온음부터 교대로 쌓으면 감7화음의 음이 하나씩 건너 나옵니다.",
  "phrygian-dominant": "장3도·단7도에 ♭9와 ♭13을 더합니다.",
  "lydian-augmented": "장7도에 증5도(♯5)와 ♯11을 함께 씁니다.",
};

type ChordScaleId = keyof typeof scaleReasons;

function contextualMode(
  chord: JazzChord,
  context: ChordScaleContext,
): { id: ChordScaleId; reason: string } | undefined {
  const nextSymbol = context.nextChord ?? "";
  const next = parseJazzChord(nextSymbol);
  const nextRoot = nextSymbol.trim().match(/^[A-G][♭♯b#]{0,2}/i)?.[0];
  if (next && nextRoot && pc(next.root - chord.root) === 5) {
    if (
      isDominant(chord) &&
      next.intervals.includes(3) &&
      next.intervals.includes(7)
    )
      return {
        id: "phrygian-dominant",
        reason: `${nextRoot} 하모닉 마이너의 5번째 모드로, 다음 코드 ${nextSymbol}에 이어집니다.`,
      };
    if (isDominant(chord) && next.intervals.includes(4)) {
      return {
        id: "mixolydian",
        reason: `${nextRoot} 장음계와 같은 음을 써서 다음 코드 ${nextSymbol}에 이어집니다.`,
      };
    }
    if (chord.intervals.includes(3) && isDominant(next)) {
      const majorThird = spellChordScale(
        nextRoot,
        next.root,
        scaleById.get("ionian")!,
      )[2];
      return {
        id: "dorian",
        reason: `장6도 ${majorThird}가 다음 ${nextSymbol}의 장3도입니다.`,
      };
    }
  }
  if (context.modal && chord.intervals.includes(3)) {
    return {
      id: "dorian",
      reason: "마이너 화음 위에서 장6도로 도리안의 색을 냅니다.",
    };
  }
  const key = context.key?.match(/^([^\s]+)\s+(major|minor)$/i);
  const tonic = key && parseJazzChord(key[1]);
  if (!key || !tonic) return undefined;
  const minor = key[2].toLowerCase() === "minor";
  const relativeMajor = tonic.root + (minor ? 3 : 0);
  const id = diatonicModes[pc(chord.root - relativeMajor)];
  if (!id) return undefined;
  return {
    id,
    reason: `곡의 ${key[1]} ${minor ? "자연단음계" : "장음계"}와 같은 음을 씁니다.`,
  };
}

/** Filter by every sounding pitch class, then rank by the local progression. */
export function chordScaleOptions(
  chord: JazzChord,
  context: ChordScaleContext = {},
): ChordScaleOption[] {
  const required = new Set(chord.intervals.map(pc));
  required.add(pc(chord.bass - chord.root));
  const preferred = contextualMode(chord, context);
  const choices = candidates(chord);
  if (preferred && choices.includes(preferred.id)) {
    choices.splice(choices.indexOf(preferred.id), 1);
    choices.unshift(preferred.id);
  }
  return choices
    .map((id) => ({
      ...scaleById.get(id)!,
      reason: id === preferred?.id ? preferred.reason : scaleReasons[id],
    }))
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
