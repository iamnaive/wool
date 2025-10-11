// src/wool/WoolHUD.tsx
// Responsive WOOL HUD that avoids overlapping the sleep controls on mobile.
// Comments: English only.

import React, { useEffect, useMemo, useState } from "react";
import { useWool } from "./WoolProvider";

const BALL_SPRITES = ["/sprites/wool/ball1.png","/sprites/wool/ball2.png","/sprites/wool/ball3.png"];

export default function WoolHUD() {
  const { total, todayRemaining, todayLimit, enabled } = useWool();

  // Track small screens (<= 720px) to reposition + compact the HUD
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== "undefined" && window.innerWidth <= 720);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 720);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Place top-right on mobile so it won't cover the sleep row (which sits lower/center)
  const containerStyle: React.CSSProperties = isMobile
    ? { position: "fixed", top: 10, right: 10, pointerEvents: "none", zIndex: 5 }
    : { position: "fixed", left: 12, bottom: 12, pointerEvents: "none", zIndex: 5 };

  // Compact visual on mobile
  const fontSize = isMobile ? 12 : 14;
  const pad = isMobile ? "6px 8px" : "8px 10px";
  const radius = isMobile ? 6 : 8;

  return (
    <div className="wool-hud" style={containerStyle}>
      <div
        style={{
          background: "rgba(0,0,0,0.35)",
          color: "white",
          padding: pad,
          borderRadius: radius,
          fontSize,
          lineHeight: 1.25,
          pointerEvents: "auto",
          textShadow: "0 1px 1px rgba(0,0,0,0.35)",
          border: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(2px)",
          maxWidth: isMobile ? 220 : 260,
        }}
      >
        {isMobile ? (
          // Single-line compact text on mobile
          <div style={{ display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap" }}>
            <strong>WOOL</strong>
            <span>{total}</span>
            <span style={{ opacity: 0.8 }}>|</span>
            <span>{todayLimit - todayRemaining}/{todayLimit}</span>
            <span style={{ opacity: 0.8 }}>(left {todayRemaining})</span>
          </div>
        ) : (
          // More verbose on desktop
          <>
            <div><b>WOOL:</b> {total}</div>
            <div>Today: {todayLimit - todayRemaining}/{todayLimit} (left {todayRemaining})</div>
            <div>Status: {enabled ? "adult (drops active)" : "inactive"}</div>
          </>
        )}
      </div>

      {/* Optional floating balls: show only on desktop to reduce clutter on phones */}
      {!isMobile && <WoolBalls count={todayRemaining} />}
    </div>
  );
}

function WoolBalls({ count }: { count: number }) {
  const imgs = useMemo(() => {
    const arr: string[] = [];
    const n = Math.max(0, Math.min(6, count)); // cap visuals to 6
    for (let i = 0; i < n; i++) {
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
