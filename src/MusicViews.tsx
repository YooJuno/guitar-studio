import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AudioLines,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  FileMusic,
  Play,
} from "lucide-react";
import {
  chordQualities,
  getChordNotes,
  getChordVoicings,
  getScale,
  midiToFrequency,
  noteName,
  pitchClasses,
  scales,
} from "./lib/theory";
import { playNotes, stopNotes } from "./lib/synth";
import FavoriteButton from "./FavoriteButton";
import "./music.css";

export interface MusicViewProps {
  strings: number[];
  favorites: string[];
  onFavorite: (id: string) => void;
  onTempo: (bpm: number) => void;
  onPlaybackActive?: (active: boolean) => void;
}

function RootSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      루트
      <select value={value} onChange={(event) => onChange(+event.target.value)}>
        {pitchClasses.map((name, i) => (
          <option value={i} key={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
function savedSelections(
  favorites: string[],
  prefix: string,
  validIds: string[],
): { root: number; id: string }[] {
  const valid = new Set(validIds);
  const seen = new Set<string>();
  const result: { root: number; id: string }[] = [];
  for (const value of Array.isArray(favorites) ? favorites : []) {
    if (typeof value !== "string" || seen.has(value)) continue;
    const parts = value.split(":");
    if (
      parts.length !== 3 ||
      parts[0] !== prefix ||
      !/^(?:[0-9]|1[01])$/.test(parts[1]) ||
      !valid.has(parts[2])
    )
      continue;
    seen.add(value);
    result.push({ root: Number(parts[1]), id: parts[2] });
  }
  return result;
}

function chordName(root: number, qualityId: string): string {
  const quality = chordQualities.find((c) => c.id === qualityId);
  return `${pitchClasses[root]}${qualityId === "major" ? "" : qualityId === "minor" ? "m" : (quality?.name ?? "")}`;
}

function ChordDiagram({
  frets,
  strings,
  root,
  label,
}: {
  frets: number[];
  strings: number[];
  root: number;
  label: string;
}) {
  const pressed = frets.filter((f) => f > 0);
  const max = Math.max(0, ...pressed);
  const first = max <= 4 ? 1 : Math.min(...pressed);
  const x = (i: number) => 42 + (i * 176) / (strings.length - 1);
  const top = 68;
  const spacing = 37;
  return (
    <svg
      viewBox="0 0 260 273"
      className="chord-diagram"
      role="img"
      aria-label={`${label}, 낮은 현부터 ${frets.map((f) => (f < 0 ? "뮤트" : f === 0 ? "개방" : `${f}프렛`)).join(", ")}`}
    >
      <text x="15" y={top + 24} className="diagram-fret">
        {first}fr
      </text>
      {Array.from({ length: 5 }, (_, i) => (
        <line
          key={`f${i}`}
          x1="42"
          x2="218"
          y1={top + i * spacing}
          y2={top + i * spacing}
          stroke={i === 0 && first === 1 ? "#30362e" : "#d7dbd1"}
          strokeWidth={i === 0 && first === 1 ? 5 : 1.4}
        />
      ))}
      {strings.map((midi, i) => (
        <g key={i}>
          <line
            x1={x(i)}
            x2={x(i)}
            y1={top}
            y2={top + 4 * spacing}
            stroke="#687360"
            strokeWidth={Math.max(1, 2 - i * 0.16)}
          />
          {frets[i] < 0 ? (
            <g stroke="#46513f" strokeWidth="1.6">
              <path d={`M ${x(i) - 4} 43 l 8 8 M ${x(i) + 4} 43 l -8 8`} />
            </g>
          ) : frets[i] === 0 ? (
            <circle
              cx={x(i)}
              cy="47"
              r="5"
              fill="none"
              stroke="#6c7565"
              strokeWidth="1.5"
            />
          ) : (
            <g>
              <circle
                cx={x(i)}
                cy={top + (frets[i] - first + 0.5) * spacing}
                r="13"
                fill={(midi + frets[i]) % 12 === root ? "#b9f37c" : "#30362e"}
              />
              <text
                x={x(i)}
                y={top + (frets[i] - first + 0.5) * spacing + 4}
                textAnchor="middle"
                fill={(midi + frets[i]) % 12 === root ? "#24351b" : "white"}
                className="diagram-note"
              >
                {noteName(midi + frets[i], false)}
              </text>
            </g>
          )}
          <text x={x(i)} y="244" textAnchor="middle" className="diagram-string">
            {noteName(midi, false)}
          </text>
          <text x={x(i)} y="261" textAnchor="middle" className="diagram-tab">
            {frets[i] < 0 ? "×" : frets[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function ChordsView({ strings, favorites, onFavorite }: MusicViewProps) {
  const [root, setRoot] = useState(0);
  const [quality, setQuality] = useState("major");
  const [arpeggio, setArpeggio] = useState(false);
  const [viewing, setViewing] = useState({ key: "", index: 0 });
  const [error, setError] = useState("");
  const shapes = useMemo(
    () => getChordVoicings(root, quality, strings),
    [root, quality, strings],
  );
  const saved = useMemo(
    () =>
      savedSelections(
        favorites,
        "chord",
        chordQualities.map((c) => c.id),
      ),
    [favorites],
  );
  const notes = getChordNotes(root, quality);
  const name = chordName(root, quality);
  const favoriteId = `chord:${root}:${quality}`;
  const voicingKey = JSON.stringify([favoriteId, strings]);
  const index =
    viewing.key === voicingKey ? Math.min(viewing.index, shapes.length - 1) : 0;
  const frets = shapes[index];
  function moveVoicing(step: number) {
    setViewing({
      key: voicingKey,
      index: (index + step + shapes.length) % shapes.length,
    });
  }

  useEffect(() => () => stopNotes(), []);
  async function listen(frets: number[]) {
    setError("");
    try {
      await playNotes(
        frets.flatMap((f, i) =>
          f < 0 ? [] : [midiToFrequency(strings[i] + f)],
        ),
        arpeggio,
      );
    } catch {
      setError("소리를 재생할 수 없습니다. 오디오 출력 장치를 확인해 주세요.");
    }
  }
  return (
    <div className="music-workspace">
      <section className="card music-controls">
        <div className="music-control-line">
          <RootSelect value={root} onChange={setRoot} />
          <label>
            코드 종류
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
            >
              {chordQualities.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {saved.length > 0 && (
          <div className="music-saved" role="group" aria-label="저장한 코드">
            <Bookmark size={13} aria-hidden="true" />
            {saved.map((item) => (
              <button
                key={`${item.root}:${item.id}`}
                className={
                  root === item.root && quality === item.id ? "active" : ""
                }
                title={`${chordName(item.root, item.id)} 불러오기`}
                aria-label={`${chordName(item.root, item.id)} 불러오기`}
                aria-pressed={root === item.root && quality === item.id}
                onClick={() => {
                  setRoot(item.root);
                  setQuality(item.id);
                  setError("");
                }}
              >
                {chordName(item.root, item.id)}
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="card music-chord-result">
        <div className="section-heading">
          <div className="music-result-title">
            <h2>{name}</h2>
            <div className="music-note-list">
              {notes.map((n, i) => (
                <span key={n} className={i === 0 ? "tonic" : ""}>
                  {pitchClasses[n]}
                </span>
              ))}
            </div>
          </div>
          <FavoriteButton
            saved={favorites.includes(favoriteId)}
            onClick={() => onFavorite(favoriteId)}
            label={name}
          />
        </div>
        {frets && (
          <figure className="music-shape music-voicing">
            <ChordDiagram
              frets={frets}
              strings={strings}
              root={root}
              label={name}
            />
            <figcaption>
              <div
                className="voicing-switch"
                role="group"
                aria-label="운지 선택"
              >
                <button
                  type="button"
                  className="icon-button"
                  aria-label="이전 운지"
                  disabled={shapes.length <= 1}
                  onClick={() => moveVoicing(-1)}
                >
                  <ChevronLeft size={20} />
                </button>
                <span aria-live="polite">
                  {index + 1} / {shapes.length}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="다음 운지"
                  disabled={shapes.length <= 1}
                  onClick={() => moveVoicing(1)}
                >
                  <ChevronRight size={20} />
                </button>
              </div>
              <button
                className="button secondary music-listen"
                onClick={() => void listen(frets)}
                aria-label={`${name} ${arpeggio ? "아르페지오" : "코드"} 듣기`}
              >
                <Play size={17} /> 듣기
              </button>
              <button
                type="button"
                className="icon-button voicing-arpeggio"
                aria-pressed={arpeggio}
                aria-label="한 음씩 듣기"
                title="한 음씩 듣기"
                onClick={() => setArpeggio((enabled) => !enabled)}
              >
                <AudioLines size={18} />
              </button>
            </figcaption>
          </figure>
        )}
        {!shapes.length && (
          <div className="music-empty">
            <FileMusic size={26} />
            <h3>이 튜닝의 운지 없음</h3>
          </div>
        )}
        {error && (
          <p role="alert" className="music-error">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

function Fretboard({
  strings,
  root,
  pitches,
  start,
  compact,
  onPlay,
}: {
  strings: number[];
  root: number;
  pitches: number[];
  start: number;
  compact: boolean;
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
              return pitches.includes(pc) ? (
                <g
                  key={i}
                  className="fret-note"
                  role="button"
                  tabIndex={0}
                  aria-label={`${noteName(midi)}, ${row + 1}번 현 ${start + i}프렛 듣기`}
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
                    fill={isRoot ? "#b9f37c" : "#303a2b"}
                    stroke={isRoot ? "#8ec34f" : "#303a2b"}
                    strokeWidth="1.2"
                  />
                  <text
                    x={x(i)}
                    y={top + 5 + row * rowGap}
                    textAnchor="middle"
                    fill={isRoot ? "#24351b" : "#fff"}
                  >
                    {pitchClasses[pc]}
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

const compactFretboard = "(max-width: 800px)";
function subscribeFretboard(onChange: () => void) {
  const media = matchMedia(compactFretboard);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const isCompactFretboard = () => matchMedia(compactFretboard).matches;

export function ScalesView({ strings, favorites, onFavorite }: MusicViewProps) {
  const [root, setRoot] = useState(0);
  const [scaleId, setScaleId] = useState("ionian");
  const [range, setRange] = useState(0);
  const [panel, setPanel] = useState<"board" | "tones">("board");
  const compact = useSyncExternalStore(subscribeFretboard, isCompactFretboard);
  const starts = compact ? [0, 5, 10, 15, 19] : [0, 5, 12];
  const start = starts.findLast((value) => value <= range) ?? 0;
  const [error, setError] = useState("");
  const saved = useMemo(
    () =>
      savedSelections(
        favorites,
        "scale",
        scales.map((s) => s.id),
      ),
    [favorites],
  );
  const scale = scales.find((s) => s.id === scaleId)!;
  const pitches = getScale(root, scaleId);
  const favoriteId = `scale:${root}:${scaleId}`;
  useEffect(() => () => stopNotes(), []);
  async function listen(midis: number[], sequence = false) {
    setError("");
    try {
      await playNotes(
        midis.map((m) => midiToFrequency(m)),
        sequence,
      );
    } catch {
      setError("오디오를 재생하지 못했습니다. 출력 장치를 확인해 주세요.");
    }
  }
  return (
    <div className="music-workspace">
      <section className="card music-controls music-scale-controls">
        <div className="music-control-line">
          <RootSelect value={root} onChange={setRoot} />
          <label>
            스케일
            <select
              value={scaleId}
              onChange={(e) => setScaleId(e.target.value)}
            >
              {scales.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.english}
                </option>
              ))}
            </select>
          </label>
          <label>
            범위
            <select
              aria-label="지판 범위"
              value={start}
              onChange={(e) => setRange(+e.target.value)}
            >
              {starts.map((value) => (
                <option key={value} value={value}>
                  {value}–{value + (compact ? 5 : 12)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {saved.length > 0 && (
          <div className="music-saved" role="group" aria-label="저장한 스케일">
            <Bookmark size={13} aria-hidden="true" />
            {saved.map((item) => {
              const label = `${pitchClasses[item.root]} ${scales.find((s) => s.id === item.id)!.name}`;
              return (
                <button
                  key={`${item.root}:${item.id}`}
                  className={
                    root === item.root && scaleId === item.id ? "active" : ""
                  }
                  title={`${label} 불러오기`}
                  aria-label={`${label} 불러오기`}
                  aria-pressed={root === item.root && scaleId === item.id}
                  onClick={() => {
                    setRoot(item.root);
                    setScaleId(item.id);
                    setError("");
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </section>
      <section className="card music-scale-result">
        <div className="section-heading">
          <div>
            <h2>
              {pitchClasses[root]} {scale.name}
            </h2>
          </div>
          <FavoriteButton
            saved={favorites.includes(favoriteId)}
            onClick={() => onFavorite(favoriteId)}
            label={`${pitchClasses[root]} ${scale.name}`}
          />
        </div>
        <div className="music-scale-actions">
          <div className="panel-tabs" role="group" aria-label="스케일 표시">
            <button
              type="button"
              aria-pressed={panel === "board"}
              onClick={() => setPanel("board")}
            >
              지판
            </button>
            <button
              type="button"
              aria-pressed={panel === "tones"}
              onClick={() => setPanel("tones")}
            >
              구성음
            </button>
          </div>
          <button
            className="button secondary"
            aria-label="스케일 듣기"
            onClick={() =>
              void listen(
                [...scale.intervals, 12].map((i) => 48 + root + i),
                true,
              )
            }
          >
            <Play size={16} /> 듣기
          </button>
        </div>
        {panel === "board" ? (
          <Fretboard
            strings={strings}
            root={root}
            pitches={pitches}
            start={start}
            compact={compact}
            onPlay={(midi) => void listen([midi])}
          />
        ) : (
          <div className="music-scale-detail">
            <div className="music-scale-tones">
              {pitches.map((n, i) => (
                <button
                  key={n}
                  className={i === 0 ? "tonic" : ""}
                  onClick={() => void listen([48 + root + scale.intervals[i]])}
                  aria-label={`${scale.formula.split(" ")[i]}도 ${pitchClasses[n]} 듣기`}
                >
                  <small>{scale.formula.split(" ")[i]}</small>
                  <strong>{pitchClasses[n]}</strong>
                </button>
              ))}
            </div>
            <span className="music-related-chords" title="어울리는 코드">
              {scale.chords}
            </span>
            <p>{scale.description}</p>
          </div>
        )}
        {error && (
          <p className="music-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
