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

export function formatCapidDisplay(memberDoc) {
  if (memberDoc.isProspective || !memberDoc.capid) {
    return 'Pending CAPID';
  }
  return String(memberDoc.capid);
}

export function toUiMember(memberDoc, attendanceRecord = null) {
  const status = normalizeStatus(attendanceRecord?.status);
  const memberId = memberDoc.memberId || memberDoc.capid || memberDoc.temporaryId;
  return {
    id: memberId,
    memberId,
    capid: formatCapidDisplay(memberDoc),
    capidRaw: memberDoc.capid || memberDoc.temporaryId || memberId,
    name: memberDoc.displayName || memberDoc.fullName,
    grade: memberDoc.grade,
    role: memberDoc.role,
    isProspective: !!memberDoc.isProspective,
    hasPin: !!memberDoc.hasPin,
    pinResetRequired: !!memberDoc.pinResetRequired,
    canResetPins: !!memberDoc.canResetPins || !!memberDoc.isAdmin,
    canExportReports: !!memberDoc.canExportReports || !!memberDoc.isAdmin,
    canForceAttendance: !!memberDoc.canForceAttendance || !!memberDoc.isAdmin,
    canManageMembers: !!memberDoc.canManageMembers || !!memberDoc.isAdmin,
    canManageGuests: !!memberDoc.canManageGuests || !!memberDoc.isAdmin,
    isAdmin: !!memberDoc.isAdmin,
    isSeniorMember: !!memberDoc.isSeniorMember,
    isCadet: !!memberDoc.isCadet,
    status,
    checkInTime: attendanceRecord?.checkInTime || null,
    checkOutTime: attendanceRecord?.checkOutTime || null,
    forceAction: !!attendanceRecord?.forceAction,
    forceType: attendanceRecord?.forceType || null,
    forceNote: attendanceRecord?.notes || null,
    checkedOutBy: attendanceRecord?.checkedOutBy || null,
    attendanceRecordId: attendanceRecord?.id || null,
  };
}

export function subscribeMembers(callback) {
  const db = getDb();
  if (!db) return () => {};

  return onSnapshot(collection(db, 'members'), (snap) => {
    const members = snap.docs
      .map((d) => ({ memberId: d.id, ...d.data() }))
      .filter((m) => m.active !== false);
    callback(members);
  });
}

export function searchMembers(members, queryText) {
  if (!queryText?.trim()) return members.map((m) => toUiMember(m));
  const q = queryText.toLowerCase().trim();
  return members
    .filter((m) => {
      const name = (m.displayName || m.fullName || m.normalizedName || '').toLowerCase();
      const capid = String(m.capid || m.temporaryId || m.memberId || '');
      const grade = (m.grade || '').toLowerCase();
      return name.includes(q) || capid.includes(q) || grade.includes(q);
    })
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

export async function createPendingMember({ actorCapid, actorPin, fullName, grade, role }) {
  const fn = callFunction('createPendingMember');
  const result = await fn({
    actorCapid: String(actorCapid),
    actorPin,
    fullName,
    grade,
    role,
  });
  return result.data;
}

export async function updatePendingMemberCapid({ actorCapid, actorPin, memberId, newCapid }) {
  const fn = callFunction('updatePendingMemberCapid');
  const result = await fn({
    actorCapid: String(actorCapid),
    actorPin,
    memberId: String(memberId),
    newCapid: String(newCapid),
  });
  return result.data;
}

export async function deactivateMember({ actorCapid, actorPin, targetMemberId, reason }) {
  const fn = callFunction('deactivateMember');
  const result = await fn({
    actorCapid: String(actorCapid),
    actorPin,
    targetMemberId: String(targetMemberId),
    reason,
  });
  return result.data;
}

export async function reactivateMember({ actorCapid, actorPin, targetMemberId }) {
  const fn = callFunction('reactivateMember');
  const result = await fn({
    actorCapid: String(actorCapid),
    actorPin,
    targetMemberId: String(targetMemberId),
  });
  return result.data;
}

export async function fetchSeniorMembers() {
  const db = getDb();
  if (!db) return [];
  const q = query(collection(db, 'members'), where('isSeniorMember', '==', true));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ memberId: d.id, ...d.data() }));
}

export function subscribeSettings(callback) {
  const db = getDb();
  if (!db) return () => {};

  return onSnapshot(doc(db, 'settings', 'squadron'), (snap) => {
    callback(snap.exists() ? snap.data() : null);
  }, () => callback(null));
}
