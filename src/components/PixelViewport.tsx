import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * PixelViewport
 * Fixed logical resolution (width × height) with integer upscaling (nearest-neighbor).
 * Instantly measures on mount so the initial scale is correct (no 1x flash).
 */
export default function PixelViewport({
  width,
  height,
  className,
  children,
}: {
  width: number;
  height: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Read current available size of the host
  const measure = () => {
    const el = hostRef.current;
    if (!el) return;
    // Use clientWidth/Height for layout pixels (excludes scrollbars)
    const w = Math.max(0, Math.floor(el.clientWidth));
    const h = Math.max(0, Math.floor(el.clientHeight));
    // Avoid useless renders
    setAvail((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
  };

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    // ResizeObserver for container changes
    const ro = new ResizeObserver(() => {
      measure();
    });
    ro.observe(el);

    // Immediate measurements to avoid 1x flash on first paint
    // 1) sync (in case parent is already laid out)
    measure();
    // 2) next frame (after CSS/layout settles)
    const raf1 = requestAnimationFrame(measure);
    // 3) fallback microtask tick (some browsers batch RO)
    const to1 = setTimeout(measure, 0);

    // Window-level changes (orientation, DPR)
    const onWinResize = () => measure();
    window.addEventListener("resize", onWinResize);
    window.addEventListener("orientationchange", onWinResize);

    // React to DPR changes (Safari/iOS dynamic viewport, zoom)
    const mq = window.matchMedia
      ? window.matchMedia(`(resolution: ${Math.round(window.devicePixelRatio || 1)}dppx)`)
      : null;
    const onDprMaybeChanged = () => measure();
    if (mq && "addEventListener" in mq) {
      mq.addEventListener("change", onDprMaybeChanged);
    }

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf1);
      clearTimeout(to1);
      window.removeEventListener("resize", onWinResize);
      window.removeEventListener("orientationchange", onWinResize);
      if (mq && "removeEventListener" in mq) {
        mq.removeEventListener("change", onDprMaybeChanged);
      }
    };
  }, []);

  const scale = useMemo(() => {
    if (!avail.w || !avail.h) return 1;
    const s = Math.floor(Math.min(avail.w / width, avail.h / height));
    return Math.max(1, s);
  }, [avail, width, height]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Logical plane: width × height (unscaled) */}
      <div
        style={{
          width,
          height,
          position: "relative",
          imageRendering: "pixelated",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          // Helps reduce subpixel jitter on some browsers
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
