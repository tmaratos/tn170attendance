import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { getDb, callFunction } from './firebase';

function timestampToIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value.toDate) return value.toDate().toISOString();
  if (value.seconds) return new Date(value.seconds * 1000).toISOString();
  return null;
}

function mapGuestAttendance(docSnap) {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    guestId: data.guestId,
    name: data.guestName,
    hostId: data.hostCapid,
    hostName: data.hostName,
    status: data.status,
    checkInTime: timestampToIso(data.checkInTime),
    checkOutTime: timestampToIso(data.checkOutTime),
    meetingId: data.meetingId,
  };
}

export function subscribeGuestAttendance(meetingId, callback) {
  const db = getDb();
  if (!db || !meetingId) return () => {};

  const q = query(
    collection(db, 'guestAttendanceRecords'),
    where('meetingId', '==', meetingId)
  );

  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(mapGuestAttendance));
  });
}

export function subscribeRecurringGuests(callback) {
  const db = getDb();
  if (!db) return () => {};

  const q = query(collection(db, 'guests'), where('active', '==', true));

  return onSnapshot(q, (snap) => {
    const guests = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        guestId: d.guestId || d.id,
        name: data.fullName,
        hostId: data.hostCapid,
        hostName: data.hostName,
        firstVisit: data.firstVisitDate,
        lastVisit: data.lastVisitDate,
        totalVisits: data.totalVisits || 0,
        status: data.active ? 'active' : 'inactive',
      };
    }).sort((a, b) => (b.lastVisit || '').localeCompare(a.lastVisit || ''));
    callback(guests);
  }, () => {
    callback([]);
  });
}

export function searchRecurringGuests(recurringGuests, queryText) {
  if (!queryText?.trim()) return [];
  const q = queryText.toLowerCase().trim();
  return recurringGuests.filter((g) => g.name.toLowerCase().includes(q));
}

export async function guestCheckIn({ hostCapid, hostPin, guestName, guestId }) {
  const fn = callFunction('guestCheckIn');
  const result = await fn({
    hostCapid: String(hostCapid),
    hostPin,
    guestName,
    guestId: guestId || null,
  });
  return result.data;
}

export async function guestCheckOut(guestAttendanceId, hostCapid, hostPin) {
  const fn = callFunction('guestCheckOut');
  const result = await fn({
    guestAttendanceId,
    hostCapid: hostCapid ? String(hostCapid) : null,
    hostPin: hostPin || null,
  });
  return result.data;
}
