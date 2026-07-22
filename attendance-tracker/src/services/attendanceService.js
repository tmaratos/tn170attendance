import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDb, callFunction } from './firebase';
import { toUiMember } from './memberService';

const SYNC_UNAVAILABLE = 'Cloud sync unavailable. This device is not currently syncing attendance.';

/** Meetings are keyed by the Eastern (America/New_York) date so every device and
 *  the GitHub Actions automation resolve the SAME meeting document. Never use the
 *  device/UTC date here — that caused devices opening after ~8 PM ET to select a
 *  different (next-day) meeting and desync attendance. */
export const MEETING_TIMEZONE = 'America/New_York';

export function meetingDateString(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MEETING_TIMEZONE }).format(now);
}

function memberAttendanceFields(member) {
  const memberId = String(member.memberId || member.capid || member.temporaryId || member.id);
  return {
    memberId,
    capid: member.capid || null,
    temporaryId: member.temporaryId || (!member.capid ? memberId : null),
    memberName: member.displayName || member.fullName,
    grade: member.grade,
    role: member.role,
    isProspective: !!member.isProspective,
  };
}

function normalizeFirestoreError(err) {
  if (err?.code === 'permission-denied') return new Error(SYNC_UNAVAILABLE);
  return err instanceof Error ? err : new Error(err?.message || SYNC_UNAVAILABLE);
}

export { SYNC_UNAVAILABLE };

function timestampToIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value.toDate) return value.toDate().toISOString();
  if (value.seconds) return new Date(value.seconds * 1000).toISOString();
  return null;
}

function mapAttendanceRecord(docSnap) {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    checkInTime: timestampToIso(data.checkInTime),
    checkOutTime: timestampToIso(data.checkOutTime),
  };
}

export function subscribeToActiveMeeting(callback, onError) {
  const db = getDb();
  if (!db) return () => {};

  // Subscribe to the deterministic Eastern-date meeting document directly, so all
  // devices watch the exact same doc (no query, no limit(1) ambiguity, no duplicates).
  const ref = doc(db, 'meetings', meetingDateString());

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ id: snap.id, ...snap.data() });
    },
    () => {
      if (onError) onError();
      else callback(null);
    }
  );
}

/** @deprecated Use subscribeToActiveMeeting — kept as an alias for older imports. */
export function subscribeTodaysMeeting(callback, onError) {
  return subscribeToActiveMeeting(callback, onError);
}

async function appendActivityLog(db, payload) {
  await addDoc(collection(db, 'activityLog'), {
    meetingId: payload.meetingId || null,
    activityType: payload.type,
    type: payload.type,
    actorMemberId: payload.actorMemberId || null,
    actorCapid: payload.actorCapid || null,
    actorName: payload.actorName || null,
    targetMemberId: payload.targetMemberId || null,
    targetCapid: payload.targetCapid || null,
    targetName: payload.targetName || null,
    guestId: payload.guestId || null,
    guestName: payload.guestName || null,
    details: payload.details || null,
    timestamp: serverTimestamp(),
  });
}

export async function appendActivityLogSpark(payload) {
  const db = getDb();
  if (!db) throw new Error(SYNC_UNAVAILABLE);
  try {
    await appendActivityLog(db, payload);
  } catch (err) {
    throw normalizeFirestoreError(err);
  }
}

export async function ensureActiveMeeting() {
  const db = getDb();
  if (!db) throw new Error(SYNC_UNAVAILABLE);

  const meetingDate = meetingDateString();
  // Deterministic doc id = Eastern meeting date. Concurrent creates from two
  // devices write the same id with identical content (idempotent, no duplicates).
  const ref = doc(db, 'meetings', meetingDate);
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      const data = existing.data();
      if (data.status !== 'in_progress') {
        await updateDoc(ref, { status: 'in_progress', updatedAt: serverTimestamp() });
      }
      return { id: ref.id, ...data, status: 'in_progress' };
    }

    const meeting = {
      meetingDate,
      meetingTitle: `Squadron Meeting — ${meetingDate}`,
      startTime: null,
      endTime: null,
      status: 'in_progress',
      createdBy: 'kiosk',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, meeting);
    return { id: ref.id, ...meeting };
  } catch (err) {
    throw normalizeFirestoreError(err);
  }
}

async function getOpenAttendanceRecord(meetingId, memberId) {
  const db = getDb();
  const memberKey = String(memberId);
  const snap = await getDocs(
    query(
      collection(db, 'attendanceRecords'),
      where('meetingId', '==', meetingId),
      where('memberId', '==', memberKey),
      limit(5)
    )
  );
  const records = snap.docs.map((recordDoc) => ({ id: recordDoc.id, ...recordDoc.data() }));
  return records.find((record) => record.status === 'checked_in') || null;
}

function durationMinutesFrom(checkInTime, checkOutTime) {
  if (!checkInTime || !checkOutTime) return null;
  const checkInMs = checkInTime.toMillis ? checkInTime.toMillis() : new Date(checkInTime).getTime();
  const checkOutMs = checkOutTime.toMillis ? checkOutTime.toMillis() : new Date(checkOutTime).getTime();
  return Math.round((checkOutMs - checkInMs) / 60000);
}

export async function checkInMemberFirestore(memberId, memberDoc, meetingId = null) {
  const db = getDb();
  if (!db) throw new Error(SYNC_UNAVAILABLE);

  const member = memberDoc || { memberId: String(memberId) };
  const memberKey = String(member.memberId || member.capid || member.temporaryId || memberId);

  try {
    const meeting = meetingId ? { id: meetingId } : await ensureActiveMeeting();
    const openRecord = await getOpenAttendanceRecord(meeting.id, memberKey);
    if (openRecord) {
      throw new Error("Already checked in for tonight's meeting.");
    }

    const now = Timestamp.now();
    const recordRef = doc(collection(db, 'attendanceRecords'));
    await setDoc(recordRef, {
      meetingId: meeting.id,
      ...memberAttendanceFields(member),
      status: 'checked_in',
      checkInTime: now,
      checkOutTime: null,
      durationMinutes: null,
      checkedInBy: memberKey,
      checkedOutBy: null,
      forceAction: false,
      notes: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await appendActivityLog(db, {
      meetingId: meeting.id,
      type: 'member_checked_in',
      actorMemberId: memberKey,
      actorCapid: member.capid || member.temporaryId || memberKey,
      actorName: member.displayName || member.fullName,
      targetMemberId: memberKey,
      targetCapid: member.capid || member.temporaryId || memberKey,
      targetName: member.displayName || member.fullName,
    });

    return { success: true, recordId: recordRef.id, checkInTime: now.toDate().toISOString() };
  } catch (err) {
    if (err.message?.includes('Already checked in')) throw err;
    throw normalizeFirestoreError(err);
  }
}

export async function checkOutMemberFirestore(memberId, meetingId = null) {
  const db = getDb();
  if (!db) throw new Error(SYNC_UNAVAILABLE);

  const memberKey = String(memberId);

  try {
    const meeting = meetingId ? { id: meetingId } : await ensureActiveMeeting();
    const openRecord = await getOpenAttendanceRecord(meeting.id, memberKey);
    if (!openRecord) {
      throw new Error("No active check-in found for tonight's meeting.");
    }

    const now = Timestamp.now();
    const durationMinutes = durationMinutesFrom(openRecord.checkInTime, now);

    await updateDoc(doc(db, 'attendanceRecords', openRecord.id), {
      status: 'checked_out',
      checkOutTime: now,
      durationMinutes,
      checkedOutBy: memberKey,
      updatedAt: serverTimestamp(),
    });

    await appendActivityLog(db, {
      meetingId: meeting.id,
      type: 'member_checked_out',
      targetMemberId: memberKey,
      targetCapid: openRecord.capid || openRecord.temporaryId || memberKey,
      targetName: openRecord.memberName,
    });

    return { success: true, recordId: openRecord.id, checkOutTime: now.toDate().toISOString() };
  } catch (err) {
    if (err.message?.includes('No active check-in')) throw err;
    throw normalizeFirestoreError(err);
  }
}

export async function forceCheckInFirestore(actorCapid, targetMemberDoc, notes = null, meetingId = null) {
  const db = getDb();
  if (!db) throw new Error(SYNC_UNAVAILABLE);

  const target = targetMemberDoc;
  const targetId = String(target.memberId || target.capid || target.temporaryId);
  const actorId = String(actorCapid);

  try {
    const meeting = meetingId ? { id: meetingId } : await ensureActiveMeeting();
    const openRecord = await getOpenAttendanceRecord(meeting.id, targetId);
    if (openRecord) {
      throw new Error('Member is already checked in.');
    }

    const now = Timestamp.now();
    const recordRef = doc(collection(db, 'attendanceRecords'));
    await setDoc(recordRef, {
      meetingId: meeting.id,
      ...memberAttendanceFields(target),
      status: 'checked_in',
      checkInTime: now,
      checkOutTime: null,
      durationMinutes: null,
      checkedInBy: actorId,
      checkedOutBy: null,
      forceAction: true,
      forceActionBy: actorId,
      forceType: 'admin',
      notes: notes || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await appendActivityLog(db, {
      meetingId: meeting.id,
      type: 'force_check_in',
      actorMemberId: actorId,
      actorCapid: actorId,
      targetMemberId: targetId,
      targetCapid: target.capid || target.temporaryId || targetId,
      targetName: target.displayName || target.fullName,
      details: { notes: notes || null },
    });

    return { success: true, checkInTime: now.toDate().toISOString() };
  } catch (err) {
    if (err.message?.includes('already checked in')) throw err;
    throw normalizeFirestoreError(err);
  }
}

export async function forceCheckOutFirestore(
  actorCapid,
  targetMemberId,
  notes = null,
  meetingId = null,
  targetName = null
) {
  const db = getDb();
  if (!db) throw new Error(SYNC_UNAVAILABLE);

  const targetId = String(targetMemberId);
  const actorId = String(actorCapid);

  try {
    const meeting = meetingId ? { id: meetingId } : await ensureActiveMeeting();
    const openRecord = await getOpenAttendanceRecord(meeting.id, targetId);
    if (!openRecord) {
      throw new Error('Member is not currently checked in.');
    }

    const now = Timestamp.now();
    const durationMinutes = durationMinutesFrom(openRecord.checkInTime, now);

    await updateDoc(doc(db, 'attendanceRecords', openRecord.id), {
      status: 'checked_out',
      checkOutTime: now,
      durationMinutes,
      checkedOutBy: actorId,
      forceAction: true,
      forceActionBy: actorId,
      forceType: 'admin',
      notes: notes || null,
      updatedAt: serverTimestamp(),
    });

    await appendActivityLog(db, {
      meetingId: meeting.id,
      type: 'force_check_out',
      actorMemberId: actorId,
      actorCapid: actorId,
      targetMemberId: targetId,
      targetCapid: openRecord.capid || openRecord.temporaryId || targetId,
      targetName: targetName || openRecord.memberName,
      details: { notes: notes || null },
    });

    return { success: true, checkOutTime: now.toDate().toISOString() };
  } catch (err) {
    if (err.message?.includes('not currently checked in')) throw err;
    throw normalizeFirestoreError(err);
  }
}

/**
 * Global "force everyone out" is now performed ONLY by the trusted server-side
 * GitHub Actions job (scripts/system-force-checkout.js) at 9:30 PM Eastern, with
 * atomic idempotency. The kiosk browser must never be able to check everyone out
 * based on the device clock, so the old client-side systemForceCheckoutFirestore()
 * has been removed. Admins can still force-check-out an individual via
 * forceCheckOutFirestore().
 */

export function subscribeAttendanceRecords(meetingId, callback, onError) {
  const db = getDb();
  if (!db || !meetingId) return () => {};

  const q = query(
    collection(db, 'attendanceRecords'),
    where('meetingId', '==', meetingId)
  );

  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map(mapAttendanceRecord));
    },
    () => {
      if (onError) onError();
      else callback([]);
    }
  );
}

/** Spark kiosk alias. */
export function subscribeToAttendanceRecords(meetingId, callback, onError) {
  return subscribeAttendanceRecords(meetingId, callback, onError);
}

export function subscribeActivityLog(meetingId, callback, maxItems = 50, onError) {
  const db = getDb();
  if (!db) return () => {};

  const q = query(
    collection(db, 'activityLog'),
    orderBy('timestamp', 'desc'),
    limit(maxItems)
  );

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .filter((d) => !meetingId || d.data().meetingId === meetingId)
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            type: mapActivityType(data.activityType || data.type),
            message: buildActivityMessage(data),
            timestamp: timestampToIso(data.timestamp),
            rawType: data.activityType || data.type,
          };
        });
      callback(items);
    },
    () => {
      if (onError) onError();
      else callback([]);
    }
  );
}

function mapActivityType(type) {
  const map = {
    member_checked_in: 'check-in',
    member_checked_out: 'check-out',
    guest_checked_in: 'guest-in',
    guest_checked_out: 'guest-out',
    force_check_in: 'force-in',
    force_check_out: 'force-out',
    pin_created: 'check-in',
    pin_reset: 'force-in',
    report_exported: 'check-in',
    meeting_started: 'check-in',
    meeting_closed: 'check-out',
    pending_member_created: 'check-in',
    capid_added: 'check-in',
    member_deactivated: 'force-out',
    member_reactivated: 'check-in',
  };
  return map[type] || 'check-in';
}

function buildActivityMessage(data) {
  const type = data.activityType || data.type;
  const target = data.targetName || data.guestName || data.details?.guestName;
  const actor = data.actorName;
  switch (type) {
    case 'member_checked_in':
      return `${target} checked in`;
    case 'member_checked_out':
      return `${target} checked out`;
    case 'guest_checked_in':
      return `${target} (Guest) checked in`;
    case 'guest_checked_out':
      return `${target} (Guest) checked out`;
    case 'force_check_in':
      return `${target} force checked in by ${actor}`;
    case 'force_check_out':
      return `${target} force checked out by ${actor}`;
    case 'pin_created':
      return `${target} created their PIN`;
    case 'pin_reset':
      return `${target}'s PIN was reset by ${actor}`;
    case 'report_exported':
      return `${actor} exported ${data.details?.format || 'report'}`;
    case 'meeting_started':
      return `Meeting started by ${actor}`;
    case 'meeting_closed':
      return `Meeting closed by ${actor}`;
    case 'pending_member_created':
      return `Pending member ${target} created by ${actor}`;
    case 'capid_added':
      return `CAPID assigned to ${target} by ${actor}`;
    case 'member_deactivated':
      return `${target} deactivated by ${actor}`;
    case 'member_reactivated':
      return `${target} reactivated by ${actor}`;
    default:
      return data.details?.message || 'Activity recorded';
  }
}

export function mergeMembersWithAttendance(members, attendanceRecords) {
  const byKey = new Map();
  for (const record of attendanceRecords) {
    const key = String(record.memberId || record.capid);
    const existing = byKey.get(key);
    if (!existing || record.status === 'checked_in') {
      byKey.set(key, record);
    }
  }

  return members.map((member) => {
    const key = String(member.memberId || member.capid || member.temporaryId);
    const record = byKey.get(key);
    return toUiMember(member, record);
  });
}

export async function verifyPinAndCheckIn(capid, pin) {
  const fn = callFunction('verifyPinAndCheckIn');
  const result = await fn({ capid: String(capid), pin });
  return result.data;
}

export async function verifyPinAndCheckOut(capid) {
  const fn = callFunction('verifyPinAndCheckOut');
  const result = await fn({ capid: String(capid) });
  return result.data;
}

export async function forceCheckIn(actorCapid, actorPin, targetCapid, notes) {
  const fn = callFunction('forceCheckIn');
  const result = await fn({
    actorCapid: String(actorCapid),
    actorPin,
    targetCapid: String(targetCapid),
    notes,
  });
  return result.data;
}

export async function forceCheckOut(actorCapid, actorPin, targetCapid, notes) {
  const fn = callFunction('forceCheckOut');
  const result = await fn({
    actorCapid: String(actorCapid),
    actorPin,
    targetCapid: String(targetCapid),
    notes,
  });
  return result.data;
}

export async function startMeeting(actorCapid, actorPin, meetingTitle) {
  const fn = callFunction('startMeeting');
  const result = await fn({
    actorCapid: String(actorCapid),
    actorPin,
    meetingTitle: meetingTitle || null,
  });
  return result.data;
}

export async function closeMeeting(actorCapid, actorPin) {
  const fn = callFunction('closeMeeting');
  const result = await fn({ actorCapid: String(actorCapid), actorPin });
  return result.data;
}

function isCheckedIn(status) {
  return status === 'checked_in' || status === 'checked-in';
}

function isCheckedOut(status) {
  return status === 'checked_out' || status === 'checked-out';
}

export function getStats(members, guests) {
  const checkedIn = members.filter((m) => isCheckedIn(m.status)).length;
  const checkedOut = members.filter((m) => isCheckedOut(m.status)).length;
  const guestsPresent = guests.filter((g) => isCheckedIn(g.status)).length;
  const totalPresent = checkedIn + guestsPresent;
  const totalMembers = members.length;
  return { checkedIn, checkedOut, guestsPresent, totalPresent, totalMembers };
}
