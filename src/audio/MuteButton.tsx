// src/audio/MuteButton.tsx
// Simple mute toggle. English-only comments.

import React from "react";
import { useAudio } from "./AudioProvider";

type Props = {
  className?: string;
  titleWhenOn?: string;
  titleWhenMuted?: string;
};

const MuteButton: React.FC<Props> = ({
  className,
  titleWhenOn = "Sound: On",
  titleWhenMuted = "Sound: Muted",
}) => {
  const { muted, toggleMute } = useAudio();
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
};

export default MuteButton;
