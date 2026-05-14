import { useEffect, useRef, useCallback } from 'react';

const SCAN_CHAR_INTERVAL_MS = 50;
const SCAN_MIN_LENGTH = 4;

export function useScanDetector(onScan: (value: string) => void) {
  const buffer = useRef('');
  const lastKeyTime = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      if (isInput) return;

      const now = Date.now();

      if (now - lastKeyTime.current > SCAN_CHAR_INTERVAL_MS) {
        buffer.current = '';
      }

      lastKeyTime.current = now;

      if (e.key === 'Enter') {
        if (buffer.current.length >= SCAN_MIN_LENGTH) {
          e.preventDefault();
          onScanRef.current(buffer.current.trim());
        }
        buffer.current = '';
        return;
      }

      if (e.key.length === 1) {
        buffer.current += e.key;
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);
}
