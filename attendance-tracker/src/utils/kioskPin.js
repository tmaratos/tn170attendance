const KIOSK_PIN_SALT = 'tn170-kiosk-v1';

export function hashKioskPinSync(pin, memberId) {
  const input = `${memberId}:${pin}:${KIOSK_PIN_SALT}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function verifyKioskPin(pin, memberId, storedHash) {
  if (!storedHash) return false;
  return hashKioskPinSync(pin, memberId) === storedHash;
}

/** Async SHA-256 when Web Crypto is available; falls back to sync FNV-1a. */
export async function hashKioskPin(pin, memberId) {
  if (!crypto?.subtle?.digest) {
    return hashKioskPinSync(pin, memberId);
  }
  const data = new TextEncoder().encode(`${memberId}:${pin}:${KIOSK_PIN_SALT}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}
