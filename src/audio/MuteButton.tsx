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
      type="button"
      onClick={toggleMute}
      title={muted ? titleWhenMuted : titleWhenOn}
      className={className ?? "px-3 py-1 rounded-md border text-sm"}
      aria-pressed={muted}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
};

export default MuteButton;
