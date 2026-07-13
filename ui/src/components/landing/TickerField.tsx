import { useEffect, useRef } from "react";
import { API_BASE } from "../../hooks/useApi";

/**
 * The signature element: a full-viewport canvas of flickering ticker cells —
 * the market as noise. A spotlight lens (cursor on desktop, slow auto-sweep
 * otherwise) reveals cells and stamps them PASS/FAIL as the criteria engine
 * would. Every few seconds one passing cell "ignites" and hands its symbol
 * to the verdict card via onIgnite.
 *
 * Engineering constraints (from the design plan):
 *  - Canvas, not DOM: hundreds of animated nodes stay GPU-cheap.
 *  - Progressive enhancement: mounts over the static CSS grid texture, so
 *    LCP never waits on this. Seed prices are static; real prices hydrate
 *    from the public universe endpoint when it responds.
 *  - Pauses via IntersectionObserver when scrolled away.
 *  - prefers-reduced-motion: draws one static frame, no loop, no ignite.
 */

export interface IgnitedTicker {
  symbol: string;
  price: number;
  changePct: number;
}

interface Props {
  onIgnite?: (t: IgnitedTicker) => void;
  className?: string;
}

// Static seed — real enough to render instantly; hydrated with live universe
// prices when the API answers. (symbol, base price)
const SEED: [string, number][] = [
  ["AAPL", 232.4], ["NVDA", 211.0], ["MSFT", 428.2], ["GOOGL", 182.6],
  ["AMZN", 218.5], ["META", 585.1], ["TSLA", 262.9], ["AVGO", 172.3],
  ["AMD", 121.7], ["CRM", 268.4], ["ORCL", 174.9], ["ADBE", 487.2],
  ["NFLX", 692.8], ["INTC", 21.5], ["QCOM", 158.6], ["TXN", 196.3],
  ["JPM", 248.7], ["BAC", 46.2], ["WFC", 76.1], ["GS", 601.4],
  ["MS", 133.8], ["V", 311.2], ["MA", 528.6], ["AXP", 296.3],
  ["UNH", 512.4], ["JNJ", 152.7], ["LLY", 782.5], ["PFE", 26.8],
  ["MRK", 94.6], ["ABBV", 192.3], ["TMO", 528.1], ["ABT", 118.9],
  ["XOM", 108.2], ["CVX", 152.6], ["COP", 98.4], ["SLB", 40.1],
  ["WMT", 96.8], ["COST", 918.3], ["PG", 162.5], ["KO", 71.3],
  ["PEP", 152.9], ["MCD", 292.4], ["NKE", 71.6], ["SBUX", 92.1],
  ["HD", 386.2], ["LOW", 246.8], ["CAT", 396.5], ["DE", 448.2],
  ["BA", 178.3], ["GE", 202.7], ["RTX", 128.4], ["LMT", 476.9],
  ["UNP", 228.6], ["UPS", 118.2], ["FDX", 252.3], ["DAL", 62.4],
  ["T", 22.8], ["VZ", 43.6], ["TMUS", 228.4], ["DIS", 96.2],
  ["CMCSA", 36.9], ["PLTR", 142.6], ["SNOW", 168.2], ["UBER", 84.3],
  ["ABNB", 132.6], ["SHOP", 108.4], ["SQ", 82.1], ["PYPL", 78.6],
  ["COIN", 268.3], ["SMCI", 42.8], ["MU", 112.4], ["LRCX", 92.6],
  ["AMAT", 186.3], ["KLAC", 712.5], ["ASML", 742.8], ["TSM", 192.4],
  ["F", 11.2], ["GM", 48.6], ["RIVN", 12.4], ["NIO", 4.8],
];

const CELL_W = 136;
const CELL_H = 46;
const SPOT_RADIUS = 230;
const IGNITE_EVERY_MS = 8000;
const FPS = 30;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface Cell {
  sym: string;
  base: number;
  price: number;
  changePct: number;
  flash: number; // 0..1 brightness flash decay
  x: number;
  y: number;
  passes: boolean;
}

export default function TickerField({ onIgnite, className = "" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onIgniteRef = useRef(onIgnite);
  onIgniteRef.current = onIgnite;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pool: [string, number][] = [...SEED];
    let cells: Cell[] = [];
    let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Spotlight state
    let spotX = 0, spotY = 0, targetX = 0, targetY = 0;
    let lastPointer = 0;
    let t = 0;

    // Ignite state
    let igniteCell: Cell | null = null;
    let igniteAt = 0;

    let running = true;   // IntersectionObserver toggle
    let disposed = false;
    let rafId = 0;
    let lastDraw = 0;

    function buildCells() {
      const cols = Math.ceil(W / CELL_W) + 1;
      const rows = Math.ceil(H / CELL_H) + 1;
      cells = [];
      let i = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const [sym, base] = pool[i % pool.length];
          const drift = ((hash(sym + r) % 600) - 300) / 10000; // ±3%
          cells.push({
            sym, base,
            price: base * (1 + drift),
            changePct: drift * 100,
            flash: 0,
            x: c * CELL_W + 10,
            y: r * CELL_H + 16,
            passes: hash(sym) % 7 < 4,
          });
          i++;
        }
      }
    }

    function resize() {
      W = parent!.clientWidth;
      H = parent!.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      spotX = targetX = W / 2;
      spotY = targetY = H * 0.42;
      buildCells();
      if (reduced) drawFrame(); // static single frame
    }

    function drawFrame() {
      ctx!.clearRect(0, 0, W, H);
      ctx!.textBaseline = "top";

      const now = performance.now();

      for (const cell of cells) {
        const dx = cell.x + CELL_W / 2 - 10 - spotX;
        const dy = cell.y + CELL_H / 2 - 16 - spotY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const prox = Math.max(0, 1 - dist / SPOT_RADIUS); // 0..1 inside lens

        // The lens does the revealing: cells rest near-dark (0.055) and only
        // wake under the spotlight. Flicker flashes are likewise proximity-
        // gated so the field's edges stay calm instead of shimmering.
        let bright = 0.055 + prox * 0.8 + cell.flash * (0.05 + prox * 0.45);
        if (cell.flash > 0) cell.flash = Math.max(0, cell.flash - 0.06);

        const isIgnited = igniteCell === cell && now - igniteAt < 1400;
        if (isIgnited) bright = 1;

        // Symbol
        ctx!.font = "600 10px 'JetBrains Mono', monospace";
        ctx!.fillStyle = `rgba(242,245,249,${bright * 0.8})`;
        ctx!.fillText(cell.sym, cell.x, cell.y);

        // Price
        ctx!.font = "400 9px 'JetBrains Mono', monospace";
        ctx!.fillStyle = `rgba(242,245,249,${bright * 0.45})`;
        ctx!.fillText(`$${cell.price.toFixed(2)}`, cell.x, cell.y + 13);

        // Change % — semantic color only
        const up = cell.changePct >= 0;
        ctx!.fillStyle = up
          ? `rgba(46,230,168,${bright * 0.75})`
          : `rgba(255,92,122,${bright * 0.75})`;
        ctx!.fillText(
          `${up ? "+" : ""}${cell.changePct.toFixed(2)}%`,
          cell.x + 62, cell.y + 13,
        );

        // Criteria stamp — only inside the lens, where the engine "reads"
        if (prox > 0.5) {
          const stampAlpha = (prox - 0.5) / 0.5;
          const label = cell.passes ? "PASS" : "FAIL";
          const color = cell.passes ? "46,230,168" : "255,92,122";
          ctx!.font = "600 8px 'JetBrains Mono', monospace";
          const tw = ctx!.measureText(label).width;
          const bx = cell.x + 62, by = cell.y - 2;
          ctx!.strokeStyle = `rgba(${color},${stampAlpha * 0.65})`;
          ctx!.lineWidth = 1;
          ctx!.strokeRect(bx - 3, by - 2, tw + 6, 12);
          ctx!.fillStyle = `rgba(${color},${stampAlpha * 0.95})`;
          ctx!.fillText(label, bx, by);
        }

        // Ignite ring
        if (isIgnited) {
          const k = (now - igniteAt) / 1400; // 0..1
          const ringAlpha = (1 - k) * 0.9;
          ctx!.strokeStyle = `rgba(46,230,168,${ringAlpha})`;
          ctx!.lineWidth = 1.5;
          ctx!.strokeRect(cell.x - 8, cell.y - 6, CELL_W - 8 + k * 10, CELL_H - 12 + k * 6);
        }
      }
    }

    function tick(now: number) {
      if (disposed) return;
      rafId = requestAnimationFrame(tick);
      if (!running) return;
      if (now - lastDraw < 1000 / FPS) return;
      lastDraw = now;
      t += 1 / FPS;

      // Spotlight target: pointer if fresh, otherwise slow lissajous sweep
      if (now - lastPointer > 3000) {
        targetX = W * (0.5 + 0.36 * Math.sin(t * 0.21));
        targetY = H * (0.44 + 0.30 * Math.sin(t * 0.13 + 1.7));
      }
      spotX += (targetX - spotX) * 0.06;
      spotY += (targetY - spotY) * 0.06;

      // Flicker: a few cells jitter each frame — discrete, like a terminal
      const jitters = Math.max(2, Math.floor(cells.length * 0.02));
      for (let j = 0; j < jitters; j++) {
        const cell = cells[Math.floor(Math.random() * cells.length)];
        const delta = (Math.random() - 0.5) * 0.0024;
        cell.price = cell.price * (1 + delta);
        cell.changePct = ((cell.price - cell.base) / cell.base) * 100;
        cell.flash = Math.min(1, cell.flash + 0.5);
      }

      drawFrame();
    }

    function onPointerMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x >= -40 && x <= rect.width + 40 && y >= -40 && y <= rect.height + 40) {
        targetX = x;
        targetY = y;
        lastPointer = performance.now();
      }
    }

    function igniteLoop() {
      if (disposed || !running) return;
      // Pick the passing cell nearest the spotlight — the lens "finds" it
      let best: Cell | null = null;
      let bestDist = Infinity;
      for (const cell of cells) {
        if (!cell.passes) continue;
        const dx = cell.x + CELL_W / 2 - spotX;
        const dy = cell.y + CELL_H / 2 - spotY;
        const d = dx * dx + dy * dy;
        if (d < bestDist) { bestDist = d; best = cell; }
      }
      if (best) {
        igniteCell = best;
        igniteAt = performance.now();
        onIgniteRef.current?.({
          symbol: best.sym,
          price: best.price,
          changePct: best.changePct,
        });
      }
    }

    // Hydrate seed with real universe prices (graceful: static seed stands
    // if this never resolves)
    fetch(`${API_BASE}/universe/signals?limit=60`)
      .then(r => (r.ok ? r.json() : null))
      .then((rows: any[] | null) => {
        if (!rows || disposed) return;
        const live = new Map<string, number>();
        for (const row of rows) {
          const p = row?.metrics?.close_price;
          if (row?.symbol && typeof p === "number") live.set(row.symbol, p);
        }
        if (!live.size) return;
        for (const cell of cells) {
          const p = live.get(cell.sym);
          if (p) { cell.base = p; cell.price = p * (1 + cell.changePct / 100); }
        }
      })
      .catch(() => {});

    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    resize();

    let igniteTimer: ReturnType<typeof setInterval> | undefined;
    let firstIgnite: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(
      entries => { running = entries[0]?.isIntersecting ?? true; },
      { threshold: 0.05 },
    );
    io.observe(canvas);

    if (!reduced) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      rafId = requestAnimationFrame(tick);
      firstIgnite = setTimeout(igniteLoop, 1600); // card wakes up quickly
      igniteTimer = setInterval(igniteLoop, IGNITE_EVERY_MS);
    } else {
      // Static verdict for the card, once
      firstIgnite = setTimeout(igniteLoop, 100);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      if (igniteTimer) clearInterval(igniteTimer);
      if (firstIgnite) clearTimeout(firstIgnite);
      window.removeEventListener("pointermove", onPointerMove);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{
        // Same radial mask as the CSS texture beneath — the field breathes
        // out of darkness instead of ending at a hard edge.
        WebkitMaskImage: "radial-gradient(ellipse 85% 75% at 50% 42%, black 30%, transparent 80%)",
        maskImage: "radial-gradient(ellipse 85% 75% at 50% 42%, black 30%, transparent 80%)",
      }}
    />
  );
}
