import { useState, useRef, useEffect } from "react";

export function useTypewriter(target: string) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);
  const targetRef = useRef(target);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    function tick() {
      const t = targetRef.current;
      const remaining = t.length - indexRef.current;
      if (remaining <= 0) {
        // Nothing to do — reschedule slowly to catch future tokens
        timerRef.current = setTimeout(tick, 20);
        return;
      }

      // Speed up when backlog is large: output more chars per tick
      const charsPerTick = remaining > 80 ? 4 : remaining > 30 ? 2 : 1;
      const delay = remaining > 80 ? 8 : remaining > 30 ? 10 : 14;

      indexRef.current = Math.min(indexRef.current + charsPerTick, t.length);
      setDisplayed(t.slice(0, indexRef.current));

      timerRef.current = setTimeout(tick, delay);
    }

    timerRef.current = setTimeout(tick, 14);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (target === "") {
      indexRef.current = 0;
      setDisplayed("");
    }
  }, [target]);

  const done = indexRef.current >= targetRef.current.length;
  return { displayed, done };
}
