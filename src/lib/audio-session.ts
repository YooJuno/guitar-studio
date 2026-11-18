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

/** Invoke resume inside the user gesture and settle even if the browser stalls. */
export function resumeAudioContext(
  context: AudioContext,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    function finish(settle: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      settle();
    }
    const cancel = () =>
      finish(() =>
        reject(new DOMException("재생 준비가 취소되었습니다.", "AbortError")),
      );
    const timeout = setTimeout(
      () =>
        finish(() =>
          reject(new Error("오디오 출력을 시작하지 못했습니다. 재생 버튼을 다시 눌러 주세요.")),
        ),
      4000,
    );
    if (signal.aborted) {
      cancel();
      return;
    }
    signal.addEventListener("abort", cancel, { once: true });
    try {
      context.resume().then(
        () => finish(resolve),
        (error: unknown) => finish(() => reject(error)),
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
