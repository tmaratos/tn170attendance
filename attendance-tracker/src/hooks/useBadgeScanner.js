import { useEffect, useRef } from 'react';
import { createScanBuffer, isFormControl, SCANNER_IDLE_FLUSH_MS } from '../utils/scanner';

// Always-on scan capture. While `enabled`, any scanner burst anywhere on the
// page fires `onScan` — no field needs focus and no button needs pressing.
//
// Two kinds of payload arrive on the same wire. A CAP badge is short and ends
// at its Enter. A driver's licence is long and contains embedded newlines, so
// it is closed by a pause instead; that is what the idle poll is for.
//
// Keystrokes aimed at a real form control are left alone so staff can type.
export function useBadgeScanner({ enabled = true, onScan, requireScannerCadence = true }) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return undefined;
    const scanBuffer = createScanBuffer();

    const deliver = (result) => {
      if (!result) return;
      if (requireScannerCadence && !result.fromScanner) return;
      onScanRef.current?.(result);
    };

    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isFormControl(event.target)) return;

      const midScan = Boolean(scanBuffer.pending);
      const result = scanBuffer.push(event.key);

      // Swallow the keystroke whenever it belongs to a scan — including the
      // newlines inside a licence payload, which would otherwise act on the page.
      if (result || midScan || scanBuffer.pending) event.preventDefault();
      deliver(result);
    };

    const idle = setInterval(() => deliver(scanBuffer.flushIfIdle()), SCANNER_IDLE_FLUSH_MS);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      clearInterval(idle);
      window.removeEventListener('keydown', onKeyDown, true);
      scanBuffer.reset();
    };
  }, [enabled, requireScannerCadence]);
}

export default useBadgeScanner;
