const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const bcrypt = require('bcryptjs');

initializeApp();
const db = getFirestore();

const BCRYPT_ROUNDS = 10;

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

async function getMember(capid) {
  const snap = await db.collection('members').doc(String(capid)).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function getMemberPin(capid) {
  const snap = await db.collection('memberPins').doc(String(capid)).get();
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
  actorCapid = null,
  actorName = null,
  targetCapid = null,
  targetName = null,
  details = null,
}) {
  await db.collection('activityLog').add({
    meetingId,
    type,
    actorCapid,
    actorName,
    targetCapid,
    targetName,
    details,
    timestamp: FieldValue.serverTimestamp(),
  });
}

function activityMessage(type, actorName, targetName, details) {
  switch (type) {
    case 'member_checked_in':
      return `${targetName} checked in`;
    case 'member_checked_out':
      return `${targetName} checked out`;
    case 'guest_checked_in':
      return `${targetName} (Guest) checked in`;
    case 'guest_checked_out':
      return `${targetName} (Guest) checked out`;
    case 'force_check_in':
      return `${targetName} force checked in by ${actorName}`;
    case 'force_check_out':
      return `${targetName} force checked out by ${actorName}`;
    case 'pin_created':
      return `${targetName} created their PIN`;
    case 'pin_reset':
      return `${targetName}'s PIN was reset by ${actorName}`;
    case 'report_exported':
      return `${actorName} exported ${details?.format || 'report'}`;
    default:
      return details?.message || 'Activity recorded';
  }
}

async function verifyActorPin(capid, pin) {
  const member = await getMember(capid);
  if (!member || !member.active) {
    throw new HttpsError('not-found', 'Member not found.');
  }
  const pinDoc = await getMemberPin(capid);
  if (!pinDoc?.pinHash) {
    throw new HttpsError('failed-precondition', 'PIN not set for this member.');
  }
  const valid = await verifyPinHash(pin, pinDoc.pinHash);
  if (!valid) {
    throw new HttpsError('permission-denied', 'Incorrect PIN.');
  }
  return member;
}

async function requireSenior(actor) {
  if (!actor.isSeniorMember) {
    throw new HttpsError('permission-denied', 'Senior member access required.');
  }
}

async function requirePinResetAuth(actor) {
  await requireSenior(actor);
  if (!actor.canResetPins) {
    throw new HttpsError('permission-denied', 'Not authorized to reset PINs.');
  }
}

function validatePin(pin) {
  if (!pin || !/^\d{4}$/.test(pin)) {
    throw new HttpsError('invalid-argument', 'PIN must be exactly 4 digits.');
  }
}

async function getOpenAttendanceRecord(meetingId, capid) {
  const snap = await db
    .collection('attendanceRecords')
    .where('meetingId', '==', meetingId)
    .where('capid', '==', String(capid))
    .limit(5)
    .get();

  const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return records.find((r) => r.status === 'checked_in') || null;
}

exports.createPin = onCall(async (request) => {
  const { capid, pin, confirmPin } = request.data || {};
  validatePin(pin);
  if (pin !== confirmPin) {
    throw new HttpsError('invalid-argument', 'PIN confirmation does not match.');
  }

  const member = await getMember(capid);
  if (!member || !member.active) {
    throw new HttpsError('not-found', 'Member not found.');
  }

  const existingPin = await getMemberPin(capid);
  if (existingPin?.pinHash && !member.pinResetRequired) {
    throw new HttpsError('already-exists', 'PIN already exists. Use your PIN to check in.');
  }

  const pinHash = await hashPin(pin);
  const now = FieldValue.serverTimestamp();

  await db.collection('memberPins').doc(String(capid)).set({
    pinHash,
    pinCreatedAt: existingPin?.pinCreatedAt || now,
    pinUpdatedAt: now,
  });

  await db.collection('members').doc(String(capid)).update({
    hasPin: true,
    pinResetRequired: false,
    updatedAt: now,
  });

  const meeting = await getOrCreateTodaysMeeting();
  await logActivity({
    meetingId: meeting.id,
    type: 'pin_created',
    targetCapid: String(capid),
    targetName: member.displayName,
    details: { capid: String(capid) },
  });

  return {
    success: true,
    message: 'PIN created successfully.',
    displayName: member.displayName,
  };
});

exports.verifyPinAndCheckIn = onCall(async (request) => {
  const { capid, pin } = request.data || {};
  validatePin(pin);

  const member = await verifyActorPin(capid, pin);
  const meeting = await getOrCreateTodaysMeeting();

  const openRecord = await getOpenAttendanceRecord(meeting.id, capid);
  if (openRecord) {
    throw new HttpsError('already-exists', 'Already checked in for tonight\'s meeting.');
  }

  const now = Timestamp.now();
  const recordRef = db.collection('attendanceRecords').doc();
  await recordRef.set({
    meetingId: meeting.id,
    capid: String(capid),
    memberName: member.displayName,
    grade: member.grade,
    role: member.role,
    status: 'checked_in',
    checkInTime: now,
    checkOutTime: null,
    durationMinutes: null,
    checkedInBy: String(capid),
    checkedOutBy: null,
    forceAction: false,
    notes: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logActivity({
    meetingId: meeting.id,
    type: 'member_checked_in',
    actorCapid: String(capid),
    actorName: member.displayName,
    targetCapid: String(capid),
    targetName: member.displayName,
  });

  return {
    success: true,
    recordId: recordRef.id,
    checkInTime: now.toDate().toISOString(),
    memberName: member.displayName,
  };
});

exports.verifyPinAndCheckOut = onCall(async (request) => {
  const { capid, pin } = request.data || {};
  validatePin(pin);

  const member = await verifyActorPin(capid, pin);
  const meeting = await getOrCreateTodaysMeeting();

  const openRecord = await getOpenAttendanceRecord(meeting.id, capid);
  if (!openRecord) {
    throw new HttpsError('not-found', 'No active check-in found for tonight\'s meeting.');
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
    checkedOutBy: String(capid),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logActivity({
    meetingId: meeting.id,
    type: 'member_checked_out',
    actorCapid: String(capid),
    actorName: member.displayName,
    targetCapid: String(capid),
    targetName: member.displayName,
  });

  return {
    success: true,
    recordId: openRecord.id,
    checkOutTime: now.toDate().toISOString(),
    memberName: member.displayName,
  };
});

exports.resetMemberPin = onCall(async (request) => {
  const { actorCapid, actorPin, targetCapid } = request.data || {};
  validatePin(actorPin);

  const actor = await verifyActorPin(actorCapid, actorPin);
  await requirePinResetAuth(actor);

  const target = await getMember(targetCapid);
  if (!target || !target.active) {
    throw new HttpsError('not-found', 'Target member not found.');
  }

  await db.collection('memberPins').doc(String(targetCapid)).delete();
  await db.collection('members').doc(String(targetCapid)).update({
    hasPin: false,
    pinResetRequired: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const meeting = await getOrCreateTodaysMeeting();
  await logActivity({
    meetingId: meeting.id,
    type: 'pin_reset',
    actorCapid: String(actorCapid),
    actorName: actor.displayName,
    targetCapid: String(targetCapid),
    targetName: target.displayName,
  });

  return { success: true, message: `PIN reset for ${target.displayName}.` };
});

exports.forceCheckIn = onCall(async (request) => {
  const { actorCapid, actorPin, targetCapid, notes } = request.data || {};
  validatePin(actorPin);

  const actor = await verifyActorPin(actorCapid, actorPin);
  await requireSenior(actor);

  const target = await getMember(targetCapid);
  if (!target || !target.active) {
    throw new HttpsError('not-found', 'Target member not found.');
  }

  const meeting = await getOrCreateTodaysMeeting();
  const openRecord = await getOpenAttendanceRecord(meeting.id, targetCapid);
  if (openRecord) {
    throw new HttpsError('already-exists', 'Member is already checked in.');
  }

  const now = Timestamp.now();
  const recordRef = db.collection('attendanceRecords').doc();
  await recordRef.set({
    meetingId: meeting.id,
    capid: String(targetCapid),
    memberName: target.displayName,
    grade: target.grade,
    role: target.role,
    status: 'checked_in',
    checkInTime: now,
    checkOutTime: null,
    durationMinutes: null,
    checkedInBy: String(actorCapid),
    checkedOutBy: null,
    forceAction: true,
    notes: notes || null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logActivity({
    meetingId: meeting.id,
    type: 'force_check_in',
    actorCapid: String(actorCapid),
    actorName: actor.displayName,
    targetCapid: String(targetCapid),
    targetName: target.displayName,
    details: { notes: notes || null },
  });

  return { success: true, checkInTime: now.toDate().toISOString() };
});

exports.forceCheckOut = onCall(async (request) => {
  const { actorCapid, actorPin, targetCapid, notes } = request.data || {};
  validatePin(actorPin);

  const actor = await verifyActorPin(actorCapid, actorPin);
  await requireSenior(actor);

  const target = await getMember(targetCapid);
  if (!target || !target.active) {
    throw new HttpsError('not-found', 'Target member not found.');
  }

  const meeting = await getOrCreateTodaysMeeting();
  const openRecord = await getOpenAttendanceRecord(meeting.id, targetCapid);
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
    notes: notes || null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logActivity({
    meetingId: meeting.id,
    type: 'force_check_out',
    actorCapid: String(actorCapid),
    actorName: actor.displayName,
    targetCapid: String(targetCapid),
    targetName: target.displayName,
    details: { notes: notes || null },
  });

  return { success: true, checkOutTime: now.toDate().toISOString() };
});

exports.guestCheckIn = onCall(async (request) => {
  const { hostCapid, hostPin, guestName, guestId } = request.data || {};
  validatePin(hostPin);

  if (!guestName || !guestName.trim()) {
    throw new HttpsError('invalid-argument', 'Guest name is required.');
  }

  const host = await verifyActorPin(hostCapid, hostPin);
  await requireSenior(host);

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
      hostName: host.displayName,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    guestRef = db.collection('guests').doc();
    await guestRef.set({
      guestId: guestRef.id,
      fullName: trimmedName,
      normalizedName: normalized,
      hostCapid: String(hostCapid),
      hostName: host.displayName,
      firstVisitDate: today,
      lastVisitDate: today,
      totalVisits: 1,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const attendanceRef = db.collection('guestAttendanceRecords').doc();
  await attendanceRef.set({
    meetingId: meeting.id,
    guestId: guestRef.id,
    guestName: trimmedName,
    hostCapid: String(hostCapid),
    hostName: host.displayName,
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
    actorCapid: String(hostCapid),
    actorName: host.displayName,
    targetName: trimmedName,
    details: { guestId: guestRef.id },
  });

  return {
    success: true,
    guestId: guestRef.id,
    attendanceId: attendanceRef.id,
    checkInTime: now.toDate().toISOString(),
  };
});

exports.guestCheckOut = onCall(async (request) => {
  const { guestAttendanceId, hostCapid, hostPin } = request.data || {};

  if (hostCapid && hostPin) {
    validatePin(hostPin);
    const host = await verifyActorPin(hostCapid, hostPin);
    await requireSenior(host);
  }

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
    updatedAt: FieldValue.serverTimestamp(),
  });

  const meeting = await getOrCreateTodaysMeeting();
  await logActivity({
    meetingId: meeting.id,
    type: 'guest_checked_out',
    actorCapid: hostCapid ? String(hostCapid) : null,
    targetName: record.guestName,
    details: { guestId: record.guestId },
  });

  return { success: true, checkOutTime: now.toDate().toISOString() };
});

exports.verifySeniorAccess = onCall(async (request) => {
  const { capid, pin } = request.data || {};
  validatePin(pin);

  const member = await verifyActorPin(capid, pin);
  await requireSenior(member);

  return {
    success: true,
    capid: String(capid),
    displayName: member.displayName,
    canResetPins: !!member.canResetPins,
    canExportReports: !!member.canExportReports,
  };
});

exports.exportReport = onCall(async (request) => {
  const { actorCapid, actorPin, meetingId, format } = request.data || {};
  validatePin(actorPin);

  const actor = await verifyActorPin(actorCapid, actorPin);
  await requireSenior(actor);

  const meeting = meetingId
    ? (await db.collection('meetings').doc(meetingId).get()).data()
    : await getOrCreateTodaysMeeting();

  const resolvedMeetingId = meetingId || meeting.id;
  const exportFormat = format || 'csv';

  const [memberSnap, guestSnap] = await Promise.all([
    db.collection('attendanceRecords').where('meetingId', '==', resolvedMeetingId).get(),
    db.collection('guestAttendanceRecords').where('meetingId', '==', resolvedMeetingId).get(),
  ]);

  const memberRows = memberSnap.docs.map((d) => {
    const r = d.data();
    return {
      name: r.memberName,
      grade: r.grade,
      capid: r.capid,
      role: r.role,
      status: r.status,
      checkIn: r.checkInTime?.toDate?.()?.toISOString() || '',
      checkOut: r.checkOutTime?.toDate?.()?.toISOString() || '',
      durationMinutes: r.durationMinutes,
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

  let content = '';
  let mimeType = 'text/csv';

  if (exportFormat === 'csv') {
    const headers = ['Name', 'Grade', 'CAPID', 'Role', 'Status', 'Check-In', 'Check-Out', 'Duration (min)'];
    const rows = [
      headers.join(','),
      ...memberRows.map((r) =>
        [r.name, r.grade, r.capid, r.role, r.status, r.checkIn, r.checkOut, r.durationMinutes ?? '']
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(',')
      ),
      ...guestRows.map((r) =>
        [r.name, '—', '—', 'Guest', r.status, r.checkIn, r.checkOut, r.durationMinutes ?? '']
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
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
    exportedByCapid: String(actorCapid),
    exportedByName: actor.displayName,
    format: exportFormat,
    createdAt: FieldValue.serverTimestamp(),
    downloadUrl: null,
    rowCount: memberRows.length + guestRows.length,
  });

  await logActivity({
    meetingId: resolvedMeetingId,
    type: 'report_exported',
    actorCapid: String(actorCapid),
    actorName: actor.displayName,
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
