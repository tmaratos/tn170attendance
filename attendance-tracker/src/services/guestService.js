import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDb, callFunction } from './firebase';
import { verifyMemberPinInFirestore } from './kioskPin';
import { ensureActiveMeeting, SYNC_UNAVAILABLE } from './attendanceService';

function todayDateString() {
  return new Date().toISOString().split('T')[0];
}

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeFirestoreError(err) {
  if (err?.code === 'permission-denied') return new Error(SYNC_UNAVAILABLE);
  return err instanceof Error ? err : new Error(err?.message || SYNC_UNAVAILABLE);
}

async function appendGuestActivity(db, payload) {
  await addDoc(collection(db, 'activityLog'), {
    meetingId: payload.meetingId || null,
    activityType: payload.type,
    type: payload.type,
    actorMemberId: payload.actorMemberId || null,
    actorCapid: payload.actorCapid || null,
    actorName: payload.actorName || null,
    guestId: payload.guestId || null,
    guestName: payload.guestName || null,
    details: payload.details || null,
    timestamp: serverTimestamp(),
  });
}

function durationMinutesFrom(checkInTime, checkOutTime) {
  if (!checkInTime || !checkOutTime) return null;
  const checkInMs = checkInTime.toMillis ? checkInTime.toMillis() : new Date(checkInTime).getTime();
  const checkOutMs = checkOutTime.toMillis ? checkOutTime.toMillis() : new Date(checkOutTime).getTime();
  return Math.round((checkOutMs - checkInMs) / 60000);
}

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
    forceAction: !!data.forceAction,
    forceType: data.forceType || null,
    forceNote: data.forceNote || data.notes || null,
    meetingId: data.meetingId,
  };
}

export function subscribeGuestAttendance(meetingId, callback, onError) {
  const db = getDb();
  if (!db || !meetingId) return () => {};

  const q = query(
    collection(db, 'guestAttendanceRecords'),
    where('meetingId', '==', meetingId)
  );

  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map(mapGuestAttendance));
    },
    () => {
      if (onError) onError();
      else callback([]);
    }
  );
}

/** Spark kiosk alias for guest presence at a meeting. */
export function subscribeToGuestAttendanceRecords(meetingId, callback) {
  return subscribeGuestAttendance(meetingId, callback);
}

export function subscribeToGuestsPresent(meetingId, callback) {
  return subscribeGuestAttendance(meetingId, (records) => {
    callback(records.filter((record) => record.status === 'checked_in'));
  });
}

export function subscribeRecurringGuests(callback, onError) {
  const db = getDb();
  if (!db) return () => {};

  const q = query(collection(db, 'guests'), where('active', '==', true));

  return onSnapshot(
    q,
    (snap) => {
      const guests = snap.docs
        .map((d) => {
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
        })
        .sort((a, b) => (b.lastVisit || '').localeCompare(a.lastVisit || ''));
      callback(guests);
    },
    () => {
      if (onError) onError();
      else callback([]);
    }
  );
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

export async function guestCheckOut(guestAttendanceId) {
  const fn = callFunction('guestCheckOut');
  const result = await fn({ guestAttendanceId });
  return result.data;
}

export async function guestCheckInFirestore({
  hostCapid,
  hostPin,
  guestName,
  guestId = null,
  hostMemberDoc = null,
  meetingId = null,
}) {
  const db = getDb();
  if (!db) throw new Error(SYNC_UNAVAILABLE);

  if (!guestName?.trim()) {
    throw new Error('Guest name is required.');
  }

  const hostId = String(hostCapid);
  const hostValid = await verifyMemberPinInFirestore(hostId, hostPin);
  if (!hostValid) {
    throw new Error('Incorrect host PIN.');
  }

  const host = hostMemberDoc || {};
  const hostName = host.displayName || host.fullName || host.name || hostId;

  try {
    const meeting = meetingId ? { id: meetingId } : await ensureActiveMeeting();
    const trimmedName = guestName.trim();
    const normalized = normalizeName(trimmedName);
    const today = todayDateString();
    const now = Timestamp.now();

    let guestDoc = null;
    if (guestId) {
      const guestSnap = await getDoc(doc(db, 'guests', guestId));
      if (guestSnap.exists()) {
        guestDoc = { id: guestSnap.id, ...guestSnap.data() };
      }
    }

    if (!guestDoc) {
      const existing = await getDocs(
        query(collection(db, 'guests'), where('normalizedName', '==', normalized), limit(1))
      );
      if (!existing.empty) {
        guestDoc = { id: existing.docs[0].id, ...existing.docs[0].data() };
      }
    }

    let guestRef;
    if (guestDoc) {
      guestRef = doc(db, 'guests', guestDoc.id);
      await updateDoc(guestRef, {
        fullName: trimmedName,
        normalizedName: normalized,
        lastVisitDate: today,
        totalVisits: (guestDoc.totalVisits || 0) + 1,
        active: true,
        hostCapid: hostId,
        hostName,
        updatedAt: serverTimestamp(),
      });
    } else {
      guestRef = doc(collection(db, 'guests'));
      await setDoc(guestRef, {
        guestId: guestRef.id,
        fullName: trimmedName,
        normalizedName: normalized,
        hostCapid: hostId,
        hostName,
        firstVisitDate: today,
        lastVisitDate: today,
        totalVisits: 1,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const attendanceRef = doc(collection(db, 'guestAttendanceRecords'));
    await setDoc(attendanceRef, {
      meetingId: meeting.id,
      guestId: guestRef.id,
      guestName: trimmedName,
      hostMemberId: hostId,
      hostCapid: hostId,
      hostName,
      status: 'checked_in',
      checkInTime: now,
      checkOutTime: null,
      durationMinutes: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await appendGuestActivity(db, {
      meetingId: meeting.id,
      type: 'guest_checked_in',
      actorMemberId: hostId,
      actorCapid: hostId,
      actorName: hostName,
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
  } catch (err) {
    if (err.message?.includes('Incorrect host PIN') || err.message?.includes('Guest name')) {
      throw err;
    }
    throw normalizeFirestoreError(err);
  }
}

export async function guestCheckOutFirestore(guestAttendanceId) {
  const db = getDb();
  if (!db) throw new Error(SYNC_UNAVAILABLE);

  try {
    const recordRef = doc(db, 'guestAttendanceRecords', guestAttendanceId);
    const recordSnap = await getDoc(recordRef);

    if (!recordSnap.exists()) {
      throw new Error('Guest attendance record not found.');
    }

    const record = recordSnap.data();
    if (record.status === 'checked_out') {
      throw new Error('Guest is already checked out.');
    }

    const now = Timestamp.now();
    const durationMinutes = durationMinutesFrom(record.checkInTime, now);

    await updateDoc(recordRef, {
      status: 'checked_out',
      checkOutTime: now,
      durationMinutes,
      checkedOutBy: 'kiosk',
      updatedAt: serverTimestamp(),
    });

    await appendGuestActivity(db, {
      meetingId: record.meetingId,
      type: 'guest_checked_out',
      guestId: record.guestId,
      guestName: record.guestName,
    });

    return { success: true, checkOutTime: now.toDate().toISOString() };
  } catch (err) {
    if (
      err.message?.includes('not found') ||
      err.message?.includes('already checked out')
    ) {
      throw err;
    }
    throw normalizeFirestoreError(err);
  }
}
