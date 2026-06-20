const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const bcrypt = require('bcryptjs');

initializeApp();
const db = getFirestore();

const BCRYPT_ROUNDS = 10;

// Keep callable functions small and bounded for free-tier kiosk usage.
const callableOptions = {
  timeoutSeconds: 30,
  maxInstances: 10,
  memory: '256MiB',
};

const ADMIN_CAPIDS = new Set([
  '326320', // Maj Steven C Mellard
  '249023', // 1st Lt Ernest E Burchell
  '757794', // 2d Lt Tonya M Osborne
  '702226', // 1st Lt Mel W Osborne
  '740617', // 2d Lt Tyler M Thomas
  '729204', // 2d Lt Tristan G Maratos
]);

function memberIsSenior(member) {
  if (!member) return false;
  if (member.isProspective) return false;
  if (member.isSeniorMember) return true;
  if (member.role === 'Senior Member') return true;
  if (member.isCadet || member.role === 'Cadet') return false;
  const grade = String(member.grade || '').toUpperCase();
  return !grade.startsWith('C/') && grade !== 'CADET';
}

function resolveActorPermissions(member) {
  const isSenior = memberIsSenior(member);
  const isAdmin = isSenior || !!member.isAdmin || ADMIN_CAPIDS.has(String(member.capid || member.memberId || member.id));
  return {
    isAdmin,
    canForceAttendance: isAdmin || !!member.canForceAttendance,
    canResetPins: isAdmin || !!member.canResetPins,
    canExportReports: isAdmin || !!member.canExportReports,
    canManageMembers: isAdmin || !!member.canManageMembers,
    canManageGuests: isAdmin || !!member.canManageGuests,
  };
}

function todayDateString() {
  return new Date().toISOString().split('T')[0];
}

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function hashPin(pin) {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

async function verifyPinHash(pin, hash) {
  if (!hash) return false;
  return bcrypt.compare(pin, hash);
}

async function getMember(memberId) {
  const snap = await db.collection('members').doc(String(memberId)).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return {
    id: snap.id,
    memberId: data.memberId || snap.id,
    displayName: data.displayName || data.fullName,
    ...data,
  };
}

async function getMemberPin(memberId) {
  const snap = await db.collection('memberPins').doc(String(memberId)).get();
  if (!snap.exists) return null;
  return snap.data();
}

async function getOrCreateTodaysMeeting() {
  const meetingDate = todayDateString();
  const existing = await db
    .collection('meetings')
    .where('meetingDate', '==', meetingDate)
    .limit(1)
    .get();

  if (!existing.empty) {
    const doc = existing.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  const ref = db.collection('meetings').doc();
  const meeting = {
    meetingDate,
    meetingTitle: `Squadron Meeting — ${meetingDate}`,
    startTime: null,
    endTime: null,
    status: 'in_progress',
    createdBy: 'system',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(meeting);
  return { id: ref.id, ...meeting };
}

async function logActivity({
  meetingId,
  type,
  actorMemberId = null,
  actorCapid = null,
  actorName = null,
  targetMemberId = null,
  targetCapid = null,
  targetName = null,
  guestId = null,
  guestName = null,
  details = null,
}) {
  await db.collection('activityLog').add({
    meetingId: meetingId || null,
    activityType: type,
    type,
    actorMemberId,
    actorCapid,
    actorName,
    targetMemberId,
    targetCapid,
    targetName,
    guestId,
    guestName,
    details,
    timestamp: FieldValue.serverTimestamp(),
  });
}

async function verifyActorPin(memberId, pin) {
  const member = await getMember(memberId);
  if (!member || member.active === false) {
    throw new HttpsError('not-found', 'Member not found.');
  }
  const pinDoc = await getMemberPin(memberId);
  if (!pinDoc?.pinHash) {
    throw new HttpsError('failed-precondition', 'PIN not set for this member.');
  }
  const valid = await verifyPinHash(pin, pinDoc.pinHash);
  if (!valid) {
    throw new HttpsError('permission-denied', 'Incorrect PIN.');
  }
  return { ...member, ...resolveActorPermissions(member) };
}

function validatePin(pin) {
  if (!pin || !/^\d{4}$/.test(pin)) {
    throw new HttpsError('invalid-argument', 'PIN must be exactly 4 digits.');
  }
}

async function requireSenior(actor) {
  if (!actor.isSeniorMember) {
    throw new HttpsError('permission-denied', 'Senior member access required.');
  }
}

async function requireForceAttendance(actor) {
  await requireSenior(actor);
  if (!actor.canForceAttendance && !actor.isAdmin) {
    throw new HttpsError('permission-denied', 'Not authorized to force attendance.');
  }
}

async function requirePinResetAuth(actor) {
  await requireSenior(actor);
  if (!actor.canResetPins && !actor.isAdmin) {
    throw new HttpsError('permission-denied', 'Not authorized to reset PINs.');
  }
}

async function requireExportReports(actor) {
  await requireSenior(actor);
  if (!actor.canExportReports && !actor.isAdmin) {
    throw new HttpsError('permission-denied', 'Not authorized to export reports.');
  }
}

async function requireManageMembers(actor) {
  await requireSenior(actor);
  if (!actor.canManageMembers && !actor.isAdmin) {
    throw new HttpsError('permission-denied', 'Not authorized to manage members.');
  }
}

async function requireGuestHost(actor) {
  if (actor.isCadet) {
    throw new HttpsError('permission-denied', 'Cadets cannot host guests.');
  }
  await requireSenior(actor);
}

async function getOpenAttendanceRecord(meetingId, memberId) {
  const member = await getMember(memberId);
  const memberKey = String(member?.memberId || member?.id || memberId);
  const snap = await db
    .collection('attendanceRecords')
    .where('meetingId', '==', meetingId)
    .where('memberId', '==', memberKey)
    .limit(5)
    .get();

  const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return records.find((r) => r.status === 'checked_in') || null;
}

async function generateTemporaryId() {
  const today = todayDateString().replace(/-/g, '');
  const prefix = `TEMP-${today}-`;
  const existing = await db
    .collection('members')
    .where('temporaryId', '>=', prefix)
    .where('temporaryId', '<', `${prefix}\uf8ff`)
    .get();

  let maxSeq = 0;
  existing.docs.forEach((doc) => {
    const tid = doc.data().temporaryId || doc.id;
    const match = tid.match(/TEMP-\d{8}-(\d{4})$/);
    if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
  });

  const next = String(maxSeq + 1).padStart(4, '0');
  return `${prefix}${next}`;
}

function memberAttendanceFields(member) {
  return {
    memberId: member.memberId || member.id,
    capid: member.capid || null,
    temporaryId: member.temporaryId || (!member.capid ? (member.memberId || member.id) : null),
    memberName: member.displayName || member.fullName,
    grade: member.grade,
    role: member.role,
    isProspective: !!member.isProspective,
  };
}

exports.createPin = onCall(callableOptions, async (request) => {
  const { capid, pin, confirmPin } = request.data || {};
  const memberId = String(capid);
  validatePin(pin);
  if (pin !== confirmPin) {
    throw new HttpsError('invalid-argument', 'PIN confirmation does not match.');
  }

  const member = await getMember(memberId);
  if (!member || member.active === false) {
    throw new HttpsError('not-found', 'Member not found.');
  }

  const existingPin = await getMemberPin(memberId);
  const existingValidPin =
    typeof existingPin?.pinHash === 'string'
    && existingPin.pinHash.length >= 8
    && (existingPin.pinHash.startsWith('sha256:') || existingPin.pinHash.startsWith('fnv1a:'));
  if (existingValidPin && !member.pinResetRequired) {
    throw new HttpsError('already-exists', 'PIN already exists. Use your PIN to check in.');
  }

  const pinHash = await hashPin(pin);
  const now = FieldValue.serverTimestamp();

  await db.collection('memberPins').doc(memberId).set({
    pinHash,
    pinCreatedAt: existingPin?.pinCreatedAt || now,
    pinUpdatedAt: now,
  });

  await db.collection('members').doc(memberId).update({
    hasPin: true,
    pinResetRequired: false,
    updatedAt: now,
  });

  const meeting = await getOrCreateTodaysMeeting();
  await logActivity({
    meetingId: meeting.id,
    type: 'pin_created',
    targetMemberId: memberId,
    targetCapid: member.capid || member.temporaryId || memberId,
    targetName: member.displayName || member.fullName,
    details: { memberId },
  });

  return {
    success: true,
    message: 'PIN created successfully.',
    displayName: member.displayName || member.fullName,
  };
});

exports.verifyPinAndCheckIn = onCall(callableOptions, async (request) => {
  const { capid, pin } = request.data || {};
  const memberId = String(capid);
  validatePin(pin);

  const member = await verifyActorPin(memberId, pin);
  const meeting = await getOrCreateTodaysMeeting();

  const openRecord = await getOpenAttendanceRecord(meeting.id, memberId);
  if (openRecord) {
    throw new HttpsError('already-exists', "Already checked in for tonight's meeting.");
  }

  const now = Timestamp.now();
  const recordRef = db.collection('attendanceRecords').doc();
  await recordRef.set({
    meetingId: meeting.id,
    ...memberAttendanceFields(member),
    status: 'checked_in',
    checkInTime: now,
    checkOutTime: null,
    durationMinutes: null,
    checkedInBy: memberId,
    checkedOutBy: null,
    forceAction: false,
    notes: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logActivity({
    meetingId: meeting.id,
    type: 'member_checked_in',
    actorMemberId: memberId,
    actorCapid: member.capid || member.temporaryId || memberId,
    actorName: member.displayName || member.fullName,
    targetMemberId: memberId,
    targetCapid: member.capid || member.temporaryId || memberId,
    targetName: member.displayName || member.fullName,
  });

  return {
    success: true,
    recordId: recordRef.id,
    checkInTime: now.toDate().toISOString(),
    memberName: member.displayName || member.fullName,
  };
});

exports.verifyPinAndCheckOut = onCall(callableOptions, async (request) => {
  const { capid } = request.data || {};
  const memberId = String(capid);
  if (!memberId) {
    throw new HttpsError('invalid-argument', 'Member CAPID is required.');
  }

  const member = await getMember(memberId);
  if (!member || member.active === false) {
    throw new HttpsError('not-found', 'Member not found.');
  }
  const meeting = await getOrCreateTodaysMeeting();

  const openRecord = await getOpenAttendanceRecord(meeting.id, memberId);
  if (!openRecord) {
    throw new HttpsError('not-found', "No active check-in found for tonight's meeting.");
  }

  const now = Timestamp.now();
  const checkInTime = openRecord.checkInTime;
  const durationMinutes = checkInTime
    ? Math.round((now.toMillis() - checkInTime.toMillis()) / 60000)
    : null;

  await db.collection('attendanceRecords').doc(openRecord.id).update({
    status: 'checked_out',
    checkOutTime: now,
    durationMinutes,
    checkedOutBy: memberId,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logActivity({
    meetingId: meeting.id,
    type: 'member_checked_out',
    actorCapid: member.capid || member.temporaryId || memberId,
    actorName: member.displayName || member.fullName,
    targetCapid: member.capid || member.temporaryId || memberId,
    targetName: member.displayName || member.fullName,
  });

  return {
    success: true,
    recordId: openRecord.id,
    checkOutTime: now.toDate().toISOString(),
    memberName: member.displayName || member.fullName,
  };
});

exports.resetMemberPin = onCall(callableOptions, async (request) => {
  const { actorCapid, actorPin, targetCapid } = request.data || {};
  validatePin(actorPin);

  const actor = await verifyActorPin(actorCapid, actorPin);
  await requirePinResetAuth(actor);

  const target = await getMember(targetCapid);
  if (!target || target.active === false) {
    throw new HttpsError('not-found', 'Target member not found.');
  }

  const targetId = target.memberId || target.id;

  await db.collection('memberPins').doc(String(targetId)).delete();
  await db.collection('members').doc(String(targetId)).update({
    hasPin: false,
    pinResetRequired: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const meeting = await getOrCreateTodaysMeeting();
  await logActivity({
    meetingId: meeting.id,
    type: 'pin_reset',
    actorCapid: actor.capid || actorCapid,
    actorName: actor.displayName || actor.fullName,
    targetCapid: target.capid || target.temporaryId || targetId,
    targetName: target.displayName || target.fullName,
  });

  return { success: true, message: `PIN reset for ${target.displayName || target.fullName}.` };
});

exports.forceCheckIn = onCall(callableOptions, async (request) => {
  const { actorCapid, actorPin, targetCapid, notes } = request.data || {};
  validatePin(actorPin);

  const actor = await verifyActorPin(actorCapid, actorPin);
  await requireForceAttendance(actor);

  const target = await getMember(targetCapid);
  if (!target || target.active === false) {
    throw new HttpsError('not-found', 'Target member not found.');
  }

  const targetId = target.memberId || target.id;
  const meeting = await getOrCreateTodaysMeeting();
  const openRecord = await getOpenAttendanceRecord(meeting.id, targetId);
  if (openRecord) {
    throw new HttpsError('already-exists', 'Member is already checked in.');
  }

  const now = Timestamp.now();
  const recordRef = db.collection('attendanceRecords').doc();
  await recordRef.set({
    meetingId: meeting.id,
    ...memberAttendanceFields(target),
    status: 'checked_in',
    checkInTime: now,
    checkOutTime: null,
    durationMinutes: null,
    checkedInBy: String(actorCapid),
    checkedOutBy: null,
    forceAction: true,
    forceActionBy: String(actorCapid),
    forceType: 'admin',
    notes: notes || null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logActivity({
    meetingId: meeting.id,
    type: 'force_check_in',
    actorMemberId: String(actorCapid),
    actorCapid: actor.capid || actorCapid,
    actorName: actor.displayName || actor.fullName,
    targetMemberId: targetId,
    targetCapid: target.capid || target.temporaryId || targetId,
    targetName: target.displayName || target.fullName,
    details: { notes: notes || null },
  });

  return { success: true, checkInTime: now.toDate().toISOString() };
});

exports.forceCheckOut = onCall(callableOptions, async (request) => {
  const { actorCapid, actorPin, targetCapid, notes } = request.data || {};
  validatePin(actorPin);

  const actor = await verifyActorPin(actorCapid, actorPin);
  await requireForceAttendance(actor);

  const target = await getMember(targetCapid);
  if (!target || target.active === false) {
    throw new HttpsError('not-found', 'Target member not found.');
  }

  const targetId = target.memberId || target.id;
  const meeting = await getOrCreateTodaysMeeting();
  const openRecord = await getOpenAttendanceRecord(meeting.id, targetId);
  if (!openRecord) {
    throw new HttpsError('not-found', 'Member is not currently checked in.');
  }

  const now = Timestamp.now();
  const durationMinutes = openRecord.checkInTime
    ? Math.round((now.toMillis() - openRecord.checkInTime.toMillis()) / 60000)
    : null;

  await db.collection('attendanceRecords').doc(openRecord.id).update({
    status: 'checked_out',
    checkOutTime: now,
    durationMinutes,
    checkedOutBy: String(actorCapid),
    forceAction: true,
    forceActionBy: String(actorCapid),
    forceType: 'admin',
    notes: notes || null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logActivity({
    meetingId: meeting.id,
    type: 'force_check_out',
    actorMemberId: String(actorCapid),
    actorCapid: actor.capid || actorCapid,
    actorName: actor.displayName || actor.fullName,
    targetMemberId: targetId,
    targetCapid: target.capid || target.temporaryId || targetId,
    targetName: target.displayName || target.fullName,
    details: { notes: notes || null },
  });

  return { success: true, checkOutTime: now.toDate().toISOString() };
});

exports.guestCheckIn = onCall(callableOptions, async (request) => {
  const { hostCapid, hostPin, guestName, guestId } = request.data || {};
  validatePin(hostPin);

  if (!guestName || !guestName.trim()) {
    throw new HttpsError('invalid-argument', 'Guest name is required.');
  }

  const host = await verifyActorPin(hostCapid, hostPin);
  await requireGuestHost(host);

  const meeting = await getOrCreateTodaysMeeting();
  const trimmedName = guestName.trim();
  const normalized = normalizeName(trimmedName);
  const today = todayDateString();
  const now = Timestamp.now();

  let guestDoc;
  if (guestId) {
    const snap = await db.collection('guests').doc(guestId).get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Guest record not found.');
    }
    guestDoc = { id: snap.id, ...snap.data() };
  } else {
    const existing = await db
      .collection('guests')
      .where('normalizedName', '==', normalized)
      .limit(1)
      .get();

    if (!existing.empty) {
      guestDoc = { id: existing.docs[0].id, ...existing.docs[0].data() };
    }
  }

  let guestRef;
  if (guestDoc) {
    guestRef = db.collection('guests').doc(guestDoc.id);
    await guestRef.update({
      fullName: trimmedName,
      normalizedName: normalized,
      lastVisitDate: today,
      totalVisits: (guestDoc.totalVisits || 0) + 1,
      active: true,
      hostCapid: String(hostCapid),
      hostName: host.displayName || host.fullName,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    guestRef = db.collection('guests').doc();
    await guestRef.set({
      guestId: guestRef.id,
      fullName: trimmedName,
      normalizedName: normalized,
      hostCapid: String(hostCapid),
      hostName: host.displayName || host.fullName,
      firstVisitDate: today,
      lastVisitDate: today,
      totalVisits: 1,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const hostMemberId = String(host.memberId || host.id || hostCapid);
  const attendanceRef = db.collection('guestAttendanceRecords').doc();
  await attendanceRef.set({
    meetingId: meeting.id,
    guestId: guestRef.id,
    guestName: trimmedName,
    hostMemberId,
    hostCapid: String(host.capid || hostCapid),
    hostName: host.displayName || host.fullName,
    status: 'checked_in',
    checkInTime: now,
    checkOutTime: null,
    durationMinutes: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logActivity({
    meetingId: meeting.id,
    type: 'guest_checked_in',
    actorMemberId: hostMemberId,
    actorCapid: host.capid || hostCapid,
    actorName: host.displayName || host.fullName,
    guestId: guestRef.id,
    guestName: trimmedName,
    details: { guestId: guestRef.id },
  });

  return {
    success: true,
    guestId: guestRef.id,
    attendanceId: attendanceRef.id,
    checkInTime: now.toDate().toISOString(),
  };
});

exports.guestCheckOut = onCall(callableOptions, async (request) => {
  const { guestAttendanceId } = request.data || {};

  if (!guestAttendanceId) {
    throw new HttpsError('invalid-argument', 'Guest attendance record ID is required.');
  }

  const recordSnap = await db.collection('guestAttendanceRecords').doc(guestAttendanceId).get();
  if (!recordSnap.exists) {
    throw new HttpsError('not-found', 'Guest attendance record not found.');
  }

  const record = recordSnap.data();
  if (record.status === 'checked_out') {
    throw new HttpsError('already-exists', 'Guest is already checked out.');
  }

  const now = Timestamp.now();
  const durationMinutes = record.checkInTime
    ? Math.round((now.toMillis() - record.checkInTime.toMillis()) / 60000)
    : null;

  await recordSnap.ref.update({
    status: 'checked_out',
    checkOutTime: now,
    durationMinutes,
    checkedOutBy: 'kiosk',
    updatedAt: FieldValue.serverTimestamp(),
  });

  const meeting = await getOrCreateTodaysMeeting();
  await logActivity({
    meetingId: meeting.id,
    type: 'guest_checked_out',
    actorName: 'Kiosk',
    targetName: record.guestName,
    details: { guestId: record.guestId },
  });

  return { success: true, checkOutTime: now.toDate().toISOString() };
});

exports.createPendingMember = onCall(callableOptions, async (request) => {
  const { actorCapid, actorPin, fullName, grade, role } = request.data || {};
  validatePin(actorPin);

  const actor = await verifyActorPin(actorCapid, actorPin);
  await requireManageMembers(actor);

  if (!fullName || !fullName.trim()) {
    throw new HttpsError('invalid-argument', 'Full name is required.');
  }

  const temporaryId = await generateTemporaryId();
  const trimmedName = fullName.trim();
  const now = FieldValue.serverTimestamp();

  const member = {
    memberId: temporaryId,
    capid: null,
    temporaryId,
    fullName: trimmedName,
    displayName: trimmedName,
    normalizedName: normalizeName(trimmedName),
    grade: grade || 'Prospective',
    role: role || 'Prospective Member',
    isCadet: false,
    isSeniorMember: false,
    isProspective: true,
    active: true,
    hasPin: false,
    pinResetRequired: false,
    isAdmin: false,
    canForceAttendance: false,
    canResetPins: false,
    canExportReports: false,
    canManageMembers: false,
    canManageGuests: false,
    createdByCapid: actor.capid || actorCapid,
    createdByName: actor.displayName || actor.fullName,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('members').doc(temporaryId).set(member);

  const meeting = await getOrCreateTodaysMeeting();
  await logActivity({
    meetingId: meeting.id,
    type: 'pending_member_created',
    actorCapid: actor.capid || actorCapid,
    actorName: actor.displayName || actor.fullName,
    targetCapid: temporaryId,
    targetName: trimmedName,
  });

  return { success: true, memberId: temporaryId, temporaryId, fullName: trimmedName };
});

exports.updatePendingMemberCapid = onCall(callableOptions, async (request) => {
  const { actorCapid, actorPin, memberId, newCapid } = request.data || {};
  validatePin(actorPin);

  const actor = await verifyActorPin(actorCapid, actorPin);
  await requireManageMembers(actor);

  if (!memberId || !newCapid) {
    throw new HttpsError('invalid-argument', 'Member ID and new CAPID are required.');
  }

  const member = await getMember(memberId);
  if (!member) {
    throw new HttpsError('not-found', 'Member not found.');
  }
  if (!member.isProspective && !member.temporaryId) {
    throw new HttpsError('failed-precondition', 'Member is not a pending member.');
  }

  const capidStr = String(newCapid);
  const existingCapid = await db.collection('members').doc(capidStr).get();
  if (existingCapid.exists) {
    throw new HttpsError('already-exists', 'CAPID already assigned to another member.');
  }

  const oldId = member.memberId || member.id;
  const now = FieldValue.serverTimestamp();
  const updatedMember = {
    ...member,
    memberId: capidStr,
    capid: capidStr,
    isProspective: false,
    capidHistory: FieldValue.arrayUnion({
      previousTemporaryId: member.temporaryId || oldId,
      assignedCapid: capidStr,
      assignedAt: Timestamp.now(),
      assignedByCapid: actor.capid || actorCapid,
      assignedByName: actor.displayName || actor.fullName,
    }),
    updatedAt: now,
  };
  delete updatedMember.id;

  const batch = db.batch();
  batch.set(db.collection('members').doc(capidStr), updatedMember);
  batch.delete(db.collection('members').doc(oldId));

  const pinSnap = await db.collection('memberPins').doc(oldId).get();
  if (pinSnap.exists) {
    batch.set(db.collection('memberPins').doc(capidStr), pinSnap.data());
    batch.delete(db.collection('memberPins').doc(oldId));
  }

  await batch.commit();

  const meeting = await getOrCreateTodaysMeeting();
  await logActivity({
    meetingId: meeting.id,
    type: 'capid_added',
    actorCapid: actor.capid || actorCapid,
    actorName: actor.displayName || actor.fullName,
    targetCapid: capidStr,
    targetName: member.displayName || member.fullName,
    details: { previousId: oldId },
  });

  return { success: true, memberId: capidStr, capid: capidStr };
});

exports.deactivateMember = onCall(callableOptions, async (request) => {
  const { actorCapid, actorPin, targetMemberId, reason } = request.data || {};
  validatePin(actorPin);

  const actor = await verifyActorPin(actorCapid, actorPin);
  await requireManageMembers(actor);

  const target = await getMember(targetMemberId);
  if (!target) {
    throw new HttpsError('not-found', 'Member not found.');
  }

  const targetId = target.memberId || target.id;
  await db.collection('members').doc(String(targetId)).update({
    active: false,
    deactivatedAt: FieldValue.serverTimestamp(),
    deactivatedByCapid: actor.capid || actorCapid,
    deactivationReason: reason || null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const meeting = await getOrCreateTodaysMeeting();
  await logActivity({
    meetingId: meeting.id,
    type: 'member_deactivated',
    actorCapid: actor.capid || actorCapid,
    actorName: actor.displayName || actor.fullName,
    targetCapid: target.capid || target.temporaryId || targetId,
    targetName: target.displayName || target.fullName,
    details: { reason: reason || null },
  });

  return { success: true };
});

exports.reactivateMember = onCall(callableOptions, async (request) => {
  const { actorCapid, actorPin, targetMemberId } = request.data || {};
  validatePin(actorPin);

  const actor = await verifyActorPin(actorCapid, actorPin);
  await requireManageMembers(actor);

  const target = await getMember(targetMemberId);
  if (!target) {
    throw new HttpsError('not-found', 'Member not found.');
  }

  const targetId = target.memberId || target.id;
  await db.collection('members').doc(String(targetId)).update({
    active: true,
    reactivatedAt: FieldValue.serverTimestamp(),
    reactivatedByCapid: actor.capid || actorCapid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const meeting = await getOrCreateTodaysMeeting();
  await logActivity({
    meetingId: meeting.id,
    type: 'member_reactivated',
    actorCapid: actor.capid || actorCapid,
    actorName: actor.displayName || actor.fullName,
    targetCapid: target.capid || target.temporaryId || targetId,
    targetName: target.displayName || target.fullName,
  });

  return { success: true };
});

exports.startMeeting = onCall(callableOptions, async (request) => {
  const { actorCapid, actorPin, meetingTitle } = request.data || {};
  validatePin(actorPin);

  const actor = await verifyActorPin(actorCapid, actorPin);
  await requireSenior(actor);

  const meeting = await getOrCreateTodaysMeeting();
  const now = Timestamp.now();

  await db.collection('meetings').doc(meeting.id).update({
    startTime: meeting.startTime || now,
    status: 'in_progress',
    meetingTitle: meetingTitle || meeting.meetingTitle,
    startedByCapid: actor.capid || actorCapid,
    startedByName: actor.displayName || actor.fullName,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logActivity({
    meetingId: meeting.id,
    type: 'meeting_started',
    actorCapid: actor.capid || actorCapid,
    actorName: actor.displayName || actor.fullName,
  });

  return { success: true, meetingId: meeting.id };
});

exports.closeMeeting = onCall(callableOptions, async (request) => {
  const { actorCapid, actorPin } = request.data || {};
  validatePin(actorPin);

  const actor = await verifyActorPin(actorCapid, actorPin);
  if (!actor.isAdmin && !actor.canForceAttendance) {
    throw new HttpsError('permission-denied', 'Not authorized to close meetings.');
  }

  const meeting = await getOrCreateTodaysMeeting();
  const now = Timestamp.now();

  await db.collection('meetings').doc(meeting.id).update({
    endTime: now,
    closedAt: now,
    status: 'closed',
    closedByCapid: actor.capid || actorCapid,
    closedByName: actor.displayName || actor.fullName,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logActivity({
    meetingId: meeting.id,
    type: 'meeting_closed',
    actorCapid: actor.capid || actorCapid,
    actorName: actor.displayName || actor.fullName,
  });

  return { success: true, meetingId: meeting.id };
});

exports.verifySeniorAccess = onCall(callableOptions, async (request) => {
  const { capid, pin } = request.data || {};
  validatePin(pin);

  const member = await verifyActorPin(capid, pin);
  await requireSenior(member);
  const perms = resolveActorPermissions(member);

  return {
    success: true,
    capid: String(member.capid || capid),
    memberId: String(member.memberId || capid),
    displayName: member.displayName || member.fullName,
    isAdmin: !!perms.isAdmin,
    canForceAttendance: !!perms.canForceAttendance,
    canResetPins: !!perms.canResetPins,
    canExportReports: !!perms.canExportReports,
    canManageMembers: !!perms.canManageMembers,
    canManageGuests: !!perms.canManageGuests,
  };
});

exports.exportReport = onCall(callableOptions, async (request) => {
  const { actorCapid, actorPin, meetingId, format } = request.data || {};
  validatePin(actorPin);

  const actor = await verifyActorPin(actorCapid, actorPin);
  await requireExportReports(actor);

  let resolvedMeetingId = meetingId;
  let meeting;
  if (meetingId) {
    const snap = await db.collection('meetings').doc(meetingId).get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Meeting not found.');
    }
    meeting = { id: snap.id, ...snap.data() };
  } else {
    meeting = await getOrCreateTodaysMeeting();
    resolvedMeetingId = meeting.id;
  }

  const exportFormat = format || 'csv';

  const [memberSnap, guestSnap] = await Promise.all([
    db.collection('attendanceRecords').where('meetingId', '==', resolvedMeetingId).get(),
    db.collection('guestAttendanceRecords').where('meetingId', '==', resolvedMeetingId).get(),
  ]);

  const memberRows = memberSnap.docs.map((d) => {
    const r = d.data();
    return {
      name: r.memberName,
      capid: r.capid || r.temporaryId || 'Pending CAPID',
      role: r.role,
      status: r.status,
      checkIn: r.checkInTime?.toDate?.()?.toISOString() || '',
      checkOut: r.checkOutTime?.toDate?.()?.toISOString() || '',
      durationMinutes: r.durationMinutes,
      forceAction: !!r.forceAction,
      forceType: r.forceType || null,
      forceNote: r.notes || r.forceNote || '',
    };
  });

  const guestRows = guestSnap.docs.map((d) => {
    const r = d.data();
    return {
      name: r.guestName,
      host: r.hostName,
      status: r.status,
      checkIn: r.checkInTime?.toDate?.()?.toISOString() || '',
      checkOut: r.checkOutTime?.toDate?.()?.toISOString() || '',
      durationMinutes: r.durationMinutes,
    };
  });

  const formatExportTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatExportDuration = (checkIn, checkOut, durationMinutes) => {
    if (durationMinutes != null && durationMinutes !== '') return `${durationMinutes}m`;
    if (!checkIn || !checkOut) return '';
    const ms = new Date(checkOut) - new Date(checkIn);
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const memberStatusLabel = (status) => {
    if (status === 'checked_in') return 'Checked In';
    if (status === 'checked_out') return 'Checked Out';
    return 'Not Present';
  };

  const guestStatusLabel = (status) => {
    if (status === 'checked_in') return 'Present';
    if (status === 'checked_out') return 'Signed Out';
    return 'Not Present';
  };

  const forceActionNote = (record) => {
    if (!record.forceAction || !record.forceNote) return '';
    const type = record.forceType === 'system' ? 'System force logout' : 'Admin force logout';
    return `${type}: ${record.forceNote}`;
  };

  let content = '';
  let mimeType = 'text/csv';

  if (exportFormat === 'csv') {
    const headers = [
      'Type',
      'Name',
      'CAPID/Pending CAPID',
      'Role',
      'Hosted By',
      'Check-In',
      'Check-Out',
      'Duration',
      'Status',
      'Force Action Note',
    ];
    const escapeCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      headers.join(','),
      ...memberRows.map((r) =>
        [
          'Member',
          r.name,
          r.capid,
          r.role,
          '',
          formatExportTime(r.checkIn),
          formatExportTime(r.checkOut),
          formatExportDuration(r.checkIn, r.checkOut, r.durationMinutes),
          memberStatusLabel(r.status),
          forceActionNote(r),
        ]
          .map(escapeCell)
          .join(',')
      ),
      ...guestRows.map((r) =>
        [
          'Guest',
          r.name,
          '',
          '',
          r.host,
          formatExportTime(r.checkIn),
          formatExportTime(r.checkOut),
          formatExportDuration(r.checkIn, r.checkOut, r.durationMinutes),
          guestStatusLabel(r.status),
          '',
        ]
          .map(escapeCell)
          .join(',')
      ),
    ];
    content = rows.join('\n');
  } else {
    mimeType = 'application/json';
    content = JSON.stringify({
      meetingDate: meeting.meetingDate,
      exportedAt: new Date().toISOString(),
      format: exportFormat,
      note: `${exportFormat.toUpperCase()} export scaffold — CSV is fully supported.`,
      members: memberRows,
      guests: guestRows,
    }, null, 2);
  }

  const exportRef = db.collection('reportExports').doc();
  await exportRef.set({
    meetingId: resolvedMeetingId,
    exportedByCapid: String(actor.capid || actorCapid),
    exportedByName: actor.displayName || actor.fullName,
    format: exportFormat,
    createdAt: FieldValue.serverTimestamp(),
    downloadUrl: null,
    rowCount: memberRows.length + guestRows.length,
  });

  await logActivity({
    meetingId: resolvedMeetingId,
    type: 'report_exported',
    actorCapid: actor.capid || actorCapid,
    actorName: actor.displayName || actor.fullName,
    details: { format: exportFormat, exportId: exportRef.id },
  });

  return {
    success: true,
    format: exportFormat,
    mimeType,
    content,
    filename: `tn170-attendance-${meeting.meetingDate || todayDateString()}.${exportFormat === 'csv' ? 'csv' : 'json'}`,
    exportId: exportRef.id,
  };
});

module.exports.ADMIN_CAPIDS = ADMIN_CAPIDS;
