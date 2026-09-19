import { useCallback, useEffect, useState } from 'react';

// Detects whether a badge scanner is physically connected.
//
// A scanner in HID keyboard mode is invisible to ordinary page APIs, but WebHID
// can see it: getDevices() returns already-permitted devices with no prompt, and
// connect/disconnect events fire as it is plugged and unplugged. We never call
// device.open(), so the scanner keeps emulating a keyboard and scans still
// arrive as normal keystrokes.
//
// Caveat: Chrome hides plain keyboard collections from WebHID to prevent
// keylogging. Scanners that also expose a vendor-defined interface show up;
// pure-keyboard ones may not. When detection is unavailable the caller falls
// back to treating the first scan burst as proof of a scanner.
const LIKELY_SCANNER = /scan|barcode|symbol|zebra|honeywell|datalogic|netum|eyoyo|tera|inateck/i;

function looksLikeScanner(device) {
  return LIKELY_SCANNER.test(String(device?.productName || ''));
}

export function useScannerPresence() {
  const supported = typeof navigator !== 'undefined' && 'hid' in navigator;
  const [devices, setDevices] = useState([]);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    if (!supported) {
      setChecked(true);
      return;
    }
    try {
      setDevices(await navigator.hid.getDevices());
    } catch {
      setDevices([]);
    } finally {
      setChecked(true);
    }
  }, [supported]);

  useEffect(() => {
    if (!supported) {
      setChecked(true);
      return undefined;
    }
    refresh();
    const onChange = () => refresh();
    navigator.hid.addEventListener('connect', onChange);
    navigator.hid.addEventListener('disconnect', onChange);
    return () => {
      navigator.hid.removeEventListener('connect', onChange);
      navigator.hid.removeEventListener('disconnect', onChange);
    };
  }, [supported, refresh]);

  // Must be called from a user gesture. Shows the browser's device chooser once;
  // afterwards getDevices() returns the scanner silently on every page load.
  const grantAccess = useCallback(async () => {
    if (!supported) return false;
    try {
      const picked = await navigator.hid.requestDevice({ filters: [] });
      await refresh();
      return picked.length > 0;
    } catch {
      return false;
    }
  }, [supported, refresh]);

  const named = devices.filter(looksLikeScanner);
  return {
    supported,
    checked,
    connected: devices.length > 0,
    scannerName: (named[0] || devices[0])?.productName || '',
    deviceCount: devices.length,
    grantAccess,
    refresh,
  };
}

export default useScannerPresence;
