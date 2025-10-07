// src/audio/MuteButton.tsx
import React, { useEffect, useState } from "react";
import { audio } from "./AudioManager";

/**
 * Tiny mute toggle. Works even before audio.init():
 * the flag is applied once AudioProvider arms the system.
 */
export function MuteButton() {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    audio.setMuted(muted);
  }, [muted]);

  return (
    <button
      className="btn"
      onClick={() => setMuted((m) => !m)}
      title={muted ? "Unmute sound" : "Mute sound"}
      style={{ marginRight: 8 }}
    >
      {muted ? "🔇 Mute" : "🔊 Sound"}
    </button>
  );
}
