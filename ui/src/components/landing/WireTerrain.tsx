import { useEffect, useRef } from "react";

/**
 * Wire terrain — a field of vertical hairlines that bows away from the
 * pointer like a magnetic field and breathes with a slow idle wave when
 * nobody's touching it. Lines brighten near the cursor.
 *
 * Canvas-only, ~30fps, sized to its parent via ResizeObserver, paused when
 * off-screen (IntersectionObserver) and skipped entirely on
 * prefers-reduced-motion or touch devices (idle wave still runs there).
 */

export default function WireTerrain({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0, H = 0;
    let rafId = 0;
    let disposed = false;
    let visible = true;
    let lastDraw = 0;
    let t = 0;
    // Pointer in canvas space; parked far away until it enters
    let mx = -9999, my = -9999;
    let smx = -9999, smy = -9999;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const r = parent!.getBoundingClientRect();
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function onPointer(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect();
      mx = e.clientX - r.left;
      my = e.clientY - r.top;
    }
    function onLeave() { mx = -9999; my = -9999; }

    function tick(now: number) {
      if (disposed) return;
      rafId = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      if (now - lastDraw < 33) return;
      lastDraw = now;
      t += 0.016;

      // Ease the influence point toward the pointer — the field lags,
      // which is what makes it feel physical
      smx += (mx - smx) * 0.12;
      smy += (my - smy) * 0.12;

      ctx!.clearRect(0, 0, W, H);

      const gap = 16;
      const step = 22;
      const count = Math.ceil(W / gap) + 1;

      for (let i = 0; i < count; i++) {
        const baseX = i * gap;
        const dxm = baseX - smx;
        // Proximity of this line to the cursor column, 0..1
        const colNear = Math.exp(-(dxm * dxm) / (2 * 190 * 190));

        // Dualistic field: heat on the left, signal on the right,
        // blending through the middle
        const mix = baseX / W;
        const cr = Math.round(255 + (124 - 255) * mix);
        const cg = Math.round(61 + (92 - 61) * mix);
        const cb = Math.round(92 + (255 - 92) * mix);

        ctx!.beginPath();
        ctx!.strokeStyle = `rgba(${cr},${cg},${cb},${0.06 + colNear * 0.24})`;
        ctx!.lineWidth = 1;

        for (let y = -step; y <= H + step; y += step) {
          const dym = y - smy;
          const near = colNear * Math.exp(-(dym * dym) / (2 * 170 * 170));
          // Push away from the cursor, plus a slow ambient ripple
          const push = Math.sign(dxm || 1) * near * 46;
          const idle = Math.sin(y * 0.012 + t * 0.9 + i * 0.32) * 4.5;
          const x = baseX + push + idle;
          if (y === -step) ctx!.moveTo(x, y);
          else ctx!.lineTo(x, y);
        }
        ctx!.stroke();
      }
    }

    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    const io = new IntersectionObserver(
      entries => { visible = entries[0]?.isIntersecting ?? true; },
      { rootMargin: "100px" },
    );
    io.observe(canvas);

    resize();
    parent.addEventListener("pointermove", onPointer, { passive: true });
    parent.addEventListener("pointerleave", onLeave, { passive: true });
    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      io.disconnect();
      parent.removeEventListener("pointermove", onPointer);
      parent.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none ${className}`} />;
}
