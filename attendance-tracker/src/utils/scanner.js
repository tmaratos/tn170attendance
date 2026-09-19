export const SCANNER_GAP_MS = 120;

export function extractCapid(raw) {
  const value = String(raw || '').trim();
  const exact = value.match(/^\d{6,8}$/);
  if (exact) return exact[0];
  const embedded = value.match(/(?:^|\D)(\d{6,8})(?:\D|$)/);
  return embedded?.[1] || '';
}

export function isFormControl(target) {
  const tag = String(target?.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);
}

// A badge scanner in USB HID keyboard mode is indistinguishable from a keyboard
// to the browser — there is no device API to query. What does give it away is
// cadence: a scanner emits its whole payload in a tight burst and terminates it
// with Enter, far faster than a person types. createScanBuffer accumulates keys
// and reports, on each terminator, whether the burst looked machine-generated.
export const SCANNER_MIN_BURST_KEYS = 4;

export function createScanBuffer({
  gapMs = SCANNER_GAP_MS,
  minBurstKeys = SCANNER_MIN_BURST_KEYS,
} = {}) {
  let buffer = '';
  let lastKeyAt = 0;
  let fastKeys = 0;

  const reset = () => {
    buffer = '';
    lastKeyAt = 0;
    fastKeys = 0;
  };

  return {
    reset,
    get pending() {
      return buffer;
    },
    push(key, now = Date.now()) {
      if (now - lastKeyAt > gapMs) {
        buffer = '';
        fastKeys = 0;
      } else {
        fastKeys += 1;
      }
      lastKeyAt = now;

      if (key === 'Enter' || key === 'Tab') {
        const raw = buffer;
        const fromScanner = fastKeys >= minBurstKeys;
        buffer = '';
        fastKeys = 0;
        if (!raw) return null;
        return { raw, capid: extractCapid(raw), fromScanner };
      }

      if (key.length === 1) buffer += key;
      return null;
    },
  };
}
