"use client";

import { useEffect, useState } from "react";

/** Scrolling less than this many pixels between two frames is ignored, so small jitter never flickers. */
export const SCROLL_THRESHOLD = 8;
/** Within this distance of the top or bottom of the page the button is always shown. */
export const EDGE_DISTANCE = 48;

/**
 * Decides whether a floating control should be hidden: true while scrolling down, false while
 * scrolling up and at the very top or bottom of the page.
 */
export function nextHidden(previous: boolean, delta: number, y: number, maxY: number): boolean {
  if (y < EDGE_DISTANCE || y > maxY - EDGE_DISTANCE) return false;
  if (Math.abs(delta) < SCROLL_THRESHOLD) return previous;
  return delta > 0;
}

export function useHideOnScroll(onHide?: () => void): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    let current = false;
    let frame = 0;
    function update() {
      frame = 0;
      const y = window.scrollY;
      const maxY = document.documentElement.scrollHeight - window.innerHeight;
      const delta = y - last;
      const next = nextHidden(current, delta, y, maxY);
      if (Math.abs(delta) >= SCROLL_THRESHOLD || y < EDGE_DISTANCE || y > maxY - EDGE_DISTANCE) last = y;
      if (next !== current) {
        current = next;
        setHidden(next);
        if (next) onHide?.();
      }
    }
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [onHide]);

  return hidden;
}
