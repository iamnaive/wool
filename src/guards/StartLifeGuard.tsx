// src/guards/StartLifeGuard.tsx
// Hard-kill "Start new life" UX without touching game logic.
// - Hides common selectors for the button if it appears.
// - Cancels clicks whose visible text looks like "Start new life".
// - Intercepts "wg:open-game" / "wg:start-new-life" and opens Vault instead when lives <= 0.
// English-only comments.

import React, { useEffect } from "react";

type Props = {
  lives: number;
  onRequireVault: () => void;
};

export default function StartLifeGuard({ lives, onRequireVault }: Props) {
  // 1) CSS hide for common selectors (non-invasive)
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-guard", "no-start-life");
    style.textContent = `
      #start-new-life,
      .start-new-life,
      [data-action="start-new-life"],
      [data-role="start-life"],
      [data-kind="start-life"],
      button.btn-start-life {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
    return () => { try { document.head.removeChild(style); } catch {} };
  }, []);

  // 2) Mutation observer: hide late-mounted nodes by text content
  useEffect(() => {
    const looksLikeStart = (el: Element) => {
      const t = (el.textContent || "").trim().toLowerCase();
      if (!t) return false;
      return t === "start new life" || t === "start life" || /start\s+new\s+life/i.test(t);
    };

    const hideIfNeeded = (el: Element) => {
      if (!(el instanceof HTMLElement)) return;
      if (looksLikeStart(el)) {
        el.style.display = "none";
        el.style.visibility = "hidden";
        el.style.pointerEvents = "none";
      }
      // Also scan descendants (cheap breadth-first)
      el.querySelectorAll("button, [role='button']").forEach((btn) => {
        if (looksLikeStart(btn)) {
          (btn as HTMLElement).style.display = "none";
          (btn as HTMLElement).style.visibility = "hidden";
          (btn as HTMLElement).style.pointerEvents = "none";
        }
      });
    };

    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n instanceof Element) hideIfNeeded(n);
        });
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  // 3) Capture clicks: block by visible text (as last resort)
  useEffect(() => {
    const onClickCapture = (e: MouseEvent) => {
      const path = e.composedPath ? e.composedPath() : (e as any).path || [];
      const els = (path as Element[]).filter((n) => n instanceof Element) as Element[];
      for (const el of els) {
        const txt = (el.textContent || "").trim().toLowerCase();
        if (!txt) continue;
        if (txt === "start new life" || txt === "start life" || /start\s+new\s+life/i.test(txt)) {
          e.preventDefault();
          e.stopPropagation();
          if (lives <= 0) onRequireVault();
          return;
        }
      }
    };
    document.addEventListener("click", onClickCapture, true); // capture phase
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [lives, onRequireVault]);

  // 4) Intercept custom events that could start the game
  useEffect(() => {
    const onOpenGame = (ev: Event) => {
      if (lives > 0) return; // allow when we actually have a life
      ev.stopImmediatePropagation?.();
      ev.stopPropagation?.();
      onRequireVault();
    };
    const onStartLife = (ev: Event) => {
      ev.stopImmediatePropagation?.();
      ev.stopPropagation?.();
      onRequireVault();
    };

    window.addEventListener("wg:open-game", onOpenGame as EventListener, true);
    window.addEventListener("wg:start-new-life", onStartLife as EventListener, true);

    return () => {
      window.removeEventListener("wg:open-game", onOpenGame as EventListener, true);
      window.removeEventListener("wg:start-new-life", onStartLife as EventListener, true);
    };
  }, [lives, onRequireVault]);

  return null;
}
