/**
 * Client wrapper for the TN-170 Attendance Worker API (the trusted backend).
 *
 * The kiosk uses these instead of touching Firestore directly, so the roster,
 * PIN hashes, and guest PII never reach the browser. The Worker base URL is set
 * at build time via VITE_ATTENDANCE_API (e.g. https://tn170-attendance-api.<sub>.workers.dev).
 *
 * This module is additive — nothing calls it until the hook is rewired. When
 * VITE_ATTENDANCE_API is unset, isApiConfigured() is false and callers fall back
 * to the existing direct-Firestore path (so current behavior is unchanged).
 */
const BASE = (import.meta.env.VITE_ATTENDANCE_API || '').replace(/\/+$/, '');

export function isApiConfigured() {
  return Boolean(BASE);
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Returns { members: [{ memberId, displayName, grade, role, hasPin, needsPinSetup }] } — never CAPID/PII beyond the typed match. */
export function apiSearchMembers(query) {
  return post('/member/search', { query });
}

export function apiCheckIn(capid, pin) {
  return post('/member/check-in', { capid, pin });
}

export function apiCheckOut(capid) {
  return post('/member/check-out', { capid });
}

/**
 * Badge / licence scan. The Worker resolves the name, decides check-in vs
 * check-out from current state, and — critically — refreshes publicPresence,
 * which the rest of the app reads. Returns { action, memberName }.
 */
export function apiBadgeScan(capid) {
  return post('/member/badge-scan', { capid });
}

export function apiCreatePin(capid, pin, confirmPin) {
  return post('/member/create-pin', { capid, pin, confirmPin });
}

export function apiGuestSignIn(data) {
  return post('/guest/sign-in', {
    name: data.name,
    hostCapid: data.hostCapid || data.hostId || null,
    hostPin: data.hostPin || null,
    email: data.email || null,
    phone: data.phone || null,
    visitReason: data.visitReason || null,
    openHouse: !!(data.openHouse || data.isOpenHouse || data.signInMode === 'open_house'),
  });
}

export function apiGuestSignOut({ guestRecordId, name } = {}) {
  return post('/guest/sign-out', { guestRecordId: guestRecordId || null, name: name || null });
}

/** Verify a senior's CAPID+PIN and return { token, profile }. token → signInWithCustomToken. */
export function apiAdminLogin(capid, pin) {
  return post('/admin/login', { capid, pin });
}

export function apiAdminCreateMember(actorCapid, actorPin, member) {
  return post('/admin/member/create', { actorCapid, actorPin, ...member });
}

export function apiAdminUpdateMember(actorCapid, actorPin, member) {
  return post('/admin/member/update', { actorCapid, actorPin, ...member });
}

export function apiAdminSetMemberActive(actorCapid, actorPin, targetMemberId, active, reason = null) {
  return post('/admin/member/set-active', {
    actorCapid, actorPin, targetMemberId, active, reason,
  });
}

export function apiAdminResetPin(actorCapid, actorPin, targetCapid) {
  return post('/admin/member/reset-pin', { actorCapid, actorPin, targetCapid });
}

export function apiAdminForceAttendance(actorCapid, actorPin, targetMemberId, action, note = null) {
  return post('/admin/attendance/force', {
    actorCapid, actorPin, targetMemberId, action, note,
  });
}

export async function apiHealth() {
  const res = await fetch(`${BASE}/health`);
  return res.json();
}
