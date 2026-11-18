type SessionKind = "playback" | "capture";
type SessionType =
  | "auto"
  | "ambient"
  | "playback"
  | "play-and-record"
  | "transient"
  | "transient-solo";
interface BrowserAudioSession {
  type: SessionType;
}

const claims = new Map<symbol, SessionKind>();
let session: BrowserAudioSession | undefined;
let original: SessionType = "auto";

function applySession() {
  if (!session) return;
  const type = [...claims.values()].includes("capture")
    ? "play-and-record"
    : claims.size
      ? "playback"
      : original;
  try {
    if (session.type !== type) session.type = type;
  } catch {
    // Optional API: unsupported session categories must not prevent playback.
  }
  if (!claims.size) session = undefined;
}

/** Declare music/capture intent on Safari; microphone capture always takes priority. */
export function claimAudioSession(kind: SessionKind): () => void {
  if (!claims.size && typeof navigator !== "undefined") {
    session = (navigator as Navigator & { audioSession?: BrowserAudioSession })
      .audioSession;
    if (session) original = session.type;
  }
  const token = Symbol(kind);
  claims.set(token, kind);
  applySession();
  return () => {
    if (claims.delete(token)) applySession();
  };
}
