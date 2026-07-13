import { useEffect, useRef, useState } from "react";

/**
 * Small interaction effects shared across the landing page:
 *
 *  - GlitchText: terminal-style chromatic glitch that fires in brief bursts
 *    every few seconds (CSS-driven, see .glitch in index.css).
 *  - ScrambleLink: nav links decode from random glyphs to their label on
 *    hover — the "terminal is listening" voice.
 *  - VelocityWarp: wraps the page flow and skews it fractionally with
 *    scroll velocity, springing back to rest. Transform is cleared at rest
 *    so position:fixed descendants are unaffected while idle.
 */

const REDUCED = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── Glitch text ────────────────────────────────────────────────────────────

export function GlitchText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`glitch ${className}`} data-text={text}>
      {text}
    </span>
  );
}

// ── Scramble-on-hover link ─────────────────────────────────────────────────

const GLYPHS = "!<>-_\\/[]{}—=+*^?#$%&0123456789";

export function ScrambleLink({ label, href, className = "" }: {
  label: string; href: string; className?: string;
}) {
  const [display, setDisplay] = useState(label);
  const timer = useRef<number | null>(null);

  function stop() {
    if (timer.current != null) { clearInterval(timer.current); timer.current = null; }
  }

  function start() {
    if (REDUCED()) return;
    stop();
    let frame = 0;
    timer.current = window.setInterval(() => {
      frame++;
      const settled = Math.floor(frame / 2);
      setDisplay(
        label.split("").map((ch, i) => {
          if (ch === " ") return " ";
          if (i < settled) return ch;
          return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }).join(""),
      );
      if (settled >= label.length) { stop(); setDisplay(label); }
    }, 28);
  }

  useEffect(() => stop, []);

  return (
    <a href={href} className={className}
      onMouseEnter={start}
      onMouseLeave={() => { stop(); setDisplay(label); }}>
      {/* Reserve width so scramble glyphs don't reflow neighbors */}
      <span className="inline-block relative">
        <span className="invisible">{label}</span>
        <span className="absolute inset-0">{display}</span>
      </span>
    </a>
  );
}

// ── Spotlight card — a lens follows the pointer inside the card ────────────

export function SpotlightCard({ children, color, className = "" }: {
  children: React.ReactNode; color?: string; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }

  return (
    <div ref={ref} onMouseMove={onMove}
      className={`spot-card ${className}`}
      style={color ? ({ "--spot-color": color } as React.CSSProperties) : undefined}>
      {children}
    </div>
  );
}

// ── Scroll-velocity warp ───────────────────────────────────────────────────

export function VelocityWarp({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (REDUCED()) return;
    const el = ref.current;
    if (!el) return;

    let rafId = 0;
    let disposed = false;
    let lastY = window.scrollY;
    let vel = 0;    // smoothed px/frame
    let skew = 0;   // current applied skew

    function tick() {
      if (disposed) return;
      rafId = requestAnimationFrame(tick);
      const y = window.scrollY;
      vel += ((y - lastY) - vel) * 0.12;
      lastY = y;
      const target = Math.max(-1.1, Math.min(1.1, vel * 0.022));
      skew += (target - skew) * 0.14;
      if (Math.abs(skew) < 0.012 && Math.abs(target) < 0.012) {
        // At rest: clear the transform entirely so the wrapper stops being
        // a containing block (keeps fixed/sticky descendants honest).
        if (el!.style.transform !== "") el!.style.transform = "";
        return;
      }
      el!.style.transform = `skewY(${skew.toFixed(3)}deg)`;
    }

    rafId = requestAnimationFrame(tick);
    return () => { disposed = true; cancelAnimationFrame(rafId); };
  }, []);

  return <div ref={ref} style={{ transformOrigin: "50% 50%", willChange: "transform" }}>{children}</div>;
}
