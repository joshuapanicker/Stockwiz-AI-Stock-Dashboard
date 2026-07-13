import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../../hooks/useApi";
import TickerLogo from "../TickerLogo";

/**
 * Page-wide atmosphere — the connective tissue that makes the landing feel
 * like one continuous space instead of stacked sections:
 *
 *  - DataConstellation: a fixed canvas of drifting data-points joined by
 *    faint lines when they pass close — the "signal from noise" motif
 *    running behind the entire page. Reacts to scroll velocity (particles
 *    get pushed as you scroll, then settle).
 *  - CursorGlow: a soft teal lens that trails the pointer everywhere, so
 *    the hero's spotlight idea extends across the whole page.
 *  - ScrollProgress: 2px teal→violet bar at the very top.
 *  - TickerTape: infinite price marquee strip (hydrates with real universe
 *    prices) used as a section divider — the tape runs through the page.
 *
 * All of it: transform/opacity/canvas only, paused off-screen or on
 * prefers-reduced-motion, zero dependencies.
 */

const REDUCED = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── Data constellation ─────────────────────────────────────────────────────

interface Dot {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  violet: boolean;
}

export function DataConstellation() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (REDUCED()) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0, H = 0;
    let dots: Dot[] = [];
    let rafId = 0;
    let disposed = false;
    let lastDraw = 0;
    let lastScrollY = window.scrollY;
    let scrollKick = 0;
    // Pointer parked far off-screen until it moves
    let mx = -9999, my = -9999;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(70, Math.floor((W * H) / 26000));
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.06 - Math.random() * 0.1,
        r: 0.8 + Math.random() * 1.4,
        violet: Math.random() < 0.25,
      }));
    }

    function onScroll() {
      const y = window.scrollY;
      // Scroll pushes the field: fast scroll = particles streak, then settle
      scrollKick = Math.max(-2.2, Math.min(2.2, (y - lastScrollY) * 0.02));
      lastScrollY = y;
    }

    function onPointer(e: PointerEvent) {
      mx = e.clientX;
      my = e.clientY;
    }

    function tick(now: number) {
      if (disposed) return;
      rafId = requestAnimationFrame(tick);
      if (document.hidden) return;
      if (now - lastDraw < 33) return; // ~30fps
      lastDraw = now;

      ctx!.clearRect(0, 0, W, H);
      scrollKick *= 0.9; // settle

      for (const d of dots) {
        // The pointer repels nearby dots — the field parts around the cursor
        const pdx = d.x - mx, pdy = d.y - my;
        const pd2 = pdx * pdx + pdy * pdy;
        if (pd2 < 130 * 130 && pd2 > 0.01) {
          const pd = Math.sqrt(pd2);
          const f = ((130 - pd) / 130) * 0.35;
          d.x += (pdx / pd) * f;
          d.y += (pdy / pd) * f;
        }
        d.x += d.vx;
        d.y += d.vy - scrollKick;
        if (d.y < -10) { d.y = H + 10; d.x = Math.random() * W; }
        if (d.y > H + 10) { d.y = -10; d.x = Math.random() * W; }
        if (d.x < -10) d.x = W + 10;
        if (d.x > W + 10) d.x = -10;
      }

      // Connective lines — the constellation
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i], b = dots[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 120 * 120) {
            // The noise is red; the connections it forms are signal-violet
            const alpha = (1 - Math.sqrt(d2) / 120) * 0.055;
            ctx!.strokeStyle = `rgba(124,92,255,${alpha})`;
            ctx!.lineWidth = 0.6;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      for (const d of dots) {
        ctx!.fillStyle = d.violet
          ? "rgba(124,92,255,0.22)"
          : "rgba(255,61,92,0.16)";
        ctx!.beginPath();
        ctx!.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
}

// ── Ambient washes — the page's color journey, scrubbed by scroll ──────────
// Two fixed radial washes whose colors travel teal → violet → amber → teal
// as you move down the page, so each act of the story has its own cast.

type RGB = [number, number, number];
const WASH_STOPS: { top: RGB; corner: RGB }[] = [
  { top: [255, 61, 92],   corner: [124, 92, 255] },  // hero — heat / signal
  { top: [124, 92, 255],  corner: [63, 167, 252] },  // pipeline — violet / sky
  { top: [255, 122, 61],  corner: [255, 61, 92] },   // verdict wall — full heat
  { top: [124, 92, 255],  corner: [255, 61, 92] },   // ledger + CTA — both voices
];

function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function AmbientWashes() {
  const topRef = useRef<HTMLDivElement>(null);
  const cornerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId = 0;
    let ticking = false;

    function apply() {
      ticking = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.max(0, Math.min(1, window.scrollY / max)) : 0;
      const seg = p * (WASH_STOPS.length - 1);
      const i = Math.min(WASH_STOPS.length - 2, Math.floor(seg));
      const t = seg - i;
      const top = lerpRGB(WASH_STOPS[i].top, WASH_STOPS[i + 1].top, t);
      const corner = lerpRGB(WASH_STOPS[i].corner, WASH_STOPS[i + 1].corner, t);
      if (topRef.current) {
        topRef.current.style.background =
          `radial-gradient(ellipse 80% 50% at 50% -10%, rgba(${top[0] | 0},${top[1] | 0},${top[2] | 0},0.07) 0%, transparent 60%)`;
      }
      if (cornerRef.current) {
        cornerRef.current.style.background =
          `radial-gradient(ellipse 50% 40% at 100% 70%, rgba(${corner[0] | 0},${corner[1] | 0},${corner[2] | 0},0.06) 0%, transparent 55%)`;
      }
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
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden>
      <div ref={topRef} className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(255,61,92,0.07) 0%, transparent 60%)" }} />
      <div ref={cornerRef} className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 50% 40% at 100% 70%, rgba(124,92,255,0.06) 0%, transparent 55%)" }} />
    </div>
  );
}

// ── Cursor glow — the lens follows you through the whole page ─────────────

export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (REDUCED()) return;
    // Pointer-driven only — skip touch devices entirely
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const el = ref.current;
    if (!el) return;

    let x = window.innerWidth / 2, y = window.innerHeight / 3;
    let tx = x, ty = y;
    let rafId = 0;
    let disposed = false;
    let seen = false;

    function onMove(e: PointerEvent) {
      tx = e.clientX;
      ty = e.clientY;
      if (!seen) { seen = true; el!.style.opacity = "1"; }
    }

    function tick() {
      if (disposed) return;
      rafId = requestAnimationFrame(tick);
      x += (tx - x) * 0.09;
      y += (ty - y) * 0.09;
      el!.style.transform = `translate(${x - 260}px, ${y - 260}px)`;
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    rafId = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="fixed top-0 left-0 w-[520px] h-[520px] pointer-events-none z-[15] opacity-0 transition-opacity duration-700"
      style={{
        background: "radial-gradient(circle, rgba(255,61,92,0.065) 0%, rgba(124,92,255,0.04) 40%, transparent 68%)",
        mixBlendMode: "screen",
        willChange: "transform",
      }}
    />
  );
}

// ── Scroll progress — teal→violet hairline at the very top ────────────────

export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onScroll() {
      const el = ref.current;
      if (!el) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      el.style.transform = `scaleX(${p})`;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 h-[2px] z-50 pointer-events-none">
      <div
        ref={ref}
        className="h-full w-full origin-left"
        style={{
          transform: "scaleX(0)",
          background: "linear-gradient(90deg, #FF3D5C, #FF7A3D 45%, #7C5CFF)",
          willChange: "transform",
        }}
      />
    </div>
  );
}

// ── Ticker tape — the market runs through the page ────────────────────────

const TAPE_SEED: [string, number, number][] = [
  ["AAPL", 232.4, 0.81], ["NVDA", 211.0, -2.39], ["MSFT", 428.2, 0.44],
  ["GOOGL", 182.6, 1.02], ["AMZN", 218.5, 0.36], ["META", 585.1, -0.21],
  ["TSLA", 262.9, -1.81], ["JPM", 248.7, -0.44], ["V", 311.2, 0.19],
  ["UNH", 512.4, -2.03], ["XOM", 108.2, 2.56], ["WMT", 96.8, -0.3],
  ["LLY", 782.5, 2.59], ["COST", 918.3, 0.67], ["HD", 386.2, -0.33],
  ["CAT", 396.5, 1.4], ["DIS", 96.2, 0.85], ["PLTR", 142.6, 3.21],
  ["AMD", 121.7, -0.6], ["KO", 71.3, 0.12], ["GS", 601.4, 1.56],
  ["CVX", 152.6, -0.51], ["INTC", 21.5, 0.91], ["BA", 178.3, -1.1],
];

export function TickerTape({ hot = false, logos = false }: { hot?: boolean; logos?: boolean } = {}) {
  const [rows, setRows] = useState(TAPE_SEED);

  useEffect(() => {
    let live = true;
    fetch(`${API_BASE}/universe/signals?limit=30`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: any[] | null) => {
        if (!data || !live) return;
        const next: [string, number, number][] = [];
        for (const row of data) {
          const p = row?.metrics?.close_price;
          const lo = row?.metrics?.low_52_week;
          if (row?.symbol && typeof p === "number") {
            // No intraday change in this payload — derive a stable pseudo
            // move per symbol so the tape stays consistent between loops
            let h = 0;
            for (const ch of row.symbol) h = (h * 31 + ch.charCodeAt(0)) | 0;
            const chg = typeof lo === "number" && lo > 0
              ? ((Math.abs(h) % 500) - 250) / 100
              : 0;
            next.push([row.symbol, p, chg]);
          }
        }
        if (next.length >= 12) setRows(next);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const items = [...rows, ...rows]; // doubled for the -50% loop

  if (hot) {
    // The editorial band — solid heat, black type, unapologetic
    return (
      <div className="ticker-tape ticker-tape-hot relative z-10 overflow-hidden py-3 select-none" aria-hidden>
        <div className="ticker-tape-track">
          {items.map(([sym, price, chg], i) => (
            <span key={`${sym}-${i}`} className="inline-flex items-baseline gap-2 px-6 font-mono text-xs font-bold tracking-wider text-black">
              <span>{sym}</span>
              <span className="opacity-60">${price.toFixed(2)}</span>
              <span>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ticker-tape relative z-10 border-y border-white/[0.06] bg-white/[0.015] overflow-hidden py-2.5 select-none" aria-hidden>
      <div className="ticker-tape-track">
        {items.map(([sym, price, chg], i) => (
          <span key={`${sym}-${i}`} className="inline-flex items-center gap-2 px-6 font-mono text-[11px] tracking-wider">
            {logos && <TickerLogo symbol={sym} size={16} className="opacity-90" />}
            <span className="text-white/70 font-semibold">{sym}</span>
            <span className="text-white/40">${price.toFixed(2)}</span>
            <span className={chg >= 0 ? "text-green/80" : "text-red/80"}>
              {chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
