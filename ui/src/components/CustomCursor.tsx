import { useEffect, useRef } from "react";

/**
 * Custom cursor — minimal futuristic reticle used across the whole app
 * (landing + terminal). Two parts:
 *
 *   - dot: 4px heat-gradient core, glued to the real pointer
 *   - ring: 30px reticle with corner ticks that lags behind on a spring
 *
 * States (driven by what the pointer is over):
 *   - interactive (links/buttons): ring expands and shifts to signal violet
 *   - text fields: the whole thing fades out so the native I-beam shows
 *   - pressed: ring contracts
 *
 * Mounted only for fine pointers; touch devices never see it. The native
 * cursor is hidden via html.has-custom-cursor rules in index.css.
 */

const INTERACTIVE =
  'a, button, [role="button"], label, select, summary, [data-cursor="link"], .cursor-pointer, input[type="checkbox"], input[type="radio"], input[type="range"]';
const TEXTUAL =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"]';

export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fine pointers only — touch devices keep their nothing
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.classList.add("has-custom-cursor");

    let x = -100, y = -100;      // pointer
    let rx = -100, ry = -100;    // ring (lagged)
    let seen = false;
    let hidden = false;
    let mode: "base" | "link" | "text" = "base";
    let pressed = false;
    let rafId = 0;
    let disposed = false;

    function setMode(next: "base" | "link" | "text") {
      if (mode === next) return;
      mode = next;
      paintMode();
    }

    function paintMode() {
      if (mode === "text" || hidden) {
        dot!.style.opacity = "0";
        ring!.style.opacity = "0";
        return;
      }
      dot!.style.opacity = "1";
      ring!.style.opacity = "1";
      const link = mode === "link";
      const scale = pressed ? 0.72 : link ? 1.55 : 1;
      ring!.style.setProperty("--ring-scale", String(scale));
      ring!.style.borderColor = link ? "rgba(124,92,255,0.9)" : "rgba(255,61,92,0.85)";
      ring!.style.boxShadow = link
        ? "0 0 18px rgba(124,92,255,0.35), inset 0 0 8px rgba(124,92,255,0.12)"
        : "0 0 14px rgba(255,61,92,0.28)";
    }

    function onMove(e: PointerEvent) {
      x = e.clientX;
      y = e.clientY;
      if (!seen) {
        seen = true;
        rx = x; ry = y;
        paintMode();
      }
      const t = e.target as Element | null;
      if (t?.closest?.(TEXTUAL)) setMode("text");
      else if (t?.closest?.(INTERACTIVE)) setMode("link");
      else setMode("base");
    }

    function onDown() { pressed = true; paintMode(); }
    function onUp() { pressed = false; paintMode(); }
    function onLeave() { hidden = true; paintMode(); }
    function onEnter() { hidden = false; paintMode(); }

    function tick() {
      if (disposed) return;
      rafId = requestAnimationFrame(tick);
      const k = reduced ? 1 : 0.22; // reduced motion: ring snaps, no chase
      rx += (x - rx) * k;
      ry += (y - ry) * k;
      dot!.style.transform = `translate(${x - 2}px, ${y - 2}px)`;
      ring!.style.transform = `translate(${rx - 15}px, ${ry - 15}px) scale(var(--ring-scale, 1))`;
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.documentElement.addEventListener("pointerenter", onEnter);
    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      document.documentElement.classList.remove("has-custom-cursor");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.documentElement.removeEventListener("pointerenter", onEnter);
    };
  }, []);

  return (
    <>
      <div
        ref={dotRef}
        aria-hidden
        className="fixed top-0 left-0 w-1 h-1 rounded-full pointer-events-none z-[9999] opacity-0"
        style={{
          background: "linear-gradient(135deg, #FF3D5C, #FF7A3D)",
          transition: "opacity 0.25s ease",
          willChange: "transform",
        }}
      />
      <div
        ref={ringRef}
        aria-hidden
        className="fixed top-0 left-0 w-[30px] h-[30px] rounded-full pointer-events-none z-[9999] opacity-0 border"
        style={{
          borderColor: "rgba(255,61,92,0.85)",
          borderWidth: 1.5,
          boxShadow: "0 0 14px rgba(255,61,92,0.28)",
          transition: "opacity 0.25s ease, border-color 0.3s ease, box-shadow 0.3s ease",
          willChange: "transform",
        }}
      />
    </>
  );
}
