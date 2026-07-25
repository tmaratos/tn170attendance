/**
 * TN-170 Attendance API (Cloudflare Worker, free plan).
 *
 * The ONLY path the public kiosk uses to touch data. Firestore is locked so
 * browsers cannot read the roster, PIN hashes, or guest PII directly. This Worker:
 *   - verifies PINs server-side (rate-limited) and performs check-in/out,
 *   - handles guest sign-in/out (email/phone stored but never returned publicly),
 *   - returns only minimal member-search matches (name + grade, never CAPID/PII),
 *   - maintains a sanitized `publicPresence/current` doc the kiosk may read live,
 *   - mints Firebase custom tokens so seniors log into the admin app with their PIN.
 */
import {
  fsGet, fsSet, fsUpdate, fsCreate, fsQuery,
  mintCustomToken, verifyPinHash, hashPin, rateLimit, rateLimitReset,
} from './lib.js';

const TZ = 'America/New_York';

function easternDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
}
function memberIsSenior(m) {
  if (!m || m.isProspective) return false;
  if (m.isSeniorMember) return true;
  if (m.role === 'Senior Member') return true;
  if (m.isCadet || m.role === 'Cadet') return false;
  const g = String(m.grade || '').toUpperCase();
  return !g.startsWith('C/') && g !== 'CADET';
}
function seniorClaims(m, capid) {
  const senior = memberIsSenior(m) || !!m.isAdmin;
  return {
    senior,
    capid: String(capid),
    canManageMembers: senior || !!m.canManageMembers,
    canResetPins: senior || !!m.canResetPins,
    canExportReports: senior || !!m.canExportReports,
    canForceAttendance: senior || !!m.canForceAttendance,
  };
}

// ---------- CORS ----------
function corsHeaders(env, request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const allow = allowed.includes(origin) ? origin : allowed[0] || '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
function json(env, request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env, request) },
  });
}

// ---------- meeting ----------
async function ensureMeeting(env) {
  const date = easternDate();
  const existing = await fsGet(env, `meetings/${date}`);
  if (existing) {
    if (existing.status !== 'in_progress') {
      await fsUpdate(env, `meetings/${date}`, { status: 'in_progress', updatedAt: new Date() });
    }
    return { id: date, ...existing, status: 'in_progress' };
  }
  const meeting = {
    meetingDate: date,
    meetingTitle: `Squadron Meeting — ${date}`,
    status: 'in_progress',
    createdBy: 'kiosk-api',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await fsSet(env, `meetings/${date}`, meeting);
  return { id: date, ...meeting };
}

// ---------- sanitized public presence ----------
function lastInitial(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] || '';
}
async function refreshPresence(env, meetingId, meetingDate) {
  const [att, guests] = await Promise.all([
    fsQuery(env, 'attendanceRecords', { meetingId }),
    fsQuery(env, 'guestAttendanceRecords', { meetingId }),
  ]);
  const members = att.map((r) => ({
    key: r.id,
    name: lastInitial(r.memberName),
    role: r.role || (r.isCadet ? 'Cadet' : 'Senior Member'),
    status: r.status,
    checkInTime: r.checkInTime || null,
    checkOutTime: r.checkOutTime || null,
  }));
  const guestList = guests.map((g) => ({
    key: g.id,
    name: lastInitial(g.guestName || g.name),
    status: g.status,
    checkInTime: g.checkInTime || null,
    checkOutTime: g.checkOutTime || null,
    isOpenHouse: !!g.isOpenHouse,
  }));
  const present = members.filter((m) => m.status === 'checked_in').length;
  const guestsPresent = guestList.filter((g) => g.status === 'checked_in').length;
  // NOTE: no CAPID, no email, no phone, no PIN — safe for public read.
  await fsSet(env, 'publicPresence/current', {
    meetingId,
    meetingDate,
    updatedAt: new Date(),
    members,
    guests: guestList,
    counts: { present, guestsPresent, totalMembers: members.length },
  });
}

async function logActivity(env, meetingId, payload) {
  try {
    await fsCreate(env, 'activityLog', {
      meetingId: meetingId || null,
      activityType: payload.type,
      type: payload.type,
      actorCapid: payload.actorCapid || null,
      actorName: payload.actorName || null,
      targetCapid: payload.targetCapid || null,
      targetName: payload.targetName || null,
      guestName: payload.guestName || null,
      details: payload.details || null,
      timestamp: new Date(),
    });
  } catch { /* best effort */ }
}

// ---------- endpoints ----------
async function handleAdminLogin(env, request, body) {
  const capid = String(body.capid || '').trim();
  const pin = String(body.pin || '');
  if (!/^\d{6,8}$/.test(capid) || !/^\d{4}$/.test(pin)) return json(env, request, { error: 'Invalid credentials.' }, 400);
  const rl = await rateLimit(env, `login:${capid}`, Number(env.PIN_MAX_ATTEMPTS || 5), Number(env.PIN_WINDOW_SECONDS || 900));
  if (!rl.ok) return json(env, request, { error: 'Too many attempts. Try again later.' }, 429);

  const member = await fsGet(env, `members/${capid}`);
  if (!member || member.active === false) return json(env, request, { error: 'Invalid admin credentials.' }, 401);
  const claims = seniorClaims(member, capid);
  if (!claims.senior) return json(env, request, { error: 'You do not have admin access.' }, 403);

  const pinDoc = await fsGet(env, `memberPins/${capid}`);
  const ok = await verifyPinHash(pin, capid, pinDoc?.pinHash, env.PIN_SALT);
  if (!ok) return json(env, request, { error: 'Invalid admin credentials.' }, 401);

  await rateLimitReset(env, `login:${capid}`);
  const token = await mintCustomToken(env, capid, claims);
  return json(env, request, {
    token,
    profile: { capid, memberId: capid, displayName: member.displayName || member.fullName, ...claims },
  });
}

async function handleSearch(env, request, body) {
  const q = String(body.query || '').trim().toLowerCase();
  if (q.length < 2) return json(env, request, { members: [] });
  const all = await fsQuery(env, 'members', { active: true }, 500);
  const matches = all
    .filter((m) => {
      const name = (m.displayName || m.fullName || '').toLowerCase();
      return name.includes(q) || String(m.capid || '').includes(q) || String(m.grade || '').toLowerCase().includes(q);
    })
    .slice(0, 12)
    .map((m) => ({
      memberId: String(m.capid || m.memberId),
      displayName: m.displayName || m.fullName, // name only — no CAPID returned
      grade: m.grade,
      role: m.role,
      hasPin: !!m.hasPin && !m.pinResetRequired,
      needsPinSetup: !m.hasPin || !!m.pinResetRequired,
    }));
  return json(env, request, { members: matches });
}

async function handleCreatePin(env, request, body) {
  const capid = String(body.capid || '').trim();
  const pin = String(body.pin || '');
  if (pin !== String(body.confirmPin || '')) return json(env, request, { error: 'PINs do not match.' }, 400);
  if (!/^\d{4}$/.test(pin)) return json(env, request, { error: 'PIN must be 4 digits.' }, 400);
  const member = await fsGet(env, `members/${capid}`);
  if (!member || member.active === false) return json(env, request, { error: 'Member not found.' }, 404);
  const existing = await fsGet(env, `memberPins/${capid}`);
  const hasValid = existing?.pinHash?.startsWith('sha256:');
  if (hasValid && !member.pinResetRequired) return json(env, request, { error: 'PIN already exists. Enter your PIN.' }, 409);
  const pinHash = await hashPin(pin, capid, env.PIN_SALT);
  await fsSet(env, `memberPins/${capid}`, { pinHash, pinCreatedAt: existing?.pinCreatedAt || new Date(), pinUpdatedAt: new Date() });
  await fsUpdate(env, `members/${capid}`, { hasPin: true, pinResetRequired: false, updatedAt: new Date() });
  return json(env, request, { success: true });
}

async function verifyMemberPin(env, capid, pin) {
  const rl = await rateLimit(env, `pin:${capid}`, Number(env.PIN_MAX_ATTEMPTS || 5), Number(env.PIN_WINDOW_SECONDS || 900));
  if (!rl.ok) return { ok: false, status: 429, error: 'Too many attempts. Try again later.' };
  const pinDoc = await fsGet(env, `memberPins/${capid}`);
  const ok = await verifyPinHash(pin, capid, pinDoc?.pinHash, env.PIN_SALT);
  if (!ok) return { ok: false, status: 401, error: 'Incorrect PIN.' };
  await rateLimitReset(env, `pin:${capid}`);
  return { ok: true };
}

async function handleCheckIn(env, request, body) {
  const capid = String(body.capid || '').trim();
  const pin = String(body.pin || '');
  const member = await fsGet(env, `members/${capid}`);
  if (!member || member.active === false) return json(env, request, { error: 'Member not found.' }, 404);
  const v = await verifyMemberPin(env, capid, pin);
  if (!v.ok) return json(env, request, { error: v.error }, v.status);

  const meeting = await ensureMeeting(env);
  const open = (await fsQuery(env, 'attendanceRecords', { meetingId: meeting.id }))
    .filter((r) => String(r.memberId) === capid && r.status === 'checked_in');
  if (open.length) return json(env, request, { error: "Already checked in for tonight's meeting." }, 409);

  await fsCreate(env, 'attendanceRecords', {
    meetingId: meeting.id,
    memberId: capid,
    capid,
    memberName: member.displayName || member.fullName,
    grade: member.grade,
    role: member.role,
    isProspective: !!member.isProspective,
    status: 'checked_in',
    checkInTime: new Date(),
    checkOutTime: null,
    durationMinutes: null,
    checkedInBy: capid,
    forceAction: false,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await logActivity(env, meeting.id, { type: 'member_checked_in', targetCapid: capid, targetName: member.displayName || member.fullName });
  await refreshPresence(env, meeting.id, meeting.meetingDate);
  return json(env, request, { success: true });
}

async function handleCheckOut(env, request, body) {
  const capid = String(body.capid || '').trim();
  const meeting = await ensureMeeting(env);
  const open = (await fsQuery(env, 'attendanceRecords', { meetingId: meeting.id }))
    .filter((r) => String(r.memberId) === capid && r.status === 'checked_in');
  if (!open.length) return json(env, request, { error: 'No active check-in found.' }, 404);
  const rec = open[0];
  const now = new Date();
  const durationMinutes = rec.checkInTime ? Math.max(0, Math.round((now - new Date(rec.checkInTime)) / 60000)) : null;
  await fsUpdate(env, `attendanceRecords/${rec.id}`, {
    status: 'checked_out', checkOutTime: now, durationMinutes, checkedOutBy: capid, updatedAt: now,
  });
  await logActivity(env, meeting.id, { type: 'member_checked_out', targetCapid: capid, targetName: rec.memberName });
  await refreshPresence(env, meeting.id, meeting.meetingDate);
  return json(env, request, { success: true });
}

async function handleGuestSignIn(env, request, body) {
  const name = String(body.name || '').trim();
  if (!name) return json(env, request, { error: 'Guest name is required.' }, 400);
  const openHouse = !!body.openHouse;
  const meeting = await ensureMeeting(env);

  let hostName = null;
  if (!openHouse) {
    const hostCapid = String(body.hostCapid || '').trim();
    const v = await verifyMemberPin(env, hostCapid, String(body.hostPin || ''));
    if (!v.ok) return json(env, request, { error: `Host PIN: ${v.error}` }, v.status);
    const host = await fsGet(env, `members/${hostCapid}`);
    hostName = host?.displayName || host?.fullName || null;
  }
  await fsCreate(env, 'guestAttendanceRecords', {
    meetingId: meeting.id,
    guestId: `g${Date.now()}`,
    guestName: name,
    status: 'checked_in',
    checkInTime: new Date(),
    checkOutTime: null,
    signInMode: openHouse ? 'open_house' : 'hosted',
    isOpenHouse: openHouse,
    hostName,
    email: body.email ? String(body.email) : null,   // stored, never returned publicly
    phone: body.phone ? String(body.phone) : null,
    visitReason: body.visitReason ? String(body.visitReason) : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await logActivity(env, meeting.id, { type: 'guest_checked_in', guestName: name });
  await refreshPresence(env, meeting.id, meeting.meetingDate);
  return json(env, request, { success: true });
}

async function handleGuestSignOut(env, request, body) {
  const meeting = await ensureMeeting(env);
  const guests = await fsQuery(env, 'guestAttendanceRecords', { meetingId: meeting.id });
  const rec = guests.find((g) => g.id === String(body.guestRecordId) && g.status === 'checked_in')
    || guests.find((g) => (g.guestName || '').toLowerCase() === String(body.name || '').toLowerCase() && g.status === 'checked_in');
  if (!rec) return json(env, request, { error: 'Guest not currently signed in.' }, 404);
  const now = new Date();
  await fsUpdate(env, `guestAttendanceRecords/${rec.id}`, { status: 'checked_out', checkOutTime: now, updatedAt: now });
  await logActivity(env, meeting.id, { type: 'guest_checked_out', guestName: rec.guestName });
  await refreshPresence(env, meeting.id, meeting.meetingDate);
  return json(env, request, { success: true });
}

const ROUTES = {
  'POST /admin/login': handleAdminLogin,
  'POST /member/search': handleSearch,
  'POST /member/create-pin': handleCreatePin,
  'POST /member/check-in': handleCheckIn,
  'POST /member/check-out': handleCheckOut,
  'POST /guest/sign-in': handleGuestSignIn,
  'POST /guest/sign-out': handleGuestSignOut,
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    const url = new URL(request.url);
    const key = `${request.method} ${url.pathname}`;

    if (key === 'GET /health') return json(env, request, { ok: true, service: 'tn170-attendance-api' });
    if (key === 'GET /selftest') {
      try { await ensureMeeting(env); return json(env, request, { ok: true, firestore: 'reachable' }); }
      catch (e) { return json(env, request, { ok: false, error: e.message }, 500); }
    }

    const handler = ROUTES[key];
    if (!handler) return json(env, request, { error: 'Not found' }, 404);
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    try {
      return await handler(env, request, body);
    } catch (e) {
      return json(env, request, { error: 'Server error', detail: String(e.message || e).slice(0, 200) }, 500);
    }
  },
};
