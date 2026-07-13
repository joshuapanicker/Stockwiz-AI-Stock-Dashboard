import { useEffect, useRef } from "react";

/**
 * The verdict wall — a full-bleed typographic interlude between the product
 * shot and the track record. Three rows of giant outlined type (BUY / WATCH /
 * SELL), tilted back in perspective, each row sliding in opposition as you
 * scroll. Words ignite to their verdict color on hover; one anchor word per
 * row stays lit so the wall reads even without a pointer.
 *
 * Scroll math writes transforms straight to row refs (no React state per
 * frame). Pure transform/opacity; guarded by prefers-reduced-motion.
 */

const ROWS: { word: string; color: string; glow: string; dir: 1 | -1 }[] = [
  { word: "BUY",   color: "#2EE6A8", glow: "rgba(46,230,168,0.45)",  dir: 1 },
  { word: "WATCH", color: "#FFAC26", glow: "rgba(255,172,38,0.4)",   dir: -1 },
  { word: "SELL",  color: "#FF5C7A", glow: "rgba(255,92,122,0.42)",  dir: 1 },
];

const REPEATS = 10;
const ANCHOR = 4; // which repeat stays permanently lit

export default function TypeWall() {
  const sectionRef = useRef<HTMLElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const section = sectionRef.current;
    if (!section) return;

    let rafId = 0;
    let ticking = false;

    function apply() {
      ticking = false;
      const r = section!.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the section's top enters the viewport bottom, 1 when its
      // bottom leaves the top — the row slide is scrubbed by this.
      const p = Math.max(0, Math.min(1, (vh - r.top) / (vh + r.height)));
      const drift = (p - 0.5) * 34; // total % of row width traversed
      rowRefs.current.forEach((row, i) => {
        if (!row) return;
        const dir = ROWS[i].dir;
        row.style.transform = `translateX(${-18 + drift * dir}%)`;
      });
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        rafId = requestAnimationFrame(apply);
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    apply();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-hidden
      className="relative z-10 overflow-hidden select-none py-10 md:py-16"
      style={{ perspective: "1100px" }}
    >
      {/* Edge fades so rows dissolve into the page instead of clipping hard */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 md:w-48 z-20"
        style={{ background: "linear-gradient(90deg, #06080D, transparent)" }} />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 md:w-48 z-20"
        style={{ background: "linear-gradient(270deg, #06080D, transparent)" }} />

      <div style={{ transform: "rotateX(14deg)", transformStyle: "preserve-3d" }}>
        {ROWS.map(({ word, color, glow, dir }, i) => (
          <div
            key={word}
            ref={el => { rowRefs.current[i] = el; }}
            className="typewall-row whitespace-nowrap font-display font-black will-change-transform"
            style={{
              transform: "translateX(-18%)",
              fontSize: "clamp(72px, 13vw, 200px)",
              lineHeight: 0.92,
              letterSpacing: "-0.02em",
              // Middle row sits slightly deeper — cheap depth without a real camera
              translate: i === 1 ? "0 0 -60px" : undefined,
            }}
          >
            {Array.from({ length: REPEATS }, (_, k) => (
              <span
                key={k}
                className="typewall-word inline-block px-[0.18em] transition-all duration-300"
                style={{
                  WebkitTextStroke: `1.5px ${k === ANCHOR ? color : "rgba(255,255,255,0.14)"}`,
                  color: k === ANCHOR ? color : "transparent",
                  textShadow: k === ANCHOR ? `0 0 42px ${glow}` : "none",
                  ["--ignite-color" as string]: color,
                  ["--ignite-glow" as string]: glow,
                }}
              >
                {word}
                <span className="inline-block align-middle mx-[0.22em] opacity-60"
                  style={{ fontSize: "0.14em", WebkitTextStroke: "0", color: dir === 1 ? color : "rgba(255,255,255,0.25)" }}>
                  {dir === 1 ? "▲" : "▼"}
                </span>
              </span>
            ))}
          </div>
        ))}
      </div>

      {/* Caption — the wall's one line of copy */}
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        <p className="font-mono text-[11px] md:text-xs tracking-[0.3em] uppercase text-white/70 bg-[#06080D]/70 backdrop-blur-md border border-white/10 rounded-full px-6 py-2.5">
          Every ticker leaves with one of three words
        </p>
      </div>
    </section>
  );
}
