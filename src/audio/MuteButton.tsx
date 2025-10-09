// src/audio/MuteButton.tsx
// Small mute/unmute toggle button using AudioProvider state.

import React from "react";
import { useAudio } from "./AudioProvider";

export default function MuteButton() {
  const { muted, setMuted, armed } = useAudio();
  return (
    <button
      title={armed ? (muted ? "Unmute" : "Mute") : "Tap to enable audio"}
      onClick={() => setMuted(!muted)}
      className="btn btn--mute"
      style={{ opacity: armed ? 1 : 0.8 }}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
