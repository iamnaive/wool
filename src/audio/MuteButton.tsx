// src/audio/MuteButton.tsx
import React, { useEffect, useState } from "react";
import { audio } from "./AudioManager";

export function MuteButton() {
  const [muted, setMuted] = useState(false);
  useEffect(() => { audio.setMuted(muted); }, [muted]);
  return (
    <button
      onClick={() => setMuted(m => !m)}
      style={{
        position: "absolute",
        right: 12,
        bottom: 12,
        padding: "6px 10px",
        borderRadius: 8,
        background: "rgba(0,0,0,0.4)",
        color: "#fff",
        border: "none",
        fontSize: 12,
        cursor: "pointer",
        userSelect: "none"
      }}
    >
      {muted ? "Unmute" : "Mute"}
    </button>
  );
}
