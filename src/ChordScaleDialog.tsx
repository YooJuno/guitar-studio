import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Play, Volume2, X } from "lucide-react";
import Fretboard from "./Fretboard";
import { chordScaleOptions, spellChordScale } from "./lib/chord-scales";
import type { ChordScaleContext } from "./lib/chord-scales";
import { parseJazzChord } from "./lib/jazz";
import { playNotes, stopNotes } from "./lib/synth";
import { midiToFrequency, noteName } from "./lib/theory";
import "./chord-scales.css";

interface ChordScaleDialogProps {
  symbol: string;
  strings: number[];
  context?: ChordScaleContext;
  onClose: () => void;
}

export default function ChordScaleDialog({
  symbol,
  strings,
  context,
  onClose,
}: ChordScaleDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [scaleId, setScaleId] = useState("");
  const [fret, setFret] = useState(0);
  const [error, setError] = useState("");
  const chord = useMemo(() => parseJazzChord(symbol), [symbol]);
  const choices = useMemo(
    () => (chord ? chordScaleOptions(chord, context) : []),
    [chord, context],
  );
  const scale = choices.find((choice) => choice.id === scaleId) ?? choices[0];

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    return () => stopNotes();
  }, []);

  async function listen(midis: number[], sequence = false) {
    setError("");
    try {
      await playNotes(
        midis.map((midi) => midiToFrequency(midi)),
        sequence,
        0.22,
      );
    } catch {
      setError("소리를 재생하지 못했습니다.");
    }
  }

  if (!chord) return null;
  const hasSlashBass = chord.bass !== chord.root;
  const chordMidis = chord.intervals.map(
    (interval) => 48 + chord.root + interval,
  );
  if (hasSlashBass) chordMidis.unshift(36 + chord.bass);
  const chordTones = [...new Set(chordMidis.map((midi) => midi % 12))];
  const pitches = scale
    ? scale.intervals.map((interval) => (chord.root + interval) % 12)
    : chordTones;
  const names = scale
    ? spellChordScale(symbol, chord.root, scale)
    : pitches.map((pitch) => noteName(pitch, false));
  const rootName =
    symbol.match(/^[A-G][♭♯b#]{0,2}/i)?.[0] ?? noteName(chord.root, false);

  return (
    <dialog
      ref={dialog}
      className="chord-scale-dialog"
      aria-labelledby={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
    >
      <div className="chord-scale-head">
        <h2 id={title}>
          {symbol} <span>스케일</span>
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label="코드 듣기"
          title="코드 듣기"
          onClick={() => void listen(chordMidis)}
        >
          <Volume2 size={19} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="스케일 닫기"
          onClick={() => dialog.current?.close()}
          autoFocus
        >
          <X size={20} />
        </button>
      </div>
      {scale ? (
        <div className="chord-scale-selection">
          <select
            aria-label="추천 스케일"
            value={scale.id}
            onChange={(event) => setScaleId(event.target.value)}
          >
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {rootName} {choice.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-button"
            aria-label="스케일 듣기"
            title="스케일 듣기"
            onClick={() =>
              void listen(
                [...scale.intervals, 12].map(
                  (interval) => 48 + chord.root + interval,
                ),
                true,
              )
            }
          >
            <Play size={18} />
          </button>
        </div>
      ) : (
        <p>스케일 후보 없음</p>
      )}
      <div className="chord-scale-notes" aria-label="구성음">
        {pitches.map((pitch, index) => (
          <span
            key={pitch}
            className={chordTones.includes(pitch) ? "is-chord-tone" : ""}
          >
            {names[index]}
          </span>
        ))}
      </div>
      {scale && (
        <p className="chord-scale-reason" aria-live="polite">
          <strong>{hasSlashBass ? "코드톤·베이스음 포함" : "코드톤 포함"}</strong>
          {" · "}{scale.reason}
        </p>
      )}
      <div className="chord-scale-board-heading">
        <span className="chord-tone-legend">
          <i />
          코드톤
        </span>
        <select
          aria-label="스케일 프렛 범위"
          value={fret}
          onChange={(event) => setFret(+event.target.value)}
        >
          {[0, 5, 10, 15, 19].map((start) => (
            <option key={start} value={start}>
              {start}–{start + 5} 프렛
            </option>
          ))}
        </select>
      </div>
      <Fretboard
        strings={strings}
        root={chord.root}
        pitches={pitches}
        chordTones={chordTones}
        names={Object.fromEntries(
          pitches.map((pitch, index) => [pitch, names[index]]),
        )}
        start={fret}
        compact
        onPlay={(midi) => void listen([midi])}
      />
      {error && (
        <p role="alert" className="music-error">
          {error}
        </p>
      )}
    </dialog>
  );
}
