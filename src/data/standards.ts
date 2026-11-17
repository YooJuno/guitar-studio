export interface Standard {
  id: string;
  title: string;
  composer: string;
  year: number;
  /** Suggested concert practice key; published arrangements may use other keys. */
  key: string;
  form: string;
  bpm: number;
  style: string;
  difficulty: "입문" | "중급" | "고급";
  description: string;
  scoreUrl: string;
  scoreLabel: string;
  sections: { label: string; bars: string[][] }[];
  abc?: string;
  rightsNote: string;
  kind: "standard" | "traditional" | "exercise";
  meter?: string;
}

const realBook1 =
  "https://www.halleonard.com/product/240221/the-real-book-volume-i-sixth-edition";
const realBook2 =
  "https://www.halleonard.com/product/240222/the-real-book-volume-ii-second-edition";
const commercialNote =
  "코드 진행은 연습용으로 단순화한 버전입니다. 멜로디와 정식 악보는 출판사 링크에서 확인하세요. 키·리하모니제이션은 판본과 연주에 따라 다릅니다.";
const bars = (...changes: string[]) => changes.map((c) => c.split(" / "));

export const standards: Standard[] = [
  {
    id: "autumn-leaves",
    title: "Autumn Leaves",
    composer: "Joseph Kosma · Jacques Prévert · Johnny Mercer",
    year: 1945,
    key: "G minor",
    form: "32 bars · AABC",
    bpm: 120,
    style: "Swing",
    difficulty: "입문",
    kind: "standard",
    description:
      "메이저와 마이너 ii–V–I를 연결하며 3도·7도 가이드 톤을 따라가 보세요.",
    scoreUrl: realBook1,
    scoreLabel: "정식 악보 · Hal Leonard Real Book I",
    rightsNote: commercialNote,
    sections: [
      {
        label: "A1",
        bars: bars(
          "Cm7",
          "F7",
          "B♭maj7",
          "E♭maj7",
          "Am7♭5",
          "D7",
          "Gm7",
          "Gm7",
        ),
      },
      {
        label: "A2",
        bars: bars(
          "Cm7",
          "F7",
          "B♭maj7",
          "E♭maj7",
          "Am7♭5",
          "D7",
          "Gm7",
          "Gm7",
        ),
      },
      {
        label: "B",
        bars: bars(
          "Am7♭5",
          "D7",
          "Gm7",
          "Gm7",
          "Cm7",
          "F7",
          "B♭maj7",
          "E♭maj7",
        ),
      },
      {
        label: "C",
        bars: bars(
          "Am7♭5",
          "D7",
          "Gm7 / G♭7",
          "Fm7 / E7",
          "E♭maj7",
          "D7",
          "Gm7",
          "D7",
        ),
      },
    ],
  },
  {
    id: "blue-bossa",
    title: "Blue Bossa",
    composer: "Kenny Dorham",
    year: 1963,
    key: "C minor",
    form: "16 bars",
    bpm: 130,
    style: "Bossa nova",
    difficulty: "입문",
    kind: "standard",
    description:
      "마이너 ii–V–i와 D♭ 메이저로의 짧은 전조. 일정한 보사 리듬으로 컴핑해 보세요.",
    scoreUrl: realBook1,
    scoreLabel: "정식 악보 · Hal Leonard Real Book I",
    rightsNote: commercialNote,
    sections: [
      {
        label: "16-bar form",
        bars: bars(
          "Cm7",
          "Cm7",
          "Fm7",
          "Fm7",
          "Dm7♭5",
          "G7",
          "Cm7",
          "Cm7",
          "E♭m7",
          "A♭7",
          "D♭maj7",
          "D♭maj7",
          "Dm7♭5",
          "G7",
          "Cm7",
          "Dm7♭5 / G7",
        ),
      },
    ],
  },
  {
    id: "all-of-me",
    title: "All of Me",
    composer: "Gerald Marks · Seymour Simons",
    year: 1931,
    key: "C major",
    form: "32 bars · ABAC",
    bpm: 140,
    style: "Swing",
    difficulty: "중급",
    kind: "standard",
    description:
      "세컨더리 도미넌트와 IV–iv를 익히기 좋은 스탠다드. 코드가 바뀌는 순간의 3도를 들으세요.",
    scoreUrl: realBook1,
    scoreLabel: "정식 악보 · Hal Leonard Real Book I",
    rightsNote: commercialNote,
    sections: [
      {
        label: "A",
        bars: bars("Cmaj7", "Cmaj7", "E7", "E7", "A7", "A7", "Dm7", "Dm7"),
      },
      {
        label: "B",
        bars: bars("E7", "E7", "Am7", "Am7", "D7", "D7", "Dm7", "G7"),
      },
      {
        label: "A",
        bars: bars("Cmaj7", "Cmaj7", "E7", "E7", "A7", "A7", "Dm7", "Dm7"),
      },
      {
        label: "C",
        bars: bars(
          "Fmaj7",
          "Fm6",
          "Cmaj7 / Em7",
          "A7",
          "Dm7",
          "G7",
          "C6",
          "Dm7 / G7",
        ),
      },
    ],
  },
  {
    id: "blue-monk",
    title: "Blue Monk",
    composer: "Thelonious Monk",
    year: 1954,
    key: "B♭ major",
    form: "12-bar blues",
    bpm: 118,
    style: "Blues",
    difficulty: "입문",
    kind: "standard",
    description:
      "12마디 블루스 폼 위에서 짧은 동기를 반복하고 변형해 보세요. 아래는 기본 블루스 컴핑 변화형입니다.",
    scoreUrl: realBook1,
    scoreLabel: "정식 악보 · Hal Leonard Real Book I",
    rightsNote: commercialNote,
    sections: [
      {
        label: "Basic blues practice changes",
        bars: bars(
          "B♭7",
          "E♭7",
          "B♭7",
          "B♭7",
          "E♭7",
          "E♭7",
          "B♭7",
          "B♭7",
          "F7",
          "E♭7",
          "B♭7",
          "F7",
        ),
      },
    ],
  },
  {
    id: "so-what",
    title: "So What",
    composer: "Miles Davis",
    year: 1959,
    key: "D minor",
    form: "32 bars · AABA",
    bpm: 136,
    style: "Modal",
    difficulty: "입문",
    kind: "standard",
    description:
      "D 도리안에서 E♭ 도리안으로 반음 이동합니다. 같은 프레이즈를 두 조성에 옮겨 보세요.",
    scoreUrl: realBook1,
    scoreLabel: "정식 악보 · Hal Leonard Real Book I",
    rightsNote: commercialNote,
    sections: [
      { label: "A1", bars: bars(...Array(8).fill("Dm7")) },
      { label: "A2", bars: bars(...Array(8).fill("Dm7")) },
      { label: "B", bars: bars(...Array(8).fill("E♭m7")) },
      { label: "A3", bars: bars(...Array(8).fill("Dm7")) },
    ],
  },
  {
    id: "take-five",
    title: "Take Five",
    composer: "Paul Desmond",
    year: 1959,
    key: "E♭ minor",
    form: "24 bars · ABA",
    bpm: 150,
    style: "5/4 jazz",
    difficulty: "중급",
    kind: "standard",
    meter: "5/4",
    description:
      "5/4를 3+2로 느껴 보세요. 마이너 뱀프 위에서 악센트와 쉼표를 연습합니다.",
    scoreUrl: realBook1,
    scoreLabel: "정식 악보 · Hal Leonard Real Book I",
    rightsNote: commercialNote,
    sections: [
      { label: "A", bars: bars(...Array(8).fill("E♭m7 / B♭m7")) },
      {
        label: "B",
        bars: bars(
          "C♭maj7 / A♭m7",
          "B♭m7 / E♭m7",
          "A♭m7 / D♭7",
          "G♭maj7",
          "C♭maj7 / A♭m7",
          "B♭m7 / E♭m7",
          "A♭m7 / D♭7",
          "F7 / B♭7",
        ),
      },
      { label: "A", bars: bars(...Array(8).fill("E♭m7 / B♭m7")) },
    ],
  },
  {
    id: "fly-me-to-the-moon",
    title: "Fly Me to the Moon",
    composer: "Bart Howard",
    year: 1954,
    key: "C major",
    form: "32 bars · ABAC",
    bpm: 124,
    style: "Swing",
    difficulty: "입문",
    kind: "standard",
    description:
      "4도 순환을 따라가는 코드 진행. 베이스 루트와 가이드 톤을 분리해서 연습해 보세요.",
    scoreUrl: realBook2,
    scoreLabel: "정식 악보 · Hal Leonard Real Book II",
    rightsNote: commercialNote,
    sections: [
      {
        label: "A",
        bars: bars(
          "Am7",
          "Dm7",
          "G7",
          "Cmaj7",
          "Fmaj7",
          "Bm7♭5",
          "E7",
          "Am7 / A7",
        ),
      },
      {
        label: "B",
        bars: bars(
          "Dm7",
          "G7",
          "Cmaj7",
          "Em7 / A7",
          "Dm7",
          "G7",
          "Cmaj7",
          "Bm7♭5 / E7",
        ),
      },
      {
        label: "A",
        bars: bars(
          "Am7",
          "Dm7",
          "G7",
          "Cmaj7",
          "Fmaj7",
          "Bm7♭5",
          "E7",
          "Am7 / A7",
        ),
      },
      {
        label: "C",
        bars: bars(
          "Dm7",
          "G7",
          "Cmaj7",
          "Em7 / A7",
          "Dm7",
          "G7",
          "C6",
          "Bm7♭5 / E7",
        ),
      },
    ],
  },
  {
    id: "all-the-things-you-are",
    title: "All the Things You Are",
    composer: "Jerome Kern · Oscar Hammerstein II",
    year: 1939,
    key: "A♭ major",
    form: "36 bars",
    bpm: 152,
    style: "Swing",
    difficulty: "고급",
    kind: "standard",
    description:
      "여러 조성을 잇는 36마디 폼. 각 구간의 목표 메이저 코드에 도착하는 흐름을 들어 보세요.",
    scoreUrl: realBook1,
    scoreLabel: "정식 악보 · Hal Leonard Real Book I",
    rightsNote: commercialNote,
    sections: [
      {
        label: "A1",
        bars: bars(
          "Fm7",
          "B♭m7",
          "E♭7",
          "A♭maj7",
          "D♭maj7",
          "Dm7 / G7",
          "Cmaj7",
          "Cmaj7",
        ),
      },
      {
        label: "A2",
        bars: bars(
          "Cm7",
          "Fm7",
          "B♭7",
          "E♭maj7",
          "A♭maj7",
          "Am7 / D7",
          "Gmaj7",
          "Gmaj7",
        ),
      },
      {
        label: "B",
        bars: bars(
          "Am7",
          "D7",
          "Gmaj7",
          "Gmaj7",
          "F♯m7♭5",
          "B7",
          "Emaj7",
          "C7♯5",
        ),
      },
      {
        label: "A3",
        bars: bars(
          "Fm7",
          "B♭m7",
          "E♭7",
          "A♭maj7",
          "D♭maj7",
          "D♭m7",
          "Cm7",
          "Bdim7",
          "B♭m7",
          "E♭7",
          "A♭maj7",
          "Gm7♭5 / C7",
        ),
      },
    ],
  },
  {
    id: "amazing-grace",
    title: "Amazing Grace · New Britain",
    composer: "Traditional · William Walker (1835 tune setting)",
    year: 1835,
    key: "C major",
    form: "16 bars + pickup · 3/4",
    bpm: 86,
    style: "Jazz waltz",
    difficulty: "입문",
    kind: "traditional",
    meter: "3/4",
    description:
      "퍼블릭 도메인 전통 선율에 새로 작성한 연습용 화성을 붙였습니다. 원전 편곡을 복제하지 않았습니다.",
    scoreUrl:
      "https://www.loc.gov/collections/amazing-grace/articles-and-essays/timeline/",
    scoreLabel: "원전·선율 역사 · Library of Congress",
    rightsNote:
      "New Britain 전통 선율(19세기). 이 앱의 코드·기보는 별도로 작성한 학습용 편곡이며 현대 편곡을 전재하지 않았습니다.",
    sections: [
      {
        label: "Chorus · 3/4",
        bars: bars(
          "Cmaj7",
          "C6",
          "Fmaj7",
          "C6",
          "Cmaj7",
          "G7",
          "C6",
          "C6",
          "Cmaj7",
          "Fmaj7",
          "Cmaj7",
          "G7",
          "Cmaj7",
          "G7",
          "C6",
          "C6",
        ),
      },
    ],
    abc: `X:1
T:Amazing Grace - New Britain
C:Traditional / JUNO practice harmony
M:3/4
L:1/4
Q:1/4=86
K:C
G, | "Cmaj7"C2 E/ C/ | "C6"E2 D | "Fmaj7"C2 A, | "C6"G,2 G, |
"Cmaj7"C2 E/ C/ | "G7"E2 D | "C6"G3- | G2 E |
"Cmaj7"G2 E/ G/ | "Fmaj7"E2 C | "Cmaj7"A,2 C/ A,/ | "G7"G,2 G, |
"Cmaj7"C2 E/ C/ | "G7"E2 D | "C6"C3- | C2 |]`,
  },
  {
    id: "juno-blues",
    title: "Studio Blues in F",
    composer: "JUNO Studio · Original exercise",
    year: 2026,
    key: "F major",
    form: "12-bar jazz blues",
    bpm: 108,
    style: "Blues",
    difficulty: "입문",
    kind: "exercise",
    description:
      "새로 만든 12마디 연습곡. 코드톤과 블루 노트를 연결하고 ii–V 턴어라운드를 익혀 보세요.",
    scoreUrl:
      "https://learningmusic.ableton.com/advanced-topics/seventh-chords.html",
    scoreLabel: "7th 코드 학습 · Ableton",
    rightsNote:
      "JUNO Studio를 위해 새로 작성한 연습용 선율·기보입니다. 기존 스탠다드의 멜로디가 아닙니다.",
    sections: [
      {
        label: "12-bar form",
        bars: bars(
          "F7",
          "B♭7",
          "F7",
          "Cm7 / F7",
          "B♭7",
          "Bdim7",
          "F7",
          "Dm7 / G7",
          "Gm7",
          "C7",
          "F7 / D7",
          "Gm7 / C7",
        ),
      },
    ],
    abc: `X:1
T:Studio Blues in F
C:JUNO Studio - Original exercise
M:4/4
L:1/4
Q:1/4=108
K:F
"F7"F A c _e | "Bb7"d B _A F | "F7"A c A F | "Cm7"G _B "F7"A F |
"Bb7"B d f _a | "Bdim7"=B d f _a | "F7"c A G F | "Dm7"A F "G7"=B G |
"Gm7"G B d f | "C7"e c B G | "F7"A F "D7"^F A | "Gm7"G B "C7"e c |]`,
  },
  {
    id: "ii-v-i-study",
    title: "ii–V–I · Guide Tone Study",
    composer: "JUNO Studio · Original exercise",
    year: 2026,
    key: "C major",
    form: "8 bars",
    bpm: 96,
    style: "Swing",
    difficulty: "입문",
    kind: "exercise",
    description:
      "Dm7–G7–Cmaj7에서 3도와 7도를 가까운 음으로 연결하는 오리지널 에튀드입니다.",
    scoreUrl:
      "https://learningmusic.ableton.com/advanced-topics/seventh-chords.html",
    scoreLabel: "7th 코드 학습 · Ableton",
    rightsNote: "JUNO Studio를 위해 새로 작성한 연습용 선율·기보입니다.",
    sections: [
      {
        label: "Major ii–V–I",
        bars: bars("Dm7", "G7", "Cmaj7", "Cmaj7", "Dm7", "G7", "Cmaj7", "A7"),
      },
    ],
    abc: `X:1
T:ii-V-I - Guide Tone Study
C:JUNO Studio - Original exercise
M:4/4
L:1/4
Q:1/4=96
K:C
"Dm7"F A c A | "G7"B G F D | "Cmaj7"E G B d | c2 B2 |
"Dm7"c A F E | "G7"F D B, D | "Cmaj7"E G B c | "A7"^c B A G |]`,
  },
  {
    id: "minor-cadence",
    title: "Minor ii–V–i · Night Study",
    composer: "JUNO Studio · Original exercise",
    year: 2026,
    key: "C minor",
    form: "8 bars",
    bpm: 92,
    style: "Minor swing",
    difficulty: "중급",
    kind: "exercise",
    description:
      "Dm7♭5–G7–Cm(maj7)의 해결을 직접 들으며 단조 가이드 톤을 연습합니다.",
    scoreUrl:
      "https://learningmusic.ableton.com/advanced-topics/seventh-chords.html",
    scoreLabel: "7th 코드 학습 · Ableton",
    rightsNote: "JUNO Studio를 위해 새로 작성한 연습용 선율·기보입니다.",
    sections: [
      {
        label: "Minor ii–V–i",
        bars: bars(
          "Dm7♭5",
          "G7♭9",
          "Cm(maj7)",
          "Cm6",
          "Fm7",
          "Dm7♭5 / G7",
          "Cm6",
          "G7",
        ),
      },
    ],
    abc: `X:1
T:Minor Cadence - Night Study
C:JUNO Studio - Original exercise
M:4/4
L:1/4
Q:1/4=92
K:Cm
"Dm7b5"F A c A | "G7b9"=B d f _a | "Cm(maj7)"g =B c' g | "Cm6"e c =A G |
"Fm7"A c e c | "Dm7b5"A F "G7"=B G | "Cm6"c e =A g | "G7"f d =B G |]`,
  },
];
