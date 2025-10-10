// src/audio/MuteButton.tsx
// Small mute/unmute toggle button using AudioProvider state.
// Visuals match the provided sample: "btn btn--mute", emoji icon, opacity when not armed.

import React from "react";
import { useAudio } from "./AudioProvider";

export default function MuteButton() {
  const { muted, toggleMute, isArmed } = useAudio();
  const armed = isArmed;

  return (
    <button
      title={armed ? (muted ? "Unmute" : "Mute") : "Tap to enable audio"}
      onClick={toggleMute}
      className="btn btn--mute"
      style={{ opacity: armed ? 1 : 0.8 }}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
