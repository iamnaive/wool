// src/wool/WoolHUD.tsx
// Minimal HUD: shows total WOOL and today's remaining; optional floating balls.
// You can safely remove the <WoolBalls/> visual block if you want only counters.

import React, { useMemo } from "react";
import { useWool } from "./WoolProvider";

const BALL_SPRITES = [
  "/sprites/wool/ball1.png",
  "/sprites/wool/ball2.png",
  "/sprites/wool/ball3.png",
];

export default function WoolHUD() {
  const { total, todayRemaining, todayLimit, enabled } = useWool();

  return (
    <div className="wool-hud" style={{ position: "absolute", left: 12, bottom: 12, pointerEvents: "none" }}>
      <div style={{ background: "rgba(0,0,0,0.35)", color: "#fff", padding: "8px 10px", borderRadius: 8, fontSize: 14, pointerEvents: "auto" }}>
        <div><b>WOOL:</b> {total}</div>
        <div>Today: {todayLimit - todayRemaining}/{todayLimit} (left {todayRemaining})</div>
        <div>Status: {enabled ? "adult (drops active)" : "inactive"}</div>
      </div>

      {/* Optional: floating balls visual */}
      <WoolBalls count={todayRemaining} />
    </div>
  );
}

function WoolBalls({ count }: { count: number }) {
  const imgs = useMemo(() => {
    // Pick random sprites to show up to "count" visuals (purely cosmetic)
    const arr: string[] = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * BALL_SPRITES.length);
      arr.push(BALL_SPRITES[idx]);
    }
    return arr;
  }, [count]);

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      {imgs.map((src, i) => (
        <img
          key={i}
          src={src}
          alt="wool ball"
          width={28}
          height={28}
          style={{ imageRendering: "pixelated", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.35))" }}
        />
      ))}
    </div>
  );
}
