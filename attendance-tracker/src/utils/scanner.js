import { isAamvaPayload } from './aamva.js';

export const SCANNER_GAP_MS = 120;

// A licence payload is long and contains embedded newlines, so it cannot be
// terminated by the first Enter. It is closed by a pause instead.
export const SCANNER_IDLE_FLUSH_MS = 350;

// Shortest plausible licence payload; below this a scan is treated as a badge.
export const MIN_LICENCE_LENGTH = 40;

export function extractCapid(raw) {
  const value = String(raw || '').trim();
  const exact = value.match(/^\d{6,8}$/);
  if (exact) return exact[0];
  const embedded = value.match(/(?:^|\D)(\d{6,8})(?:\D|$)/);
  return embedded?.[1] || '';
}

/**
 * Classifies a completed scan before anything is done with its contents.
 * A numeric barcode is not assumed to be a licence, and a licence is never
 * run through CAPID extraction.
 */
export function detectScanType(raw) {
  const value = String(raw || '');
  if (isAamvaPayload(value)) return 'drivers-license';
  if (value.length < MIN_LICENCE_LENGTH && extractCapid(value)) return 'cap-id';
  return 'unknown';
}

function looksLikeLicenceInProgress(buffer) {
  return buffer.startsWith('@') || /\bANSI\b/.test(buffer) || /\bDL[A-Z]{3}/.test(buffer);
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
  idleMs = SCANNER_IDLE_FLUSH_MS,
} = {}) {
  let buffer = '';
  let lastKeyAt = 0;
  let fastKeys = 0;

  const reset = () => {
    buffer = '';
    lastKeyAt = 0;
    fastKeys = 0;
  };

  const complete = () => {
    const raw = buffer;
    const fromScanner = fastKeys >= minBurstKeys;
    buffer = '';
    fastKeys = 0;
    if (!raw) return null;
    return { raw, capid: extractCapid(raw), type: detectScanType(raw), fromScanner };
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
        if (!buffer) return null;
        // Mid-licence: the terminator is part of the payload, not the end of it.
        if (looksLikeLicenceInProgress(buffer)) {
          buffer += '\n';
          return null;
        }
        return complete();
      }

      if (key.length === 1) buffer += key;
      return null;
    },
    /** Closes a payload that stopped arriving — how licence scans end. */
    flushIfIdle(now = Date.now()) {
      if (!buffer || now - lastKeyAt < idleMs) return null;
      return complete();
    },
  };
}
