import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDb, callFunction } from './firebase';
import {
  createMemberPinInFirestore,
  resetMemberPinInFirestore,
  verifyMemberPinInFirestore,
  subscribeMemberPins,
} from './kioskPin';
import {
  buildMemberDocument,
  isValidMemberGrade,
  resolveMemberAdminPermissions,
} from '../data/rosterData';
import { appendActivityLogSpark, ensureActiveMeeting } from './attendanceService';

export { subscribeMemberPins, verifyMemberPinInFirestore };

function validateCapid(capid) {
  const capidStr = String(capid || '').trim();
  if (!/^\d{6,8}$/.test(capidStr)) {
    throw new Error('CAPID must be 6–8 digits.');
  }
  return capidStr;
}

function validateMemberNames(firstName, lastName) {
  const fn = String(firstName || '').trim();
  const ln = String(lastName || '').trim();
  if (!fn || !ln) {
    throw new Error('First and last name are required.');
  }
  return { firstName: fn, lastName: ln };
}

function validateMemberGrade(grade) {
  const gradeStr = String(grade || '').trim();
  if (!gradeStr) {
    throw new Error('Grade/rank is required.');
  }
  if (!isValidMemberGrade(gradeStr)) {
    throw new Error('Select a valid grade/rank from the list.');
  }
  return gradeStr;
}

async function requireManageMembersAuth(actorCapid, actorPin) {
  const db = getDb();
  if (!db) throw new Error('Firebase is not configured.');

  const actorId = String(actorCapid);
  const memberSnap = await getDoc(doc(db, 'members', actorId));
  if (!memberSnap.exists() || memberSnap.data().active === false) {
    throw new Error('Invalid admin credentials.');
  }

  const member = memberSnap.data();
  const perms = resolveMemberAdminPermissions({ ...member, capid: actorId, memberId: actorId });
  if (!perms.canManageMembers) {
    throw new Error('You do not have permission to manage members.');
  }

  const valid = await verifyMemberPinInFirestore(actorId, actorPin);
  if (!valid) {
    throw new Error('Incorrect PIN.');
  }

  return {
    ...member,
    ...perms,
    capid: actorId,
    memberId: actorId,
    displayName: member.displayName || member.fullName,
  };
}

export async function memberCapidExists(capid) {
  const db = getDb();
  if (!db) return false;
  const capidStr = String(capid).trim();
  const snap = await getDoc(doc(db, 'members', capidStr));
  return snap.exists();
}

function memberProfileUpdates({ firstName, middleName, lastName, grade }) {
  const built = buildMemberDocument({ capid: '0', firstName, middleName, lastName, grade });
  return {
    firstName: built.firstName,
    middleName: built.middleName,
    lastName: built.lastName,
    fullName: built.fullName,
    displayName: built.displayName,
    normalizedName: built.normalizedName,
    grade: built.grade,
    role: built.role,
    isCadet: built.isCadet,
    isSeniorMember: built.isSeniorMember,
    isAdmin: built.isAdmin,
    canForceAttendance: built.canForceAttendance,
    canResetPins: built.canResetPins,
    canExportReports: built.canExportReports,
    canManageMembers: built.canManageMembers,
    canManageGuests: built.canManageGuests,
  };
}

/** Spark kiosk: create members/{capid} with seed-shaped roster document. */
export async function createMemberSpark({
  actorCapid,
  actorPin,
  capid,
  firstName,
  middleName,
  lastName,
  grade,
}) {
  const actor = await requireManageMembersAuth(actorCapid, actorPin);
  const capidStr = validateCapid(capid);
  const names = validateMemberNames(firstName, lastName);
  const gradeStr = validateMemberGrade(grade);

  const db = getDb();
  if (!db) throw new Error('Firebase is not configured.');

  const existing = await getDoc(doc(db, 'members', capidStr));
  if (existing.exists()) {
    throw new Error('CAPID already exists on the roster.');
  }

  const memberDoc = buildMemberDocument({
    capid: capidStr,
    firstName: names.firstName,
    middleName,
    lastName: names.lastName,
    grade: gradeStr,
  });
  const now = serverTimestamp();

  await setDoc(doc(db, 'members', capidStr), {
    ...memberDoc,
    createdByCapid: actor.capid,
    createdByName: actor.displayName || actor.fullName,
    createdAt: now,
    updatedAt: now,
  });

  try {
    const activeMeeting = await ensureActiveMeeting();
    await appendActivityLogSpark({
      meetingId: activeMeeting.id,
      type: 'member_created',
      actorCapid: actor.capid,
      actorName: actor.displayName || actor.fullName,
      targetCapid: capidStr,
      targetName: memberDoc.displayName,
    });
  } catch {
    /* activity log is best-effort on Spark */
  }

  return { success: true, capid: capidStr, displayName: memberDoc.displayName };
}

/** Spark kiosk: update roster profile fields on members/{capid}. */
export async function updateMemberSpark({
  actorCapid,
  actorPin,
  capid,
  firstName,
  middleName,
  lastName,
  grade,
}) {
  const actor = await requireManageMembersAuth(actorCapid, actorPin);
  const capidStr = validateCapid(capid);
  validateMemberNames(firstName, lastName);
  validateMemberGrade(grade);

  const db = getDb();
  if (!db) throw new Error('Firebase is not configured.');

  const targetSnap = await getDoc(doc(db, 'members', capidStr));
  if (!targetSnap.exists()) {
    throw new Error('Member not found.');
  }

  const updates = memberProfileUpdates({ firstName, middleName, lastName, grade });
  await updateDoc(doc(db, 'members', capidStr), {
    ...updates,
    updatedAt: serverTimestamp(),
    updatedByCapid: actor.capid,
    updatedByName: actor.displayName || actor.fullName,
  });

  try {
    const activeMeeting = await ensureActiveMeeting();
    await appendActivityLogSpark({
      meetingId: activeMeeting.id,
      type: 'member_updated',
      actorCapid: actor.capid,
      actorName: actor.displayName || actor.fullName,
      targetCapid: capidStr,
      targetName: updates.displayName,
    });
  } catch {
    /* activity log is best-effort on Spark */
  }

  return { success: true, capid: capidStr, displayName: updates.displayName };
}

/** Spark kiosk: set active=false (prefer over delete). */
export async function deactivateMemberSpark({ actorCapid, actorPin, targetMemberId, reason }) {
  const actor = await requireManageMembersAuth(actorCapid, actorPin);
  const db = getDb();
  if (!db) throw new Error('Firebase is not configured.');

  const targetId = String(targetMemberId);
  const targetSnap = await getDoc(doc(db, 'members', targetId));
  if (!targetSnap.exists()) {
    throw new Error('Member not found.');
  }

  const target = targetSnap.data();
  await updateDoc(doc(db, 'members', targetId), {
    active: false,
    deactivatedAt: serverTimestamp(),
    deactivatedByCapid: actor.capid,
    deactivationReason: reason || null,
    updatedAt: serverTimestamp(),
  });

  try {
    const activeMeeting = await ensureActiveMeeting();
    await appendActivityLogSpark({
      meetingId: activeMeeting.id,
      type: 'member_deactivated',
      actorCapid: actor.capid,
      actorName: actor.displayName || actor.fullName,
      targetCapid: target.capid || targetId,
      targetName: target.displayName || target.fullName,
      details: { reason: reason || null },
    });
  } catch {
    /* activity log is best-effort on Spark */
  }

  return { success: true };
}

/** Spark kiosk: reactivate a deactivated member. */
export async function reactivateMemberSpark({ actorCapid, actorPin, targetMemberId }) {
  const actor = await requireManageMembersAuth(actorCapid, actorPin);
  const db = getDb();
  if (!db) throw new Error('Firebase is not configured.');

  const targetId = String(targetMemberId);
  const targetSnap = await getDoc(doc(db, 'members', targetId));
  if (!targetSnap.exists()) {
    throw new Error('Member not found.');
  }

  const target = targetSnap.data();
  await updateDoc(doc(db, 'members', targetId), {
    active: true,
    reactivatedAt: serverTimestamp(),
    reactivatedByCapid: actor.capid,
    updatedAt: serverTimestamp(),
  });

  try {
    const activeMeeting = await ensureActiveMeeting();
    await appendActivityLogSpark({
      meetingId: activeMeeting.id,
      type: 'member_reactivated',
      actorCapid: actor.capid,
      actorName: actor.displayName || actor.fullName,
      targetCapid: target.capid || targetId,
      targetName: target.displayName || target.fullName,
    });
  } catch {
    /* activity log is best-effort on Spark */
  }

  return { success: true };
}

export async function createMember(payload) {
  const fn = callFunction('createMember');
  const result = await fn(payload);
  return result.data;
}

export async function updateMember(payload) {
  const fn = callFunction('updateMember');
  const result = await fn(payload);
  return result.data;
}

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
  const perms = resolveMemberAdminPermissions(memberDoc);
  return {
    id: memberId,
    memberId,
    capid: formatCapidDisplay(memberDoc),
    capidRaw: memberDoc.capid || memberDoc.temporaryId || memberId,
    name: memberDoc.displayName || memberDoc.fullName,
    firstName: memberDoc.firstName || '',
    middleName: memberDoc.middleName || '',
    lastName: memberDoc.lastName || '',
    grade: memberDoc.grade,
    role: memberDoc.role,
    isProspective: !!memberDoc.isProspective,
    hasPin: !!memberDoc.hasPin,
    pinResetRequired: !!memberDoc.pinResetRequired,
    canResetPins: perms.canResetPins,
    canExportReports: perms.canExportReports,
    canForceAttendance: perms.canForceAttendance,
    canManageMembers: perms.canManageMembers,
    canManageGuests: perms.canManageGuests,
    isAdmin: perms.isAdmin,
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

export function subscribeMembers(callback, onError, { includeInactive = false } = {}) {
  const db = getDb();
  if (!db) return () => {};

  return onSnapshot(
    collection(db, 'members'),
    (snap) => {
      const members = snap.docs
        .map((d) => ({ memberId: d.id, ...d.data() }))
        .filter((m) => includeInactive || m.active !== false);
      callback(members);
    },
    () => {
      if (onError) onError();
      else callback([]);
    }
  );
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

/** Spark kiosk: hash client-side and write memberPins/{id}. */
export async function createPinSpark(capid, pin, confirmPin) {
  return createMemberPinInFirestore(capid, pin, confirmPin);
}

/** Spark kiosk: verify against Firestore memberPins hash. */
export async function verifyPinSpark(capid, pin) {
  return verifyMemberPinInFirestore(capid, pin);
}

/** Spark kiosk: admin reset — clears hash and sets pinResetRequired. */
export async function resetMemberPinSpark(actorCapid, actorPin, targetCapid) {
  return resetMemberPinInFirestore(actorCapid, actorPin, targetCapid);
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

export function subscribeSettings(callback, onError) {
  const db = getDb();
  if (!db) return () => {};

  return onSnapshot(
    doc(db, 'settings', 'squadron'),
    (snap) => {
      callback(snap.exists() ? snap.data() : null);
    },
    () => {
      if (onError) onError();
      else callback(null);
    }
  );
}
