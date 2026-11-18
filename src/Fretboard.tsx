import { noteName, pitchClasses } from "./lib/theory";

export default function Fretboard({
  strings,
  root,
  pitches,
  start,
  compact,
  chordTones,
  names,
  onPlay,
}: {
  strings: number[];
  root: number;
  pitches: number[];
  start: number;
  compact: boolean;
  chordTones?: number[];
  names?: Partial<Record<number, string>>;
  onPlay: (midi: number) => void;
}) {
  const count = compact ? 6 : 13;
  const top = compact ? 48 : 65;
  const rowGap = compact ? 35 : 43;
  const height = top + 25 + (strings.length - 1) * rowGap;
  const first = compact ? 54 : 96;
  const step = compact ? 42 : 66;
  const x = (fret: number) => first + fret * step;
  const end = x(count - 1) + step / 2;
  const width = end + (compact ? 5 : 37);
  return (
    <div className="music-fret-scroll">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`music-fretboard ${compact ? "is-compact" : ""}`}
        role="group"
        aria-label="스케일 지판. 위쪽이 높은 현이며 음을 클릭하면 소리가 납니다."
      >
        {Array.from({ length: count }, (_, i) => (
          <g key={i}>
            <text
              x={x(i)}
              y={compact ? 19 : 27}
              textAnchor="middle"
              className="fret-number"
            >
              {start + i}
            </text>
            {[3, 5, 7, 9, 15, 17, 19, 21].includes(start + i) && (
              <circle cx={x(i)} cy={top - 15} r="2.5" fill="#bbc2b5" />
            )}
            {[12, 24].includes(start + i) && (
              <g fill="#bbc2b5">
                <circle cx={x(i) - 4} cy={top - 15} r="2.5" />
                <circle cx={x(i) + 4} cy={top - 15} r="2.5" />
              </g>
            )}
            {i > 0 && (
              <line
                x1={x(i) - step / 2}
                x2={x(i) - step / 2}
                y1={top}
                y2={top + (strings.length - 1) * rowGap}
                stroke="#d7dccf"
              />
            )}
          </g>
        ))}
        {start === 0 && (
          <line
            x1={x(0) + step / 2}
            x2={x(0) + step / 2}
            y1={top - 6}
            y2={top + 6 + (strings.length - 1) * rowGap}
            stroke="#59634e"
            strokeWidth="4"
          />
        )}
        {[...strings].reverse().map((open, row) => (
          <g key={`${open}:${row}`}>
            <text
              x={compact ? 18 : 34}
              y={top + 5 + row * rowGap}
              textAnchor="middle"
              className="fret-string-label"
            >
              {noteName(open)}
            </text>
            <line
              x1={first - step / 2}
              x2={end}
              y1={top + row * rowGap}
              y2={top + row * rowGap}
              stroke="#a2ac98"
              strokeWidth={1 + row * 0.2}
            />
            {Array.from({ length: count }, (_, i) => {
              const midi = open + start + i;
              const pc = midi % 12;
              const isRoot = pc === root;
              const isChordTone = chordTones?.includes(pc);
              const label = names?.[pc] ?? pitchClasses[pc];
              return pitches.includes(pc) ? (
                <g
                  key={i}
                  className={`fret-note${isChordTone ? " is-chord-tone" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${names?.[pc] ?? noteName(midi)}${isChordTone ? " 코드톤" : ""}, ${row + 1}번 현 ${start + i}프렛 듣기`}
                  onClick={() => onPlay(midi)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onPlay(midi);
                    }
                  }}
                >
                  <circle
                    cx={x(i)}
                    cy={top + row * rowGap}
                    r="18"
                    fill="transparent"
                  />
                  <circle
                    cx={x(i)}
                    cy={top + row * rowGap}
                    r="15"
                    fill={
                      isRoot ? "#b9f37c" : isChordTone ? "#d4e9ba" : "#303a2b"
                    }
                    stroke={isRoot || isChordTone ? "#89ad68" : "#303a2b"}
                    strokeWidth="1.2"
                  />
                  <text
                    x={x(i)}
                    y={top + 5 + row * rowGap}
                    textAnchor="middle"
                    fill={isRoot || isChordTone ? "#24351b" : "#fff"}
                  >
                    {label}
                  </text>
                </g>
              ) : null;
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}
