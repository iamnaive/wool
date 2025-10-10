// src/audio/AudioProvider.tsx
// Centralized audio manager with mobile autoplay compatibility.
// BGM: bgm_main (normal), bgm_disaster (catastrophe). SFX: sfx_eat (food).
// Listens to window events emitted by the game:
//   - "wg:feed"                            -> plays sfx_eat
//   - "wg:catastrophe"   {detail:{on:bool}}-> toggles BGM between main/disaster
//   - "wg:catastrophe-start"               -> same as on:true
//   - "wg:catastrophe-end"                 -> same as on:false
//
// Notes:
// - Audio unlocks after the first user gesture (pointer/keydown/touch).
// - Global mute persisted in localStorage("wg_muted_v1").
// - No changes to game logic are required.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type BgmMode = "main" | "disaster";

type AudioAPI = {
  muted: boolean;
  toggleMute: () => void;
  isArmed: boolean;
  playEat: () => void;
};

const Ctx = createContext<AudioAPI | null>(null);

/** Public paths (Vite serves from /public) */
const PATH_BGM_MAIN = "/audio/bgm_main.mp3";
const PATH_BGM_DISASTER = "/audio/bgm_disaster.mp3";
const PATH_SFX_EAT = "/audio/sfx_eat.mp3";

const LS_MUTE_KEY = "wg_muted_v1";

/** Create an <audio> element with safe defaults */
function makeAudio(src: string, loop = false, volume = 1): HTMLAudioElement {
  const a = new Audio(src);
  a.loop = loop;
  a.preload = "auto";
  a.volume = volume;
  a.crossOrigin = "anonymous";
  return a;
}

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [armed, setArmed] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_MUTE_KEY) || "false") === true;
    } catch {
      return false;
    }
  });

  // Refs to audio elements
  const bgmMainRef = useRef<HTMLAudioElement | null>(null);
  const bgmDisRef = useRef<HTMLAudioElement | null>(null);
  const sfxEatRef = useRef<HTMLAudioElement | null>(null);

  // Current catastrophe toggle
  const [catOn, setCatOn] = useState(false);

  /** Create audio nodes lazily (after first gesture) */
  const ensureEls = useCallback(() => {
    if (!bgmMainRef.current) bgmMainRef.current = makeAudio(PATH_BGM_MAIN, true, 0.6);
    if (!bgmDisRef.current) bgmDisRef.current = makeAudio(PATH_BGM_DISASTER, true, 0.6);
    if (!sfxEatRef.current) sfxEatRef.current = makeAudio(PATH_SFX_EAT, false, 1.0);

    // Apply current mute to all nodes
    [bgmMainRef.current, bgmDisRef.current, sfxEatRef.current].forEach((a) => {
      if (a) a.muted = muted;
    });
  }, [muted]);

  /** Arm audio on first user gesture (mobile autoplay policies) */
  useEffect(() => {
    const arm = () => {
      if (armed) return;
      ensureEls();
      setArmed(true);
    };
    const evs = ["pointerdown", "keydown", "touchstart"];
    evs.forEach((t) => window.addEventListener(t, arm, { passive: true }));
    return () => evs.forEach((t) => window.removeEventListener(t, arm as any));
  }, [armed, ensureEls]);

  /** Persist mute and keep elements in sync */
  useEffect(() => {
    try {
      localStorage.setItem(LS_MUTE_KEY, JSON.stringify(muted));
    } catch {}
    [bgmMainRef.current, bgmDisRef.current, sfxEatRef.current].forEach((a) => {
      if (a) a.muted = muted;
    });
  }, [muted]);

  /** Safe play/pause helpers */
  const safePlay = useCallback(async (el?: HTMLAudioElement | null) => {
    try {
      await el?.play();
    } catch {
      // Autoplay may still be blocked before "armed"
    }
  }, []);
  const safePause = useCallback((el?: HTMLAudioElement | null) => {
    try {
      el?.pause();
    } catch {
      /* ignore */
    }
  }, []);

  /** Switch BGM based on catastrophe flag */
  const applyBgm = useCallback(() => {
    if (!armed) return;
    ensureEls();
    const main = bgmMainRef.current!;
    const dis = bgmDisRef.current!;
    if (catOn) {
      safePause(main);
      dis.currentTime = 0; // restart disaster for clarity
      void safePlay(dis);
    } else {
      safePause(dis);
      if (main.paused) void safePlay(main); // resume main if it was paused
    }
  }, [armed, ensureEls, catOn, safePause, safePlay]);

  useEffect(() => {
    applyBgm();
  }, [applyBgm]);

  /** Start main BGM once armed (and not muted or in catastrophe) */
  useEffect(() => {
    if (!armed || muted) return;
    if (!catOn) applyBgm();
  }, [armed, muted, catOn, applyBgm]);

  /** Event: feed -> play sfx_eat */
  useEffect(() => {
    const onFeed = () => {
      if (!armed) return;
      ensureEls();
      const s = sfxEatRef.current!;
      try {
        s.currentTime = 0;
      } catch {}
      void s.play().catch(() => {});
    };
    window.addEventListener("wg:feed", onFeed as EventListener);
    return () => window.removeEventListener("wg:feed", onFeed as EventListener);
  }, [armed, ensureEls]);

  /** Event: catastrophe (detail.on) */
  useEffect(() => {
    const onCat = (ev: Event) => {
      const det = (ev as CustomEvent).detail as { on?: boolean } | undefined;
      const on = !!(det && det.on === true);
      setCatOn(on);
    };
    window.addEventListener("wg:catastrophe", onCat as EventListener);
    return () => window.removeEventListener("wg:catastrophe", onCat as EventListener);
  }, []);

  /** Backward compat: catastrophe-start / catastrophe-end */
  useEffect(() => {
    const onStart = () => setCatOn(true);
    const onEnd = () => setCatOn(false);
    window.addEventListener("wg:catastrophe-start", onStart as EventListener);
    window.addEventListener("wg:catastrophe-end", onEnd as EventListener);
    return () => {
      window.removeEventListener("wg:catastrophe-start", onStart as EventListener);
      window.removeEventListener("wg:catastrophe-end", onEnd as EventListener);
    };
  }, []);

  /** Pause BGM on hidden tab; resume on visible */
  useEffect(() => {
    const onVis = () => {
      if (!armed) return;
      ensureEls();
      if (document.hidden) {
        safePause(bgmMainRef.current);
        safePause(bgmDisRef.current);
      } else {
        applyBgm();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [armed, ensureEls, safePause, applyBgm]);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  const api: AudioAPI = useMemo(
    () => ({
      muted,
      toggleMute,
      isArmed: armed,
      playEat: () => {
        if (!armed) return;
        const s = sfxEatRef.current;
        if (!s) return;
        try {
          s.currentTime = 0;
        } catch {}
        void s.play().catch(() => {});
      },
    }),
    [muted, toggleMute, armed]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};

export function useAudio() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAudio must be used within <AudioProvider>");
  return ctx;
}
