import { useEffect, useState } from "react";

/**
 * True below Tailwind's `md` breakpoint (768px). Used where mobile needs a
 * structurally different layout (stacked columns, full-screen detail
 * overlay) that CSS classes alone can't express. Desktop rendering is
 * untouched when this is false.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
