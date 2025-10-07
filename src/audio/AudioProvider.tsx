// src/audio/AudioProvider.tsx
// Mount once near the root. Arms audio on first user gesture and starts main BGM.
// Adds conservative console logging for diagnosis; logic unchanged.

import React, { useEffect, useRef, useState } from "react";
import { audio } from "./AudioManager";

export default function AudioProvider({ children }: { children: React.ReactNode }) {
  const [armed, setArmed] = useState(audio.isInited());
  const armedRef = useRef(armed);
  armedRef.current = armed;

  useEffect(() => {
    if (armed) {
      console.info("[Audio] already armed");
      return;
    }

    const onFirstGesture = async () => {
      if (armedRef.current) return;
      console.info("[Audio] first user gesture → init()");
      audio.init();
      setArmed(true);

      try {
        await audio.playBgm("main");
        console.info("[Audio] main BGM started");
      } catch (e) {
        console.warn("[Audio] playBgm failed", e);
      }

      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };

    window.addEventListener("pointerdown", onFirstGesture, { passive: true });
    window.addEventListener("keydown", onFirstGesture);
    console.info("[Audio] waiting for user gesture to arm...");

    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
  }, [armed]);

  return <>{children}</>;
}
