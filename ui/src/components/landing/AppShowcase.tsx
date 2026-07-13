import { useEffect, useRef, useState } from "react";
import { GlitchText } from "./Effects";

/**
 * "Every tab, one scroll" — a single 43s screen recording of the real app
 * (Dashboard -> Portfolio -> Market Chat), pinned and scroll-scrubbed like
 * the pipeline/instruments sections: vertical scroll position IS playback
 * position, so scrubbing back rewinds. Chapter labels and a segmented
 * progress bar track which tab is currently on screen.
 *
 * The <video> itself is never told to play/pause — currentTime is written
 * directly every frame while paused, which is the standard scroll-scrub
 * technique and means no audio ever engages.
 *
 * Lazy-mounted: the 26MB file isn't fetched until the section is within
 * 400px of the viewport. prefers-reduced-motion shows a single static
 * frame (first chapter) with no scrub.
 */

const CHAPTERS = [
  { label: "Dashboard",    start: 0,     end: 18.04,     color: "#FF5C7A" }, // heat red
  { label: "Portfolio",    start: 18.05, end: 32.67,     color: "#8055F5" }, // signal violet
  { label: "Market Chat",  start: 32.68, end: Infinity,  color: "#3FA7FC" }, // sky
];

const FALLBACK_DURATION = 43;

export default function AppShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  // Lazy-mount the <video> only once the section nears the viewport
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const io = new IntersectionObserver(
      entries => { if (entries[0]?.isIntersecting) { setMounted(true); io.disconnect(); } },
      { rootMargin: "400px" },
    );
    io.observe(section);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const section = sectionRef.current;
    const video = videoRef.current;
    if (!section || !video) return;

    let duration = FALLBACK_DURATION;
    let rafId = 0;
    let ticking = false;
    let disposed = false;

    function onMeta() {
      if (video && isFinite(video.duration) && video.duration > 0) duration = video.duration;
      setReady(true);
    }
    function onCanPlay() { setReady(true); }
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("canplay", onCanPlay);

    function apply() {
      ticking = false;
      if (disposed) return;
      const r = section!.getBoundingClientRect();
      const vh = window.innerHeight;
      const span = r.height - vh;
      const p = span > 0 ? Math.max(0, Math.min(1, -r.top / span)) : 0;

      if (video!.readyState >= 1) {
        const t = p * duration;
        if (Math.abs(video!.currentTime - t) > 0.05) video!.currentTime = t;
        const idx = CHAPTERS.findIndex(c => t >= c.start && t < c.end);
        if (idx !== -1) setActiveIdx(idx);
      }

      barRefs.current.forEach((el, i) => {
        if (!el) return;
        const c = CHAPTERS[i];
        const segStart = c.start / duration;
        const segEnd = Math.min(1, c.end / duration);
        const local = segEnd > segStart
          ? Math.max(0, Math.min(1, (p - segStart) / (segEnd - segStart)))
          : 0;
        el.style.transform = `scaleX(${local})`;
      });
    }

    function onScroll() {
      if (!ticking) { ticking = true; rafId = requestAnimationFrame(apply); }
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return () => {
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("canplay", onCanPlay);
      };
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    apply();
    return () => {
      disposed = true;
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("canplay", onCanPlay);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [mounted]);

  return (
    <section ref={sectionRef} className="relative z-10" style={{ height: "340vh" }}>
      <div className="sticky top-0 h-screen flex flex-col items-center justify-center px-6">
        <div className="text-center mb-7 max-w-2xl">
          <p className="font-mono text-[11px] tracking-[0.28em] text-sky uppercase mb-3">
            <GlitchText text="See it live" />
          </p>
          <h2 className="font-display font-bold tracking-tight text-4xl md:text-5xl text-white">
            Every tab, <span className="text-gradient-signal">one scroll.</span>
          </h2>
        </div>

        {/* Chapter labels — the active one lights up in its own voice */}
        <div className="flex items-center gap-6 mb-5 font-mono text-xs tracking-[0.14em] uppercase">
          {CHAPTERS.map((c, i) => (
            <span key={c.label} className="transition-colors duration-300"
              style={{ color: activeIdx === i ? c.color : "rgba(255,255,255,0.32)" }}>
              {c.label}
            </span>
          ))}
        </div>

        {/* The video, framed like the app's own browser chrome */}
        <div className="relative w-full max-w-5xl rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
          style={{ aspectRatio: "16/9", background: "#10131A" }}>
          <div className="absolute inset-x-0 top-0 z-10 h-9 bg-[#171C29]/95 border-b border-white/10 flex items-center gap-1.5 px-4">
            <div className="w-2.5 h-2.5 rounded-full bg-red/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-orange/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-green/60" />
          </div>
          {mounted && (
            <video
              ref={videoRef}
              src="/videos/app-demo.mp4"
              muted
              playsInline
              preload="auto"
              className="absolute inset-0 w-full h-full object-cover pt-9 transition-opacity duration-500"
              style={{ opacity: ready ? 1 : 0 }}
            />
          )}
          {!ready && <div className="absolute inset-0 top-9 chart-skeleton" />}
        </div>

        {/* Segmented scrub bar — one colored fill per chapter */}
        <div className="flex gap-1 w-full max-w-5xl mt-4" aria-hidden>
          {CHAPTERS.map((c, i) => (
            <div key={c.label} className="h-[3px] flex-1 rounded-full overflow-hidden bg-white/10">
              <div ref={el => { barRefs.current[i] = el; }} className="h-full origin-left"
                style={{ transform: "scaleX(0)", background: c.color }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
