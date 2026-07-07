import { useState } from "react";

/** Persist a numeric layout preference (panel width, chart height) across sessions. */
export function usePersistedNumber(key: string, initial: number): [number, (v: number) => void] {
  const [val, setVal] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw != null ? parseFloat(raw) : NaN;
      return Number.isFinite(parsed) ? parsed : initial;
    } catch { return initial; }
  });
  const set = (v: number) => {
    setVal(v);
    try { localStorage.setItem(key, String(v)); } catch {}
  };
  return [val, set];
}

/** Shared drag-to-resize helper for layout dividers. */
export function makeDragger(
  setVal: (v: number) => void,
  getStart: () => number,
  axis: "x" | "y",
  transform: (delta: number, start: number) => number
) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    const startPos = axis === "x" ? e.clientX : e.clientY;
    const startVal = getStart();
    const target = e.currentTarget as HTMLElement;
    target.classList.add("dragging");
    document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
    function onMove(ev: MouseEvent) {
      setVal(transform((axis === "x" ? ev.clientX : ev.clientY) - startPos, startVal));
    }
    function onUp() {
      target.classList.remove("dragging");
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
}
