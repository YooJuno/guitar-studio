import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AudioLines,
  Guitar,
  Grid3X3,
  Music2,
  Timer,
  Code2,
  Play,
  Square,
  X,
  Check,
  Cloud,
  CloudOff,
  LoaderCircle,
} from "lucide-react";
import type { User } from "firebase/auth";
import { defaultMetronome, Metronome } from "./lib/metronome";
import type { MetronomeConfig, Tick } from "./lib/metronome";
import { tunings } from "./data/tunings";
import { stopNotes } from "./lib/synth";
import AccountMenu from "./AccountMenu";
const TunerView = memo(lazy(() => import("./TunerView")));
const MetronomeView = lazy(() => import("./MetronomeView"));
const loadAccount = () => import("./lib/firebase");
const ChordsView = memo(
  lazy(() =>
    import("./MusicViews").then((module) => ({ default: module.ChordsView })),
  ),
);
const ScalesView = memo(
  lazy(() =>
    import("./MusicViews").then((module) => ({ default: module.ScalesView })),
  ),
);
const JazzView = memo(lazy(() => import("./JazzView")));

type Tab = "tuner" | "chords" | "scales" | "jazz" | "metronome";
interface Preferences {
  tuningId: string;
  customStrings: number[] | null;
  a4: number;
  favorites: string[];
  metronome: MetronomeConfig;
  presets: { name: string; config: MetronomeConfig }[];
}
const defaults = (): Preferences => ({
  tuningId: "guitar-standard",
  customStrings: null,
  a4: 440,
  favorites: [],
  metronome: { ...defaultMetronome, accents: [...defaultMetronome.accents] },
  presets: [],
});
const number = (v: unknown, fallback: number, low: number, high: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.max(low, Math.min(high, v))
    : fallback;
function cleanMetro(value: unknown): MetronomeConfig {
  const d = defaultMetronome;
  const v =
    value && typeof value === "object"
      ? (value as Partial<MetronomeConfig>)
      : {};
  const beats = Math.round(number(v.beats, d.beats, 1, 12));
  return {
    bpm: Math.round(number(v.bpm, d.bpm, 20, 300)),
    beats,
    denominator: v.denominator === 8 ? 8 : 4,
    subdivision: [1, 2, 3, 4].includes(v.subdivision ?? 0) ? v.subdivision! : 1,
    swing: v.swing === true,
    accents: Array.from({ length: beats }, (_, i) =>
      [0, 1, 2].includes(v.accents?.[i] ?? -1)
        ? v.accents![i]
        : i === 0
          ? 2
          : 1,
    ),
    volume: number(v.volume, d.volume, 0, 1),
    sound: v.sound === "digital" ? "digital" : "wood",
    countIn: Math.round(number(v.countIn, 0, 0, 2)),
    rampEvery: Math.round(number(v.rampEvery, 0, 0, 64)),
    rampBy: Math.round(number(v.rampBy, 2, 1, 10)),
    timerMinutes: Math.round(number(v.timerMinutes, 0, 0, 120)),
  };
}
function cleanPreferences(raw: unknown): Preferences {
  const d = defaults();
  if (!raw || typeof raw !== "object") return d;
  const v = raw as Partial<Preferences>;
  return {
    tuningId: tunings.some((t) => t.id === v.tuningId)
      ? v.tuningId!
      : d.tuningId,
    customStrings:
      Array.isArray(v.customStrings) &&
      v.customStrings.length >= 4 &&
      v.customStrings.length <= 8 &&
      v.customStrings.every((n) => Number.isInteger(n) && n >= 12 && n <= 96)
        ? v.customStrings
        : null,
    a4: number(v.a4, 440, 430, 450),
    favorites: Array.isArray(v.favorites)
      ? v.favorites.filter((x) => typeof x === "string").slice(0, 200)
      : [],
    metronome: cleanMetro(v.metronome),
    presets: Array.isArray(v.presets)
      ? v.presets
          .filter((p) => p && typeof p.name === "string" && p.config)
          .slice(0, 30)
          .map((p) => ({
            name: p.name.slice(0, 40),
            config: cleanMetro(p.config),
          }))
      : [],
  };
}
function readLocal(key: string) {
  try {
    return cleanPreferences(JSON.parse(localStorage.getItem(key) ?? "null"));
  } catch {
    return defaults();
  }
}
const nav: {
  id: Tab;
  title: string;
  english: string;
  icon: typeof AudioLines;
}[] = [
  { id: "tuner", title: "튜너", english: "Tuner", icon: AudioLines },
  { id: "chords", title: "코드", english: "Chords", icon: Guitar },
  { id: "scales", title: "스케일", english: "Scales", icon: Grid3X3 },
  { id: "jazz", title: "재즈 악보", english: "Standards", icon: Music2 },
  { id: "metronome", title: "메트로놈", english: "Metronome", icon: Timer },
];
function getTab(): Tab {
  const hash = location.hash.slice(1);
  return nav.some((n) => n.id === hash) ? (hash as Tab) : "tuner";
}
function errorText(error: unknown) {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    "auth/popup-closed-by-user": "로그인이 취소되었습니다.",
    "auth/popup-blocked": "브라우저에서 로그인 팝업을 허용해 주세요.",
    "auth/unauthorized-domain": "Firebase 인증 도메인 설정을 확인해 주세요.",
    "auth/operation-not-allowed":
      "Firebase의 Google 로그인이 비활성화되어 있습니다.",
    "auth/network-request-failed": "네트워크 연결을 확인해 주세요.",
  };
  return code && messages[code]
    ? messages[code]
    : "연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function LoadingTool() {
  return (
    <div className="load-strip" role="status" aria-label="불러오는 중">
      <LoaderCircle size={20} className="spin" aria-hidden="true" />
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>(getTab);
  const [tunerVisited, setTunerVisited] = useState(tab === "tuner");
  const account = useRef<Awaited<ReturnType<typeof loadAccount>> | null>(null);
  const observedUid = useRef<string | null>(null);
  const lastAccountKey = useRef("juno-studio:guest");
  const [user, setUser] = useState<User | null>(null);
  const [authKnown, setAuthKnown] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(() =>
    readLocal("juno-studio:guest"),
  );
  const [ready, setReady] = useState(true);
  const [hydratedKey, setHydratedKey] = useState("juno-studio:guest");
  const [retryLoad, setRetryLoad] = useState(0);
  const [cloudAllowed, setCloudAllowed] = useState(false);
  const [sync, setSync] = useState<
    "local" | "loading" | "saved" | "saving" | "offline"
  >("local");
  const [toast, setToast] = useState("");
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const [tick, setTick] = useState<Tick | null>(null);
  const [tunerActive, setTunerActive] = useState(false);
  const [metro] = useState(() => new Metronome());
  const key = user ? `juno-studio:user:${user.uid}` : "juno-studio:guest";
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const hydrated = ready && hydratedKey === key;
  const readyRef = useRef(hydrated);
  readyRef.current = hydrated;
  const activeTuning =
    tunings.find((t) => t.id === prefs.tuningId) ?? tunings[0];
  const strings = prefs.customStrings ?? activeTuning.strings;
  const stopMetro = useCallback(() => {
    metro.stop();
    playingRef.current = false;
    setPlaying(false);
    setTick(null);
  }, [metro]);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void loadAccount()
      .then((api) => {
        if (disposed) return;
        account.current = api;
        unsubscribe = api.subscribeAuth((next) => {
          const uid = next?.uid ?? null;
          if (uid !== observedUid.current) {
            observedUid.current = uid;
            setReady(false);
            setCloudAllowed(false);
          }
          setUser(next);
          setAuthKnown(true);
        });
      })
      .catch(() => {
        if (!disposed) setAuthKnown(true);
      });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);
  useEffect(() => {
    if (tab === "tuner") setTunerVisited(true);
  }, [tab]);
  useEffect(() => {
    const retry = () => {
      if (sync === "offline") setRetryLoad((n) => n + 1);
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [sync]);
  useEffect(() => {
    const api = account.current;
    if (!api || !authKnown || (!user && lastAccountKey.current === key)) return;
    lastAccountKey.current = key;
    let cancelled = false;
    setReady(false);
    setCloudAllowed(false);
    setSync(user ? "loading" : "local");
    stopMetro();
    stopNotes();
    const cached = readLocal(key);
    setPrefs(cached);
    if (!user) {
      setHydratedKey(key);
      setReady(true);
      return;
    }
    const uid = user.uid;
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("timeout")), 8000);
    });
    Promise.race([api.loadPreferences(uid), timeout])
      .then((remote) => {
        if (cancelled) return;
        let pending = false;
        try {
          pending = !!localStorage.getItem(`${key}:pending`);
        } catch {
          /* optional cache */
        }
        if (remote && !pending) setPrefs(cleanPreferences(remote));
        setCloudAllowed(true);
        setSync("saved");
        setHydratedKey(key);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setSync("offline");
          setHydratedKey(key);
          setReady(true);
          setToast("클라우드 연결 대기 · 이 기기에 저장됩니다.");
        }
      })
      .finally(() => clearTimeout(timeoutId));
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [authKnown, user?.uid, key, retryLoad, stopMetro]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(prefs));
    } catch {
      setToast("기기 저장 공간을 사용할 수 없습니다.");
    }
    const api = account.current;
    if (!api || !user || !cloudAllowed) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setSync("saving");
      let token: string | null = null;
      try {
        token = localStorage.getItem(`${key}:pending`);
      } catch {
        /* optional cache */
      }
      api
        .savePreferences(user.uid, prefs as unknown as Record<string, unknown>)
        .then(() => {
          if (cancelled) return;
          try {
            if (localStorage.getItem(`${key}:pending`) === token)
              localStorage.removeItem(`${key}:pending`);
          } catch {
            /* optional cache */
          }
          setSync("saved");
        })
        .catch(() => {
          if (!cancelled) setSync("offline");
        });
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [prefs, hydrated, key, user?.uid, cloudAllowed]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);
  useEffect(() => {
    const change = () => setTab(getTab());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(
    () => () => {
      metro.stop();
      stopNotes();
    },
    [],
  );
  useEffect(() => {
    window.addEventListener("pagehide", stopMetro);
    return () => window.removeEventListener("pagehide", stopMetro);
  }, [stopMetro]);
  useEffect(() => {
    metro.config = prefs.metronome;
  }, [prefs.metronome]);

  const markPending = useCallback(() => {
    if (!user) return;
    try {
      localStorage.setItem(`${key}:pending`, `${Date.now()}:${Math.random()}`);
    } catch {
      /* optional cache */
    }
  }, [user?.uid, key]);
  const update = useCallback(
    (patch: Partial<Preferences>) => {
      if (!readyRef.current) return;
      markPending();
      setPrefs((p) => ({ ...p, ...patch }));
    },
    [markPending],
  );
  const favorite = useCallback(
    (id: string) => {
      if (!readyRef.current) return;
      markPending();
      setPrefs((p) => ({
        ...p,
        favorites: p.favorites.includes(id)
          ? p.favorites.filter((f) => f !== id)
          : [...p.favorites, id],
      }));
    },
    [markPending],
  );
  const setMetro = useCallback(
    (patch: Partial<MetronomeConfig>) => {
      if (!readyRef.current) return;
      markPending();
      const structural = [
        "beats",
        "denominator",
        "subdivision",
        "countIn",
        "rampEvery",
        "rampBy",
        "timerMinutes",
      ];
      if (structural.some((k) => k in patch)) stopMetro();
      setPrefs((p) => ({
        ...p,
        metronome: cleanMetro({ ...p.metronome, ...patch }),
      }));
    },
    [markPending, stopMetro],
  );
  const toggleMetro = useCallback(() => {
    if (!readyRef.current) return;
    if (playingRef.current) {
      stopMetro();
      return;
    }
    playingRef.current = true;
    setPlaying(true);
    metro.config = prefsRef.current.metronome;
    void metro
      .start(
        (next) => {
          // The visual beat displays do not change on subdivisions.
          if (next.sub === 0) setTick(next);
        },
        (reason) => {
          stopMetro();
          if (reason === "interrupted")
            setToast("메트로놈 소리가 중단됐습니다. 다시 시작해 주세요.");
        },
      )
      .catch(() => {
        stopMetro();
        setToast("메트로놈 소리를 시작하지 못했습니다. 다시 눌러 주세요.");
      });
  }, [metro, stopMetro]);
  const onPlaybackActive = useCallback((active: boolean) => {
    if (active) {
      stopMetro();
      stopNotes();
    }
  }, [stopMetro]);
  useEffect(() => {
    function keyboard(e: KeyboardEvent) {
      if (
        e.defaultPrevented ||
        e.code !== "Space" ||
        e.repeat ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey
      )
        return;
      const el = e.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "SUMMARY"].includes(
          el.tagName,
        ) ||
        el.isContentEditable
      )
        return;
      if (!readyRef.current) return;
      e.preventDefault();
      if (tab === "jazz")
        window.dispatchEvent(new Event("juno:toggle-practice"));
      else toggleMetro();
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [toggleMetro, tab]);

  function navigate(id: Tab) {
    stopNotes();
    location.hash = id;
    setTab(id);
  }
  function login() {
    setLoginBusy(true);
    if (!account.current) {
      setLoginBusy(false);
      setToast("로그인을 불러오지 못했습니다. 새로고침해 주세요.");
      return;
    }
    void account.current
      .loginWithGoogle()
      .catch((e) => setToast(errorText(e)))
      .finally(() => setLoginBusy(false));
  }
  const sendTempo = useCallback(
    (bpm: number) => {
      setMetro({ bpm });
      setToast(`${bpm} BPM`);
    },
    [setMetro],
  );
  const current = nav.find((n) => n.id === tab)!;
  const musicProps = {
    strings,
    favorites: prefs.favorites,
    onFavorite: favorite,
    onPlaybackActive,
    onTempo: sendTempo,
  };

  return (
    <div className="studio-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#tuner"
          onClick={() => navigate("tuner")}
          aria-label="Juno Studio 홈"
        >
          <span className="brand-mark">
            <AudioLines size={23} strokeWidth={2.3} />
          </span>
          <span>
            juno<span className="brand-light">studio</span>
          </span>
        </a>
        <nav aria-label="도구">
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${tab === n.id ? "selected" : ""}`}
              aria-current={tab === n.id ? "page" : undefined}
              onClick={() => navigate(n.id)}
              title={n.title}
            >
              <n.icon size={20} strokeWidth={1.65} />
              <span>{n.title}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-links">
            <a
              className="icon-button"
              href="https://github.com/YooJuno/guitar-studio"
              target="_blank"
              rel="noreferrer"
              title="GitHub"
              aria-label="GitHub 소스 코드"
            >
              <Code2 size={18} />
            </a>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="tool-heading">
            <h1>{current.title}</h1>
            {(tab === "chords" || tab === "scales") && (
              <button
                className="tuning-chip"
                onClick={() => navigate("tuner")}
                title={`튜닝 변경 · ${activeTuning.name}`}
                aria-label="튜닝 변경"
              >
                <Guitar size={16} />
                <span>
                  {prefs.customStrings ? "Custom" : activeTuning.name}
                </span>
              </button>
            )}
          </div>
          <div className="topbar-actions">
            {tunerActive && tab !== "tuner" && (
              <button
                className="tuner-live-stop"
                onClick={() =>
                  window.dispatchEvent(new Event("juno:stop-tuner"))
                }
                title="튜너 입력 정지"
                aria-label="튜너 입력 정지"
              >
                <AudioLines size={15} />
                <Square size={9} fill="currentColor" />
              </button>
            )}
            <button
              type="button"
              className={`sync-state ${sync === "offline" ? "warning" : ""}`}
              disabled={sync !== "offline"}
              onClick={() => setRetryLoad((n) => n + 1)}
              aria-label={
                sync === "offline" ? "클라우드 다시 연결" : "설정 저장 상태"
              }
              title={
                sync === "saved"
                  ? "계정에 저장됨"
                  : sync === "saving"
                    ? "계정에 저장 중"
                    : sync === "loading"
                      ? "설정 불러오는 중"
                      : sync === "offline"
                        ? "기기에 저장됨 · 클라우드 연결 대기"
                        : "이 기기에 저장됨"
              }
            >
              {sync === "saving" || sync === "loading" ? (
                <LoaderCircle size={16} className="spin" />
              ) : sync === "saved" ? (
                <Cloud size={16} />
              ) : sync === "offline" ? (
                <CloudOff size={16} />
              ) : (
                <Check size={16} />
              )}
            </button>
            {(tab === "chords" || tab === "scales") && (
              <details
                className="quick-metro"
                key={tab}
                onBlur={(event) => {
                  if (
                    event.relatedTarget &&
                    !event.currentTarget.contains(event.relatedTarget)
                  )
                    event.currentTarget.open = false;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && event.currentTarget.open) {
                    event.currentTarget.open = false;
                    event.currentTarget.querySelector("summary")?.focus();
                  }
                }}
              >
                <summary
                  className={playing ? "quick-metro-playing" : ""}
                  title="메트로놈"
                  aria-label="미니 메트로놈"
                >
                  <Timer size={19} />
                </summary>
                <div className="mini-metronome">
                  <button
                    className="mini-metro-label"
                    onClick={() => navigate("metronome")}
                    title="메트로놈 열기"
                  >
                    <Timer size={17} />
                  </button>
                  <button
                    className="bpm-step"
                    onClick={() =>
                      setMetro({ bpm: Math.max(20, prefs.metronome.bpm - 1) })
                    }
                    aria-label="BPM 1 낮추기"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    aria-label="메트로놈 BPM"
                    min="20"
                    max="300"
                    value={prefs.metronome.bpm}
                    onChange={(e) =>
                      setMetro({
                        bpm: Math.max(20, Math.min(300, +e.target.value || 20)),
                      })
                    }
                  />
                  <span>BPM</span>
                  <button
                    className="bpm-step"
                    onClick={() =>
                      setMetro({ bpm: Math.min(300, prefs.metronome.bpm + 1) })
                    }
                    aria-label="BPM 1 높이기"
                  >
                    +
                  </button>
                  <div className="mini-beats">
                    {Array.from(
                      { length: Math.min(12, prefs.metronome.beats) },
                      (_, i) => (
                        <span
                          key={i}
                          className={playing && tick?.beat === i ? "lit" : ""}
                        />
                      ),
                    )}
                  </div>
                  <button
                    className={`mini-play ${playing ? "playing" : ""}`}
                    onClick={toggleMetro}
                    title={
                      playing
                        ? "메트로놈 정지 (Space)"
                        : "메트로놈 시작 (Space)"
                    }
                    aria-label={playing ? "메트로놈 정지" : "메트로놈 시작"}
                    aria-busy={playing && !tick}
                  >
                    {playing && !tick ? (
                      <LoaderCircle size={14} className="spin" />
                    ) : playing ? (
                      <Square size={13} fill="currentColor" />
                    ) : (
                      <Play size={14} fill="currentColor" />
                    )}
                  </button>
                </div>
              </details>
            )}
            {!authKnown || loginBusy ? (
              <span className="account-loading">
                <LoaderCircle className="spin" size={18} />
              </span>
            ) : user ? (
              <AccountMenu
                user={user}
                onLogout={() =>
                  void account.current
                    ?.logout()
                    .catch((e) => setToast(errorText(e)))
                }
              />
            ) : (
              <button className="google-login" onClick={login}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.75 3.28-7.95Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.8l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.87 0-5.3-1.94-6.17-4.54H2.15v2.84A11 11 0 0 0 12 23Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.83 13.96a6.6 6.6 0 0 1 0-3.92V7.2H2.15a11 11 0 0 0 0 9l3.68-2.24Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.5c1.62 0 3.07.56 4.21 1.64l3.16-3.16A10.57 10.57 0 0 0 12 1a11 11 0 0 0-9.85 6.2l3.68 2.84C6.7 7.44 9.13 5.5 12 5.5Z"
                  />
                </svg>
                <span>로그인</span>
              </button>
            )}
          </div>
        </header>
        <main id="main-content">
          {!hydrated && (
            <div className="load-strip">
              <LoaderCircle size={15} className="spin" /> 설정 불러오는 중
            </div>
          )}
          <div className="tool-content" inert={!hydrated}>
            {(tab === "tuner" || tunerVisited) && (
              <div hidden={tab !== "tuner"}>
                <Suspense fallback={<LoadingTool />}>
                  <TunerView
                    tuningId={prefs.tuningId}
                    customStrings={prefs.customStrings}
                    a4={prefs.a4}
                    onChange={update}
                    favorites={prefs.favorites}
                    onFavorite={favorite}
                    onActiveChange={setTunerActive}
                    visible={tab === "tuner"}
                  />
                </Suspense>
              </div>
            )}
            <Suspense key={key} fallback={<LoadingTool />}>
              {tab === "chords" && <ChordsView {...musicProps} />}
              {tab === "scales" && <ScalesView {...musicProps} />}
              {tab === "jazz" && <JazzView {...musicProps} />}
              {tab === "metronome" && (
                <MetronomeView
                  config={prefs.metronome}
                  setConfig={setMetro}
                  playing={playing}
                  tick={tick}
                  toggle={toggleMetro}
                  presets={prefs.presets}
                  savePreset={(name) => {
                    update({
                      presets: [
                        ...prefs.presets.slice(-29),
                        {
                          name,
                          config: {
                            ...prefs.metronome,
                            accents: [...prefs.metronome.accents],
                          },
                        },
                      ],
                    });
                  }}
                  removePreset={(index) =>
                    update({
                      presets: prefs.presets.filter((_, i) => i !== index),
                    })
                  }
                />
              )}
            </Suspense>
          </div>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button onClick={() => setToast("")} aria-label="알림 닫기">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
