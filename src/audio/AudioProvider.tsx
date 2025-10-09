// src/audio/AudioProvider.tsx
// Centralized audio context/provider. Plays BGM only after a user gesture.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type BgmMode = "main" | "disaster";

type AudioCtx = {
  armed: boolean;
  muted: boolean;
  setMuted(v: boolean): void;
  playBgm(mode: BgmMode): Promise<void>;
  stopBgm(): void;
  playSfx(name: "sfx_eat" | "sfx_catastrophe" | "sfx_cat_end"): void;
};

const Ctx = createContext<AudioCtx | null>(null);

const makeAudio = (src: string, loop = false, volume = 1) => {
  const a = new Audio(src);
  a.loop = loop;
  a.preload = "auto";
  a.volume = volume;
  a.crossOrigin = "anonymous";
  return a;
};

const ls = {
  getBool(k: string, d = false) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  setBool(k: string, v: boolean) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

export const AudioProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [muted, setMutedState] = useState(ls.getBool("wg_muted", false));
  const [armed, setArmed] = useState(false);

  const bgmMainRef = useRef<HTMLAudioElement | null>(null);
  const bgmDisasterRef = useRef<HTMLAudioElement | null>(null);
  const sfxEatRef = useRef<HTMLAudioElement | null>(null);
  const sfxCatRef = useRef<HTMLAudioElement | null>(null);
  const sfxCatEndRef = useRef<HTMLAudioElement | null>(null);

  // Lazy create on first gesture
  useEffect(() => {
    const onFirstGesture = async () => {
      if (armed) return;
      bgmMainRef.current = makeAudio("/audio/bgm_main.mp3", true, 0.7);
      bgmDisasterRef.current = makeAudio("/audio/bgm_disaster.mp3", true, 0.7);
      sfxEatRef.current = makeAudio("/audio/sfx_eat.mp3", false, 1);
      sfxCatRef.current = makeAudio("/audio/sfx_eat.mp3", false, 1);
      sfxCatEndRef.current = makeAudio("/audio/sfx_cat_end.mp3", false, 1);

      setArmed(true);
      try {
        await bgmMainRef.current!.play();
      } catch {
        /* autoplay might be blocked; it's ok after next gesture */
      }
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };

    window.addEventListener("pointerdown", onFirstGesture, { passive: true });
    window.addEventListener("keydown", onFirstGesture, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
  }, [armed]);

  useEffect(() => {
    ls.setBool("wg_muted", muted);
    const all = [bgmMainRef.current, bgmDisasterRef.current, sfxEatRef.current, sfxCatRef.current, sfxCatEndRef.current];
    all.forEach((a) => {
      if (a) a.muted = muted;
    });
  }, [muted]);

  const setMuted = useCallback((v: boolean) => setMutedState(v), []);

  const stopAllBgm = useCallback(() => {
    [bgmMainRef.current, bgmDisasterRef.current].forEach((a) => {
      if (!a) return;
      a.pause();
      a.currentTime = 0;
    });
  }, []);

  const playBgm = useCallback(async (mode: BgmMode) => {
    if (!armed) return;
    stopAllBgm();
    const target = mode === "disaster" ? bgmDisasterRef.current : bgmMainRef.current;
    if (target) {
      try {
        await target.play();
      } catch {
        /* ignore */
      }
    }
  }, [armed, stopAllBgm]);

  const stopBgm = useCallback(() => stopAllBgm(), [stopAllBgm]);

  const playSfx = useCallback((name: "sfx_eat" | "sfx_catastrophe" | "sfx_cat_end") => {
    const m: Record<string, HTMLAudioElement | null> = {
      sfx_eat: sfxEatRef.current,
      sfx_catastrophe: sfxCatRef.current,
      sfx_cat_end: sfxCatEndRef.current,
    };
    const a = m[name];
    if (!a || muted) return;
    try {
      a.currentTime = 0;
      void a.play();
    } catch {/* ignore */}
  }, [muted]);

  const value: AudioCtx = { armed, muted, setMuted, playBgm, stopBgm, playSfx };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useAudio() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAudio() must be used within <AudioProvider>");
  return ctx;
}
