// src/audio/AudioProvider.tsx
// Mount once near the root. It arms the audio system on first user gesture.

import React, { useEffect, useRef, useState } from "react";
import { audio } from "./AudioManager";

export default function AudioProvider({ children }: { children: React.ReactNode }) {
  const [armed, setArmed] = useState(audio.isInited());
  const armedRef = useRef(armed);
  armedRef.current = armed;

  useEffect(() => {
    if (armed) return;

    const onFirstGesture = async () => {
      if (armedRef.current) return;
      audio.init();
      setArmed(true);
      await audio.playBgm("main");
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };

    window.addEventListener("pointerdown", onFirstGesture, { passive: true });
    window.addEventListener("keydown", onFirstGesture);

    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
  }, [armed]);

  return <>{children}</>;
}
