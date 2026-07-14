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

// ── Scroll-fill text — outlined giant type that floods with color ──────────
// Two stacked copies of the same line: an outline ghost underneath and a
// gradient-filled copy on top, clipped by scroll progress so the fill pours
// in from the left as the line crosses the viewport.

export function ScrollFillText({ text, className = "" }: { text: string; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const fill = fillRef.current;
    if (!wrap || !fill) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fill.style.clipPath = "none"; // static: fully filled
      return;
    }

    let rafId = 0;
    let ticking = false;

    function apply() {
      ticking = false;
      const r = wrap!.getBoundingClientRect();
      const vh = window.innerHeight;
      // Fill runs 0→1 while the line travels the middle 70% of the viewport
      const p = Math.max(0, Math.min(1, (vh * 0.88 - r.top) / (vh * 0.7)));
      fill!.style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
    }

    function onScroll() {
      if (!ticking) { ticking = true; rafId = requestAnimationFrame(apply); }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    apply();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div ref={wrapRef} aria-hidden className={`relative select-none whitespace-nowrap ${className}`}>
      <span className="block font-display font-black"
        style={{ WebkitTextStroke: "1.5px rgba(255,255,255,0.16)", color: "transparent" }}>
        {text}
      </span>
      <span ref={fillRef} className="absolute inset-0 block font-display font-black text-gradient-heat"
        style={{ clipPath: "inset(0 100% 0 0)" }}>
        {text}
      </span>
    </div>
  );
}

// ── Smooth wheel — page-level scroll inertia ───────────────────────────────
// Wheel input no longer moves the page directly: it moves a target, and a
// rAF loop eases the real scroll position toward it, so the page glides to
// a stop after the wheel is released. Every scroll-driven effect (pipeline,
// rail, reel, wall) inherits the easing for free because the actual
// scrollTop is what animates.
//
// Native behavior is preserved for: touch devices (no wheel), scrollbar
// drags and keyboard (resynced via the scroll listener), pinch-zoom
// (ctrl+wheel), and wheel events over scrollable sub-elements (modals).

function scrollsInside(el: Element | null): boolean {
  let depth = 0;
  while (el && el !== document.body && depth < 12) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === "auto" || oy === "scroll") return true;
    }
    el = el.parentElement;
    depth++;
  }
  return false;
}

export function SmoothWheel() {
  useEffect(() => {
    if (REDUCED()) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    let target = window.scrollY;
    let current = window.scrollY;
    let rafId = 0;
    let active = false;
    let lastT = 0;

    const maxScroll = () =>
      document.documentElement.scrollHeight - window.innerHeight;

    // Glide decay rate per second (lower = floatier, longer coast).
    // Time-based so the feel is identical on 60Hz and 144Hz displays.
    const STIFFNESS = 3.4;

    function tick(now: number) {
      const dt = Math.min(0.05, lastT ? (now - lastT) / 1000 : 0.016);
      lastT = now;
      current += (target - current) * (1 - Math.exp(-STIFFNESS * dt));
      if (Math.abs(target - current) < 0.5) {
        current = target;
        window.scrollTo(0, current);
        active = false;
        return;
      }
      window.scrollTo(0, current);
      rafId = requestAnimationFrame(tick);
    }

    function onWheel(e: WheelEvent) {
      if (e.ctrlKey) return; // pinch-zoom
      if (scrollsInside(e.target as Element)) return; // modals etc.
      e.preventDefault();
      const mult = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      target = Math.max(0, Math.min(maxScroll(), target + e.deltaY * mult));
      if (!active) {
        active = true;
        current = window.scrollY;
        lastT = 0;
        rafId = requestAnimationFrame(tick);
      }
    }

    // Scrollbar drags, keyboard, anchor jumps: adopt the position instead
    // of fighting it
    function onScroll() {
      if (!active) target = current = window.scrollY;
    }

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
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
