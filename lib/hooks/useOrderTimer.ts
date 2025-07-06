import { useState, useEffect } from 'react';

/**
 * Timer hook for countdown between start and end.
 */
export function useOrderTimer(start?: number, end?: number) {
  const [progress, setProgress] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (start != null && end != null) setStarted(true);
  }, [start, end]);

  useEffect(() => {
    if (!started || start == null || end == null) return;
    const tick = () => {
      const now = Date.now();
      const pct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
      setProgress(pct);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [started, start, end]);

  return { progress, started, setStarted };
}
