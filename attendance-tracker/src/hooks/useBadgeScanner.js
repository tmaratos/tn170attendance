import { useEffect, useRef } from 'react';
import { createScanBuffer, isFormControl } from '../utils/scanner';

// Always-on badge capture. While `enabled`, any scanner burst anywhere on the
// page fires `onScan` — no field needs focus and no button needs pressing.
// Keystrokes aimed at a real form control are left alone so typing still works.
export function useBadgeScanner({ enabled = true, onScan, requireScannerCadence = true }) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return undefined;
    const scanBuffer = createScanBuffer();

    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isFormControl(event.target)) return;

      const result = scanBuffer.push(event.key);
      if (!result) return;
      if (requireScannerCadence && !result.fromScanner) return;

      event.preventDefault();
      onScanRef.current?.(result);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      scanBuffer.reset();
    };
  }, [enabled, requireScannerCadence]);
}

export default useBadgeScanner;
