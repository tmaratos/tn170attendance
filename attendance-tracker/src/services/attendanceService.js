import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { getDb, callFunction } from './firebase';
import { toUiMember } from './memberService';

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

export function subscribeTodaysMeeting(callback) {
  const db = getDb();
  if (!db) return () => {};

  const today = new Date().toISOString().split('T')[0];
  const q = query(
    collection(db, 'meetings'),
    where('meetingDate', '==', today),
    limit(1)
  );

  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      callback(null);
      return;
    }
    const doc = snap.docs[0];
    callback({ id: doc.id, ...doc.data() });
  });
}

export function subscribeAttendanceRecords(meetingId, callback) {
  const db = getDb();
  if (!db || !meetingId) return () => {};

  const q = query(
    collection(db, 'attendanceRecords'),
    where('meetingId', '==', meetingId)
  );

  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(mapAttendanceRecord));
  });
}

export function subscribeActivityLog(meetingId, callback, maxItems = 50) {
  const db = getDb();
  if (!db) return () => {};

  const q = query(
    collection(db, 'activityLog'),
    orderBy('timestamp', 'desc'),
    limit(maxItems)
  );

  return onSnapshot(q, (snap) => {
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
  }, () => {
    callback([]);
  });
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
