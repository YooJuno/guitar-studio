import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  ChevronDown,
  ExternalLink,
  FileMusic,
  Info,
  Play,
  Search,
  Upload,
  X,
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
import { standards } from "./data/standards";
import type { Standard } from "./data/standards";
import { parseJazzChord, transposeChord } from "./lib/jazz";
import JazzPractice from "./JazzPractice";
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
function FavoriteButton({
  saved,
  onClick,
  label,
}: {
  saved: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      className={`icon-button music-favorite ${saved ? "saved" : ""}`}
      aria-label={`${label} 즐겨찾기 ${saved ? "해제" : "추가"}`}
      title={saved ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      aria-pressed={saved}
      onClick={onClick}
    >
      <Bookmark size={18} fill={saved ? "currentColor" : "none"} />
    </button>
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
          <label className="music-check">
            <input
              type="checkbox"
              checked={arpeggio}
              onChange={(e) => setArpeggio(e.target.checked)}
            />
            한 음씩 듣기
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
        <div className="music-diagram-grid">
          {shapes.map((frets) => (
            <figure key={frets.join(",")} className="music-shape">
              <ChordDiagram
                frets={frets}
                strings={strings}
                root={root}
                label={name}
              />
              <button
                className="button secondary music-listen"
                onClick={() => void listen(frets)}
                aria-label={`${name} ${arpeggio ? "아르페지오" : "코드"} 듣기`}
                title={arpeggio ? "아르페지오 듣기" : "코드 듣기"}
              >
                <Play size={18} /> 듣기
              </button>
            </figure>
          ))}
        </div>
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
  onPlay,
}: {
  strings: number[];
  root: number;
  pitches: number[];
  start: number;
  onPlay: (midi: number) => void;
}) {
  const height = 90 + (strings.length - 1) * 43;
  const x = (f: number) => 96 + f * 66;
  return (
    <div className="music-fret-scroll">
      <svg
        viewBox={`0 0 960 ${height}`}
        className="music-fretboard"
        role="group"
        aria-label="스케일 지판. 위쪽이 높은 현이며 음을 클릭하면 소리가 납니다."
      >
        {Array.from({ length: 13 }, (_, i) => (
          <g key={i}>
            <text x={x(i)} y="27" textAnchor="middle" className="fret-number">
              {start + i}
            </text>
            {[3, 5, 7, 9, 15, 17, 19, 21].includes(start + i) && (
              <circle cx={x(i)} cy="42" r="2.5" fill="#bbc2b5" />
            )}
            {[12, 24].includes(start + i) && (
              <g fill="#bbc2b5">
                <circle cx={x(i) - 4} cy="42" r="2.5" />
                <circle cx={x(i) + 4} cy="42" r="2.5" />
              </g>
            )}
            {i > 0 && (
              <line
                x1={x(i) - 33}
                x2={x(i) - 33}
                y1="65"
                y2={65 + (strings.length - 1) * 43}
                stroke="#d7dccf"
              />
            )}
          </g>
        ))}
        {start === 0 && (
          <line
            x1={x(0) + 33}
            x2={x(0) + 33}
            y1="59"
            y2={71 + (strings.length - 1) * 43}
            stroke="#59634e"
            strokeWidth="4"
          />
        )}
        {[...strings].reverse().map((open, row) => (
          <g key={`${open}:${row}`}>
            <text
              x="34"
              y={70 + row * 43}
              textAnchor="middle"
              className="fret-string-label"
            >
              {noteName(open)}
            </text>
            <line
              x1="66"
              x2="923"
              y1={65 + row * 43}
              y2={65 + row * 43}
              stroke="#a2ac98"
              strokeWidth={1 + row * 0.2}
            />
            {Array.from({ length: 13 }, (_, i) => {
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
                    cy={65 + row * 43}
                    r="15"
                    fill={isRoot ? "#b9f37c" : "#303a2b"}
                    stroke={isRoot ? "#8ec34f" : "#303a2b"}
                    strokeWidth="1.2"
                  />
                  <text
                    x={x(i)}
                    y={70 + row * 43}
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

export function ScalesView({ strings, favorites, onFavorite }: MusicViewProps) {
  const [root, setRoot] = useState(0);
  const [scaleId, setScaleId] = useState("ionian");
  const [start, setStart] = useState(0);
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
      <section className="card music-controls">
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
            지판 범위
            <select value={start} onChange={(e) => setStart(+e.target.value)}>
              <option value="0">0–12 프렛</option>
              <option value="5">5–17 프렛</option>
              <option value="12">12–24 프렛</option>
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
        <div className="music-scale-actions">
          <span className="music-related-chords" title="어울리는 코드">
            {scale.chords}
          </span>
          <button
            className="button secondary"
            onClick={() =>
              void listen(
                [...scale.intervals, 12].map((i) => 48 + root + i),
                true,
              )
            }
          >
            <Play size={14} /> 스케일 듣기
          </button>
        </div>
        <Fretboard
          strings={strings}
          root={root}
          pitches={pitches}
          start={start}
          onPlay={(midi) => void listen([midi])}
        />

        {error && (
          <p className="music-error" role="alert">
            {error}
          </p>
        )}
      </section>
      <details className="music-help">
        <summary title="모드 정보" aria-label="모드 정보">
          <Info size={19} />
        </summary>
        <p>{scale.description}</p>
      </details>
    </div>
  );
}

function Notation({ abc, transpose }: { abc: string; transpose: number }) {
  const target = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const node = target.current;
    if (!node) return;
    let cancelled = false;
    void import("abcjs")
      .then(({ renderAbc }) => {
        if (cancelled) return;
        renderAbc(node, abc.replace(/^[TCQ]:.*\n/gm, ""), {
          responsive: "resize",
          add_classes: true,
          visualTranspose: transpose,
          paddingtop: 18,
          paddingbottom: 22,
          staffwidth: 800,
        });
        setError("");
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "악보를 표시하지 못했습니다. 아래 코드 차트를 이용해 주세요.",
          );
      });
    return () => {
      cancelled = true;
      node.replaceChildren();
    };
  }, [abc, transpose]);
  return (
    <div className="music-notation">
      <div ref={target} />
      {error && (
        <p role="alert" className="music-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function JazzView({
  favorites,
  onFavorite,
  onTempo,
  onPlaybackActive,
}: MusicViewProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const libraryId = useId();
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [selectedId, setSelectedId] = useState(standards[0].id);
  const [transpose, setTranspose] = useState(0);
  const [currentBar, setCurrentBar] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pdf, setPdf] = useState<{ url: string; name: string } | null>(null);
  const uploadSequence = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const selected = standards.find((s) => s.id === selectedId)!;
  const sectionOffsets = useMemo(() => {
    let offset = 0;
    return selected.sections.map((section) => {
      const start = offset;
      offset += section.bars.length;
      return start;
    });
  }, [selected]);
  const filtered = standards.filter(
    (s) =>
      (style === "all" || s.style === style) &&
      (query.trim() === "" ||
        `${s.title} ${s.composer} ${s.style} ${s.key}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase())) &&
      (!onlyFavorites || favorites.includes(`jazz:${s.id}`)),
  );
  useEffect(() => () => stopNotes(), []);
  useEffect(
    () => () => {
      if (pdf) URL.revokeObjectURL(pdf.url);
    },
    [pdf],
  );
  useEffect(
    () => () => {
      uploadSequence.current++;
    },
    [],
  );
  function select(standard: Standard) {
    setLibraryOpen(false);
    setSelectedId(standard.id);
    setTranspose(0);
    setCurrentBar(null);
    setError("");
    stopNotes();
  }
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    const seq = ++uploadSequence.current;
    if (file.size > 20 * 1024 * 1024) {
      setError("PDF는 20MB 이하 파일을 선택해 주세요.");
      return;
    }
    try {
      const header = new TextDecoder().decode(
        await file.slice(0, 5).arrayBuffer(),
      );
      if (header !== "%PDF-") {
        setError("PDF 파일을 선택해 주세요.");
        return;
      }
      if (seq !== uploadSequence.current) return;
      setPdf({ url: URL.createObjectURL(file), name: file.name });
    } catch {
      setError("파일을 열지 못했습니다. 다른 PDF를 선택해 주세요.");
    }
  }
  async function hear(chord: string) {
    setError("");
    try {
      const parsed = parseJazzChord(chord);
      if (!parsed) return;
      const chordMidis = parsed.intervals.map(
        (interval) => 48 + parsed.root + interval,
      );
      if (parsed.bass !== parsed.root) chordMidis.unshift(36 + parsed.bass);
      await playNotes(chordMidis.map((midi) => midiToFrequency(midi)));
    } catch {
      setError("코드 소리를 재생하지 못했습니다. 오디오 출력을 확인해 주세요.");
    }
  }
  return (
    <div className="music-jazz-layout">
      <section
        className={`card music-library ${libraryOpen ? "library-open" : ""}`}
      >
        <div className="section-heading music-library-heading">
          <h3>레퍼토리</h3>
        </div>
        <button
          type="button"
          className="music-library-toggle"
          aria-expanded={libraryOpen}
          aria-controls={libraryId}
          aria-label={`레퍼토리 변경 · ${selected.title}`}
          title="곡 선택"
          onClick={() => setLibraryOpen((open) => !open)}
        >
          <FileMusic size={18} />
          <strong>{selected.title}</strong>
          <ChevronDown size={17} />
        </button>
        <div className="music-library-content" id={libraryId}>
          <label className="music-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="곡 · 작곡가 검색"
              aria-label="재즈 곡 검색"
            />
          </label>
          <div className="music-library-filters">
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              aria-label="장르 필터"
            >
              <option value="all">모든 스타일</option>
              {[...new Set(standards.map((s) => s.style))].map((s) => (
                <option value={s} key={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              className={`icon-button ${onlyFavorites ? "saved" : ""}`}
              aria-label="즐겨찾기만 보기"
              title="즐겨찾기만 보기"
              aria-pressed={onlyFavorites}
              onClick={() => setOnlyFavorites(!onlyFavorites)}
            >
              <Bookmark
                size={17}
                fill={onlyFavorites ? "currentColor" : "none"}
              />
            </button>
          </div>
          <div className="music-song-list">
            {filtered.map((s) => (
              <article
                className={`music-song ${s.id === selectedId ? "selected" : ""}`}
                key={s.id}
              >
                <button
                  className="music-song-select"
                  onClick={() => select(s)}
                  aria-pressed={s.id === selectedId}
                >
                  <strong>{s.title}</strong>
                  <span>{s.key}</span>
                </button>
                <FavoriteButton
                  saved={favorites.includes(`jazz:${s.id}`)}
                  onClick={() => onFavorite(`jazz:${s.id}`)}
                  label={s.title}
                />
              </article>
            ))}
          </div>
          {!filtered.length && (
            <div className="music-empty">
              <p>조건에 맞는 곡이 없어요.</p>
              <button
                className="button secondary"
                onClick={() => {
                  setQuery("");
                  setStyle("all");
                  setOnlyFavorites(false);
                }}
              >
                전체 곡 보기
              </button>
            </div>
          )}
        </div>
      </section>
      <div className="stack music-score-column">
        <section className="card music-score-card">
          <div className="section-heading music-score-heading">
            <h2 className="music-song-title">{selected.title}</h2>
            <FavoriteButton
              saved={favorites.includes(`jazz:${selected.id}`)}
              onClick={() => onFavorite(`jazz:${selected.id}`)}
              label={selected.title}
            />
          </div>
          <JazzPractice
            key={selected.id}
            standard={selected}
            transpose={transpose}
            onTranspose={setTranspose}
            onPosition={setCurrentBar}
            onActiveChange={onPlaybackActive}
            onTempo={onTempo}
          />
          {selected.abc && (
            <Notation abc={selected.abc} transpose={transpose} />
          )}
          <div className="section-heading music-chart-heading">
            <h3>코드 차트</h3>
            {!selected.abc && (
              <a
                className="button secondary music-score-link"
                href={selected.scoreUrl}
                target="_blank"
                rel="noreferrer"
                title={selected.scoreLabel}
                aria-label={`${selected.title} 정식 악보 열기`}
              >
                <FileMusic size={18} /> 악보 <ExternalLink size={15} />
              </a>
            )}
          </div>
          <div className="music-charts">
            {selected.sections.map((section, sectionIndex) => (
              <div
                className="music-chart-section"
                key={`${section.label}:${sectionIndex}`}
              >
                <span className="music-section-letter">{section.label}</span>
                <div className="music-bar-grid">
                  {section.bars.map((bar, barIndex) => (
                    <div
                      className={`music-bar ${currentBar === sectionOffsets[sectionIndex] + barIndex ? "is-playing" : ""}`}
                      aria-current={
                        currentBar === sectionOffsets[sectionIndex] + barIndex
                          ? "step"
                          : undefined
                      }
                      key={barIndex}
                    >
                      <small>
                        {selected.sections
                          .slice(0, sectionIndex)
                          .reduce((count, s) => count + s.bars.length, 0) +
                          barIndex +
                          1}
                      </small>
                      <div>
                        {bar.map((chord, chordIndex) => {
                          const transposed = transposeChord(chord, transpose);
                          return (
                            <button
                              key={chordIndex}
                              onClick={() => void hear(transposed)}
                              aria-label={`${transposed} 코드 듣기`}
                            >
                              {transposed}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <details className="music-help music-score-help">
            <summary title="곡·악보 정보" aria-label="곡·악보 정보">
              <Info size={19} />
            </summary>
            <p>
              {selected.composer} · {selected.year}
            </p>
            <a
              className="music-source-link small"
              href={selected.scoreUrl}
              target="_blank"
              rel="noreferrer"
            >
              {selected.scoreLabel} <ExternalLink size={12} />
            </a>
          </details>
          {error && (
            <p className="music-error" role="alert">
              {error}
            </p>
          )}
        </section>
        <section className="card music-pdf-card">
          <div className="section-heading">
            <div>
              <h3>내 악보 · PDF</h3>
            </div>
            <button
              className="button secondary"
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={15} /> PDF 선택
            </button>
          </div>
          <input
            className="music-file-input"
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            aria-label="내 PDF 악보 선택"
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {pdf ? (
            <>
              <div className="music-pdf-name">
                <FileMusic size={16} />
                <span>{pdf.name}</span>
                <a
                  href={pdf.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="내 PDF 새 창에서 열기"
                  title="새 창에서 열기"
                >
                  <ExternalLink size={16} />
                </a>
                <button
                  className="icon-button"
                  aria-label="내 PDF 닫기"
                  title="닫기"
                  onClick={() => {
                    uploadSequence.current++;
                    setPdf(null);
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              <iframe
                className="music-pdf-preview"
                src={pdf.url}
                title={`${pdf.name} 악보 미리보기`}
              />
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
