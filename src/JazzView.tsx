import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  ChevronDown,
  ExternalLink,
  FileMusic,
  Search,
  Upload,
  X,
} from "lucide-react";
import { stopNotes } from "./lib/synth";
import { standards } from "./data/standards";
import type { Standard } from "./data/standards";
import { parseJazzChord, transposeChord } from "./lib/jazz";
import JazzPractice from "./JazzPractice";
import FavoriteButton from "./FavoriteButton";
import ChordScaleDialog from "./ChordScaleDialog";
import type { ChordScaleContext } from "./lib/chord-scales";
import type { MusicViewProps } from "./MusicViews";
import "./music.css";

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
          setError("악보를 표시하지 못했습니다. 코드 차트에서 확인해 주세요.");
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

export default function JazzView({
  strings,
  favorites,
  onFavorite,
  onTempo,
  onPlaybackActive,
}: MusicViewProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const libraryRef = useRef<HTMLElement>(null);
  const libraryToggle = useRef<HTMLButtonElement>(null);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [inspected, setInspected] = useState<{
    symbol: string;
    context: ChordScaleContext;
  } | null>(null);
  const scoreId = useId();
  const [panel, setPanel] = useState<"chart" | "score" | "pdf">("chart");
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
  const chart = useMemo(() => {
    if (!scoreOpen || panel !== "chart") return [];
    let number = 0;
    return selected.sections.map((section) => ({
      label: section.label,
      bars: section.bars.map((chords) => ({
        number: ++number,
        chords: chords.map((chord) => transposeChord(chord, transpose)),
      })),
    }));
  }, [scoreOpen, panel, selected, transpose]);
  const searchTerm = query.trim().toLocaleLowerCase();
  const filtered = useMemo(
    () =>
      standards.filter(
        (s) =>
          (style === "all" || s.style === style) &&
          (!searchTerm ||
            `${s.title} ${s.composer} ${s.style} ${s.key}`
              .toLocaleLowerCase()
              .includes(searchTerm)) &&
          (!onlyFavorites || favorites.includes(`jazz:${s.id}`)),
      ),
    [style, searchTerm, onlyFavorites, favorites],
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
  useEffect(() => {
    if (!libraryOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !libraryRef.current?.contains(event.target)
      )
        setLibraryOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [libraryOpen]);
  function select(standard: Standard) {
    setLibraryOpen(false);
    if (libraryToggle.current?.getClientRects().length)
      libraryToggle.current.focus();
    setPanel("chart");
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
  function inspectChord(symbol: string, bar: number, chordIndex: number) {
    if (!parseJazzChord(symbol)) return;
    const remaining = chart.flatMap((section) => section.bars).slice(bar - 1);
    const nextChord = remaining
      .flatMap(({ chords }, index) =>
        index === 0 ? chords.slice(chordIndex + 1) : chords,
      )
      .find((candidate) => candidate !== symbol && parseJazzChord(candidate));
    setInspected({
      symbol,
      context: {
        nextChord,
        key: transposeChord(selected.key, transpose),
        modal: selected.style === "Modal",
      },
    });
  }
  return (
    <div className="music-jazz-layout">
      <section
        ref={libraryRef}
        onKeyDown={(event) => {
          if (event.key === "Escape" && libraryOpen) {
            setLibraryOpen(false);
            libraryToggle.current?.focus();
          }
        }}
        className={`card music-library ${libraryOpen ? "library-open" : ""}`}
      >
        <div className="section-heading music-library-heading">
          <h3>레퍼토리</h3>
        </div>
        <div className="music-library-toolbar">
          <button
            type="button"
            ref={libraryToggle}
            className="music-library-toggle"
            aria-expanded={libraryOpen}
            aria-controls={libraryId}
            aria-label={`레퍼토리 변경 · ${selected.title}`}
            title={`곡 선택 · ${selected.composer}`}
            onClick={() => setLibraryOpen((open) => !open)}
          >
            <FileMusic size={18} />
            <strong>{selected.title}</strong>
            <ChevronDown size={17} />
          </button>
          <FavoriteButton
            saved={favorites.includes(`jazz:${selected.id}`)}
            onClick={() => onFavorite(`jazz:${selected.id}`)}
            label={selected.title}
          />
        </div>
        <div className="music-library-content" id={libraryId}>
          <label className="music-search">
            <Search size={17} />
            <input
              type="search"
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
      <section className="card music-score-card">
        <div className="section-heading music-score-heading">
          <h2
            className="music-song-title"
            title={`${selected.composer} · ${selected.year}`}
          >
            {selected.title}
          </h2>
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
        <div className="music-sheet">
          <button
            type="button"
            className="music-sheet-toggle"
            aria-controls={scoreId}
            aria-expanded={scoreOpen}
            onClick={() => setScoreOpen((open) => !open)}
          >
            <FileMusic size={18} aria-hidden="true" />
            <span>악보</span>
            <ChevronDown size={19} aria-hidden="true" />
          </button>
          <div id={scoreId} className="music-sheet-content" hidden={!scoreOpen}>
            {scoreOpen && (
              <>
                <div className="music-score-toolbar">
                  <div
                    className="panel-tabs"
                    role="group"
                    aria-label="악보 종류"
                  >
                    <button
                      type="button"
                      aria-pressed={panel === "chart"}
                      onClick={() => setPanel("chart")}
                    >
                      코드 차트
                    </button>
                    {selected.abc && (
                      <button
                        type="button"
                        aria-pressed={panel === "score"}
                        onClick={() => setPanel("score")}
                      >
                        오선 악보
                      </button>
                    )}
                    <button
                      type="button"
                      aria-pressed={panel === "pdf"}
                      onClick={() => setPanel("pdf")}
                    >
                      내 PDF
                    </button>
                  </div>
                  {!selected.abc && (
                    <a
                      className="button secondary music-score-link"
                      href={selected.scoreUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={selected.scoreLabel}
                      aria-label={`${selected.title} 정식 악보 열기`}
                    >
                      정식 악보 <ExternalLink size={14} />
                    </a>
                  )}
                </div>
                <div
                  className="music-score-pane"
                  hidden={panel !== "chart"}
                  aria-label="코드 차트"
                >
                  <div className="music-charts">
                    {chart.map((section, sectionIndex) => (
                      <div className="music-chart-section" key={sectionIndex}>
                        <span className="music-section-letter">
                          {section.label}
                        </span>
                        <div className="music-bar-grid">
                          {section.bars.map(({ number, chords }) => {
                            const active = currentBar === number - 1;
                            return (
                              <div
                                className={`music-bar ${active ? "is-playing" : ""}`}
                                aria-current={active ? "step" : undefined}
                                key={number}
                              >
                                <small>{number}</small>
                                <div>
                                  {chords.map((chord, index) => (
                                    <button
                                      key={index}
                                      aria-label={`${chord} 스케일 보기`}
                                      aria-haspopup="dialog"
                                      onClick={() =>
                                        inspectChord(chord, number, index)
                                      }
                                    >
                                      {chord}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {panel === "score" && selected.abc && (
                  <div className="music-score-pane" aria-label="오선 악보">
                    <Notation abc={selected.abc} transpose={transpose} />
                    <a
                      className="music-source-link"
                      href={selected.scoreUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {selected.scoreLabel} <ExternalLink size={14} />
                    </a>
                  </div>
                )}
                {panel === "pdf" && (
                  <section
                    className="music-score-pane music-pdf-card"
                    aria-label="내 PDF"
                  >
                    <div className="section-heading">
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
                )}
              </>
            )}
          </div>
        </div>
        {error && (
          <p className="music-error" role="alert">
            {error}
          </p>
        )}
      </section>
      {inspected && (
        <ChordScaleDialog
          {...inspected}
          strings={strings}
          onClose={() => setInspected(null)}
        />
      )}
    </div>
  );
}
