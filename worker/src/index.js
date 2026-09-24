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
function normalizedName(...parts) {
  return parts.filter(Boolean).join(' ').trim().replace(/\s+/g, ' ');
}
function memberRoleForGrade(grade) {
  const value = String(grade || '').toUpperCase();
  return value.startsWith('C/') || value === 'CADET' ? 'Cadet' : 'Senior Member';
}
function memberPermissionsForGrade(grade) {
  const senior = memberRoleForGrade(grade) === 'Senior Member';
  return {
    role: senior ? 'Senior Member' : 'Cadet',
    isCadet: !senior,
    isSeniorMember: senior,
    isAdmin: senior,
    canForceAttendance: senior,
    canResetPins: senior,
    canExportReports: senior,
    canManageMembers: senior,
    canManageGuests: senior,
  };
}
async function requireAdminActor(env, body, permission) {
  const actorCapid = String(body.actorCapid || '').trim();
  const actorPin = String(body.actorPin || '');
  if (!/^\d{6,8}$/.test(actorCapid) || !/^\d{4}$/.test(actorPin)) {
    return { error: 'Invalid admin credentials.', status: 401 };
  }
  const actor = await fsGet(env, `members/${actorCapid}`);
  if (!actor || actor.active === false) return { error: 'Invalid admin credentials.', status: 401 };
  const claims = seniorClaims(actor, actorCapid);
  if (!claims.senior || (permission && !claims[permission])) {
    return { error: 'You do not have permission for this action.', status: 403 };
  }
  const pinDoc = await fsGet(env, `memberPins/${actorCapid}`);
  if (!(await verifyPinHash(actorPin, actorCapid, pinDoc?.pinHash, env.PIN_SALT))) {
    return { error: 'Invalid admin credentials.', status: 401 };
  }
  return {
    actor: {
      ...actor,
      capid: actorCapid,
      displayName: actor.displayName || actor.fullName || actorCapid,
    },
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
    signInMode: g.signInMode || null,
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

async function handleAdminCreateMember(env, request, body) {
  const auth = await requireAdminActor(env, body, 'canManageMembers');
  if (auth.error) return json(env, request, { error: auth.error }, auth.status);
  const capid = String(body.capid || '').trim();
  const firstName = String(body.firstName || '').trim();
  const middleName = String(body.middleName || '').trim();
  const lastName = String(body.lastName || '').trim();
  const grade = String(body.grade || '').trim();
  if (!/^\d{6,8}$/.test(capid)) return json(env, request, { error: 'CAPID must be 6–8 digits.' }, 400);
  if (!firstName || !lastName || !grade) return json(env, request, { error: 'First name, last name, and grade are required.' }, 400);
  if (await fsGet(env, `members/${capid}`)) return json(env, request, { error: 'CAPID already exists on the roster.' }, 409);
  const fullName = normalizedName(firstName, middleName, lastName);
  const perms = memberPermissionsForGrade(grade);
  await fsSet(env, `members/${capid}`, {
    memberId: capid,
    capid,
    temporaryId: null,
    firstName,
    middleName,
    lastName,
    fullName,
    displayName: fullName,
    normalizedName: fullName.toLowerCase(),
    grade,
    ...perms,
    isProspective: false,
    hasPin: false,
    pinResetRequired: false,
    active: true,
    createdByCapid: auth.actor.capid,
    createdByName: auth.actor.displayName,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await logActivity(env, null, {
    type: 'member_created',
    actorCapid: auth.actor.capid,
    actorName: auth.actor.displayName,
    targetCapid: capid,
    targetName: fullName,
  });
  return json(env, request, { success: true, capid, displayName: fullName });
}

async function handleAdminUpdateMember(env, request, body) {
  const auth = await requireAdminActor(env, body, 'canManageMembers');
  if (auth.error) return json(env, request, { error: auth.error }, auth.status);
  const capid = String(body.capid || '').trim();
  const current = await fsGet(env, `members/${capid}`);
  if (!current) return json(env, request, { error: 'Member not found.' }, 404);
  const firstName = String(body.firstName || '').trim();
  const middleName = String(body.middleName || '').trim();
  const lastName = String(body.lastName || '').trim();
  const grade = String(body.grade || '').trim();
  if (!firstName || !lastName || !grade) return json(env, request, { error: 'First name, last name, and grade are required.' }, 400);
  const fullName = normalizedName(firstName, middleName, lastName);
  await fsUpdate(env, `members/${capid}`, {
    firstName, middleName, lastName, fullName, displayName: fullName,
    normalizedName: fullName.toLowerCase(), grade, ...memberPermissionsForGrade(grade),
    updatedByCapid: auth.actor.capid, updatedByName: auth.actor.displayName, updatedAt: new Date(),
  });
  await logActivity(env, null, {
    type: 'member_updated', actorCapid: auth.actor.capid, actorName: auth.actor.displayName,
    targetCapid: capid, targetName: fullName, details: { previous: current },
  });
  return json(env, request, { success: true, capid, displayName: fullName });
}

async function handleAdminSetMemberActive(env, request, body) {
  const auth = await requireAdminActor(env, body, 'canManageMembers');
  if (auth.error) return json(env, request, { error: auth.error }, auth.status);
  const target = String(body.targetMemberId || '').trim();
  const member = await fsGet(env, `members/${target}`);
  if (!member) return json(env, request, { error: 'Member not found.' }, 404);
  const active = !!body.active;
  const now = new Date();
  await fsUpdate(env, `members/${target}`, active ? {
    active: true, reactivatedAt: now, reactivatedByCapid: auth.actor.capid, updatedAt: now,
  } : {
    active: false, deactivatedAt: now, deactivatedByCapid: auth.actor.capid,
    deactivationReason: String(body.reason || '').trim() || null, updatedAt: now,
  });
  await logActivity(env, null, {
    type: active ? 'member_reactivated' : 'member_deactivated',
    actorCapid: auth.actor.capid, actorName: auth.actor.displayName,
    targetCapid: target, targetName: member.displayName || member.fullName,
    details: { reason: body.reason || null },
  });
  return json(env, request, { success: true });
}

async function handleAdminResetPin(env, request, body) {
  const auth = await requireAdminActor(env, body, 'canResetPins');
  if (auth.error) return json(env, request, { error: auth.error }, auth.status);
  const target = String(body.targetCapid || '').trim();
  const member = await fsGet(env, `members/${target}`);
  if (!member) return json(env, request, { error: 'Member not found.' }, 404);
  await fsSet(env, `memberPins/${target}`, {
    pinHash: null, pinCreatedAt: null, pinUpdatedAt: new Date(),
  });
  await fsUpdate(env, `members/${target}`, { hasPin: false, pinResetRequired: true, updatedAt: new Date() });
  await logActivity(env, null, {
    type: 'pin_reset', actorCapid: auth.actor.capid, actorName: auth.actor.displayName,
    targetCapid: target, targetName: member.displayName || member.fullName,
  });
  return json(env, request, { success: true, targetName: member.displayName || member.fullName });
}

async function handleAdminForceAttendance(env, request, body) {
  const auth = await requireAdminActor(env, body, 'canForceAttendance');
  if (auth.error) return json(env, request, { error: auth.error }, auth.status);
  const target = String(body.targetMemberId || '').trim();
  const member = await fsGet(env, `members/${target}`);
  if (!member || member.active === false) return json(env, request, { error: 'Active member not found.' }, 404);
  const meeting = await ensureMeeting(env);
  const records = await fsQuery(env, 'attendanceRecords', { meetingId: meeting.id });
  const open = records.find((r) => String(r.memberId) === target && r.status === 'checked_in');
  const action = body.action === 'check_out' ? 'check_out' : 'check_in';
  const now = new Date();
  if (action === 'check_in') {
    if (open) return json(env, request, { error: 'Member is already checked in.' }, 409);
    await fsCreate(env, 'attendanceRecords', {
      meetingId: meeting.id, memberId: target, capid: target,
      memberName: member.displayName || member.fullName, grade: member.grade, role: member.role,
      status: 'checked_in', checkInTime: now, checkOutTime: null, durationMinutes: null,
      checkedInBy: auth.actor.capid, forceAction: true, forceActionBy: auth.actor.capid,
      forceType: 'admin', notes: String(body.note || '').trim() || null,
      createdAt: now, updatedAt: now,
    });
  } else {
    if (!open) return json(env, request, { error: 'Member is not currently checked in.' }, 409);
    const durationMinutes = open.checkInTime
      ? Math.max(0, Math.round((now - new Date(open.checkInTime)) / 60000))
      : null;
    await fsUpdate(env, `attendanceRecords/${open.id}`, {
      status: 'checked_out', checkOutTime: now, durationMinutes,
      checkedOutBy: auth.actor.capid, forceAction: true, forceActionBy: auth.actor.capid,
      forceType: 'admin', notes: String(body.note || '').trim() || null, updatedAt: now,
    });
  }
  await logActivity(env, meeting.id, {
    type: action === 'check_in' ? 'force_check_in' : 'force_check_out',
    actorCapid: auth.actor.capid, actorName: auth.actor.displayName,
    targetCapid: target, targetName: member.displayName || member.fullName,
    details: { note: body.note || null },
  });
  await refreshPresence(env, meeting.id, meeting.meetingDate);
  return json(env, request, { success: true, action, timestamp: now.toISOString() });
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
  // A badge/licence scan has no host and is not an open house; it gets its own
  // mode so reports do not mislabel a scanned visitor as an open-house guest.
  const badge = !!body.badge;
  const openHouse = !badge && !!body.openHouse;
  const meeting = await ensureMeeting(env);

  let hostName = null;
  if (!badge && !openHouse) {
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
    signInMode: badge ? 'badge' : openHouse ? 'open_house' : 'hosted',
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

// Badge / licence scan for the front desk kiosk.
//
// This exists because the kiosk's source of truth is publicPresence/current,
// which only this Worker can write (refreshPresence). A browser writing
// straight to Firestore records attendance that the rest of the app never
// sees, so every scan has to come through here.
//
// The scan is the only credential: there is no PIN. That is a squadron
// decision, so it is off unless BADGE_SCAN_ENABLED is set, is rate limited per
// badge and overall, and every scan is logged with method "badge" so a lost or
// copied badge can be audited afterwards.
// Name matching for licence scans. The public kiosk has no roster by design, so
// resolving a scanned name to a member has to happen here.
function nameKeyOf(first, last) {
  const clean = (v) => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return `${clean(first)} ${clean(last)}`.trim();
}

function memberNameKey(m) {
  if (m.firstName || m.lastName) return nameKeyOf(m.firstName, m.lastName);
  const tokens = String(m.displayName || m.fullName || '').trim().split(/\s+/);
  if (!tokens[0]) return '';
  return nameKeyOf(tokens[0], tokens.length > 1 ? tokens[tokens.length - 1] : tokens[0]);
}

async function findMembersByName(env, firstName, lastName) {
  const key = nameKeyOf(firstName, lastName);
  if (!key.trim()) return [];
  const all = await fsQuery(env, 'members', {}, 500);
  return all.filter((m) => m.active !== false && memberNameKey(m) === key);
}


async function handleBadgeScan(env, request, body) {
  if (String(env.BADGE_SCAN_ENABLED || '') !== 'true') {
    return json(env, request, { error: 'Badge scanning is not enabled for this squadron.' }, 403);
  }
  // Rate limit before any Firestore read: a licence scan resolves names against
  // the whole roster, and nothing here is authenticated.
  const scanKey = String(body.capid || '').trim() || nameKeyOf(body.firstName, body.lastName) || 'anon';
  const perBadge = await rateLimit(env, `badge:${scanKey}`, Number(env.BADGE_MAX_SCANS || 10), Number(env.BADGE_WINDOW_SECONDS || 60));
  if (!perBadge.ok) return json(env, request, { error: 'Too many scans for this badge. Wait a moment and try again.' }, 429);
  const overall = await rateLimit(env, 'badge:all', Number(env.BADGE_MAX_SCANS_TOTAL || 240), Number(env.BADGE_WINDOW_SECONDS || 60));
  if (!overall.ok) return json(env, request, { error: 'Scanner is busy. Try again in a moment.' }, 429);

  const byName = !body.capid && (body.firstName || body.lastName);
  let capid = String(body.capid || '').trim();

  if (byName) {
    // Licence scan: resolve the name against the roster here, never in the browser.
    const matches = await findMembersByName(env, body.firstName, body.lastName);
    if (matches.length === 0) {
      // Not a member. A normal outcome — the caller signs them in as a guest.
      return json(env, request, { success: true, match: 'none' });
    }
    if (matches.length > 1) {
      return json(env, request, {
        success: true,
        match: 'ambiguous',
        candidates: matches.map((m) => ({
          memberId: String(m.capid || m.memberId || m.id),
          displayName: m.displayName || m.fullName || '',
          grade: m.grade || '',
        })),
      });
    }
    capid = String(matches[0].capid || matches[0].memberId || matches[0].id);
  }

  if (!/^\d{6,8}$/.test(capid)) {
    return json(env, request, { error: 'Badge must contain a 6-8 digit CAPID.' }, 400);
  }


  const member = await fsGet(env, `members/${capid}`);
  if (!member || member.active === false) {
    return json(env, request, { error: 'That badge is not on the active roster.' }, 404);
  }

  const meeting = await ensureMeeting(env);
  const records = await fsQuery(env, 'attendanceRecords', { meetingId: meeting.id });
  const open = records.find((r) => String(r.memberId) === capid && r.status === 'checked_in');
  const now = new Date();
  const memberName = member.displayName || member.fullName || capid;

  if (open) {
    const durationMinutes = open.checkInTime
      ? Math.max(0, Math.round((now - new Date(open.checkInTime)) / 60000))
      : null;
    await fsUpdate(env, `attendanceRecords/${open.id}`, {
      status: 'checked_out', checkOutTime: now, durationMinutes,
      checkedOutBy: capid, checkInMethod: 'badge', updatedAt: now,
    });
    await logActivity(env, meeting.id, {
      type: 'member_checked_out', targetCapid: capid, targetName: memberName,
      details: { method: 'badge' },
    });
    await refreshPresence(env, meeting.id, meeting.meetingDate);
    return json(env, request, { success: true, action: 'check_out', memberName, timestamp: now.toISOString() });
  }

  await fsCreate(env, 'attendanceRecords', {
    meetingId: meeting.id, memberId: capid, capid,
    memberName, grade: member.grade, role: member.role,
    isProspective: !!member.isProspective,
    status: 'checked_in', checkInTime: now, checkOutTime: null, durationMinutes: null,
    checkedInBy: capid, checkInMethod: 'badge', forceAction: false, notes: null,
    createdAt: now, updatedAt: now,
  });
  await logActivity(env, meeting.id, {
    type: 'member_checked_in', targetCapid: capid, targetName: memberName,
    details: { method: 'badge' },
  });
  await refreshPresence(env, meeting.id, meeting.meetingDate);
  return json(env, request, { success: true, action: 'check_in', memberName, timestamp: now.toISOString() });
}

const ROUTES = {
  'POST /admin/login': handleAdminLogin,
  'POST /admin/member/create': handleAdminCreateMember,
  'POST /admin/member/update': handleAdminUpdateMember,
  'POST /admin/member/set-active': handleAdminSetMemberActive,
  'POST /admin/member/reset-pin': handleAdminResetPin,
  'POST /admin/attendance/force': handleAdminForceAttendance,
  'POST /member/search': handleSearch,
  'POST /member/create-pin': handleCreatePin,
  'POST /member/check-in': handleCheckIn,
  'POST /member/check-out': handleCheckOut,
  'POST /member/badge-scan': handleBadgeScan,
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
