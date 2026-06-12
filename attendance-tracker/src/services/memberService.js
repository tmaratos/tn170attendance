import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { getDb, callFunction } from './firebase';

function normalizeStatus(status) {
  if (status === 'checked_in') return 'checked-in';
  if (status === 'checked_out') return 'checked-out';
  return status || 'absent';
}

export function toUiMember(memberDoc, attendanceRecord = null) {
  const status = normalizeStatus(attendanceRecord?.status);
  return {
    id: memberDoc.capid,
    capid: memberDoc.capid,
    name: memberDoc.displayName || memberDoc.fullName,
    grade: memberDoc.grade,
    role: memberDoc.role,
    hasPin: !!memberDoc.hasPin,
    pinResetRequired: !!memberDoc.pinResetRequired,
    canResetPins: !!memberDoc.canResetPins,
    canExportReports: !!memberDoc.canExportReports,
    isSeniorMember: !!memberDoc.isSeniorMember,
    isCadet: !!memberDoc.isCadet,
    status,
    checkInTime: attendanceRecord?.checkInTime || null,
    checkOutTime: attendanceRecord?.checkOutTime || null,
    attendanceRecordId: attendanceRecord?.id || null,
  };
}

export function subscribeMembers(callback) {
  const db = getDb();
  if (!db) return () => {};

  return onSnapshot(collection(db, 'members'), (snap) => {
    const members = snap.docs
      .map((d) => ({ capid: d.id, ...d.data() }))
      .filter((m) => m.active !== false);
    callback(members);
  });
}

export function searchMembers(members, queryText) {
  if (!queryText?.trim()) return members.map((m) => toUiMember(m));
  const q = queryText.toLowerCase().trim();
  return members
    .filter(
      (m) =>
        (m.displayName || m.fullName || '').toLowerCase().includes(q) ||
        String(m.capid).includes(q) ||
        (m.grade || '').toLowerCase().includes(q)
    )
    .map((m) => toUiMember(m));
}

export async function createPin(capid, pin, confirmPin) {
  const fn = callFunction('createPin');
  const result = await fn({ capid: String(capid), pin, confirmPin });
  return result.data;
}

export async function resetMemberPin(actorCapid, actorPin, targetCapid) {
  const fn = callFunction('resetMemberPin');
  const result = await fn({
    actorCapid: String(actorCapid),
    actorPin,
    targetCapid: String(targetCapid),
  });
  return result.data;
}

export async function verifySeniorAccess(capid, pin) {
  const fn = callFunction('verifySeniorAccess');
  const result = await fn({ capid: String(capid), pin });
  return result.data;
}

export async function fetchSeniorMembers() {
  const db = getDb();
  if (!db) return [];
  const q = query(collection(db, 'members'), where('isSeniorMember', '==', true));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ capid: d.id, ...d.data() }));
}
