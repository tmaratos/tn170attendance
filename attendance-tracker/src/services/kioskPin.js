/**
 * Spark kiosk PIN hashing and Firestore storage.
 *
 * Security note (Spark / free tier): PIN hashes live in Firestore and are verified
 * client-side. Plaintext PINs are never stored. Server-side bcrypt (Cloud Functions)
 * is preferred when Blaze billing is available.
 */
import {
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { getDb } from './firebase';
import { ADMIN_CAPIDS } from '../data/rosterData';

const KIOSK_PIN_SALT = 'tn170-kiosk-v1';

function validatePinInput(pin, confirmPin) {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('PIN must be exactly 4 digits.');
  }
  if (pin !== confirmPin) {
    throw new Error('PIN confirmation does not match.');
  }
}

export function hashKioskPinSync(pin, memberId) {
  const input = `${memberId}:${pin}:${KIOSK_PIN_SALT}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** SHA-256 with member-scoped salt (preferred for Firestore memberPins). */
export async function hashKioskPin(pin, memberId) {
  if (!crypto?.subtle?.digest) {
    return hashKioskPinSync(pin, memberId);
  }
  const data = new TextEncoder().encode(`${memberId}:${pin}:${KIOSK_PIN_SALT}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}

export async function verifyKioskPin(pin, memberId, storedHash) {
  if (!storedHash || !/^\d{4}$/.test(pin)) return false;
  if (storedHash.startsWith('sha256:')) {
    const computed = await hashKioskPin(pin, memberId);
    return computed === storedHash;
  }
  if (storedHash.startsWith('fnv1a:')) {
    return hashKioskPinSync(pin, memberId) === storedHash;
  }
  return hashKioskPinSync(pin, memberId) === storedHash;
}

export async function fetchMemberPinDoc(memberId) {
  const db = getDb();
  if (!db) return null;
  const snap = await getDoc(doc(db, 'memberPins', String(memberId)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Live map of memberId -> pinHash for kiosk hasPin derivation. */
export function subscribeMemberPins(callback) {
  const db = getDb();
  if (!db) return () => {};

  return onSnapshot(collection(db, 'memberPins'), (snap) => {
    const pins = {};
    snap.docs.forEach((pinDoc) => {
      const pinHash = pinDoc.data().pinHash;
      if (pinHash) pins[pinDoc.id] = pinHash;
    });
    callback(pins);
  });
}

export async function createMemberPinInFirestore(memberId, pin, confirmPin) {
  validatePinInput(pin, confirmPin);
  const db = getDb();
  if (!db) throw new Error('Firebase is not configured.');

  const id = String(memberId);
  const memberSnap = await getDoc(doc(db, 'members', id));
  if (!memberSnap.exists() || memberSnap.data().active === false) {
    throw new Error('Member not found.');
  }

  const member = memberSnap.data();
  const pinRef = doc(db, 'memberPins', id);
  const pinSnap = await getDoc(pinRef);
  const existingData = pinSnap.exists() ? pinSnap.data() : null;

  if (existingData?.pinHash && !member.pinResetRequired) {
    throw new Error('PIN already exists. Enter your PIN to check in.');
  }

  const pinHash = await hashKioskPin(pin, id);
  const now = serverTimestamp();

  if (!pinSnap.exists()) {
    await setDoc(pinRef, {
      pinHash,
      pinCreatedAt: now,
      pinUpdatedAt: now,
    });
  } else {
    await updateDoc(pinRef, {
      pinHash,
      pinUpdatedAt: now,
      ...(existingData?.pinCreatedAt ? {} : { pinCreatedAt: now }),
    });
  }

  await updateDoc(doc(db, 'members', id), {
    hasPin: true,
    pinResetRequired: false,
    updatedAt: now,
  });

  return { success: true, pinHash };
}

export async function verifyMemberPinInFirestore(memberId, pin) {
  const pinDoc = await fetchMemberPinDoc(memberId);
  if (!pinDoc?.pinHash) return false;
  return verifyKioskPin(pin, String(memberId), pinDoc.pinHash);
}

async function requireAdminPin(actorCapid, actorPin) {
  const actorId = String(actorCapid);
  if (!ADMIN_CAPIDS.has(actorId)) {
    throw new Error('Invalid admin credentials.');
  }
  const valid = await verifyMemberPinInFirestore(actorId, actorPin);
  if (!valid) {
    throw new Error('Invalid admin credentials.');
  }
  const memberSnap = await getDoc(doc(getDb(), 'members', actorId));
  const member = memberSnap.exists() ? memberSnap.data() : null;
  if (member && member.canResetPins === false && !member.isAdmin) {
    throw new Error('You do not have permission to reset PINs.');
  }
  return member;
}

export async function resetMemberPinInFirestore(actorCapid, actorPin, targetCapid) {
  await requireAdminPin(actorCapid, actorPin);

  const db = getDb();
  if (!db) throw new Error('Firebase is not configured.');

  const targetId = String(targetCapid);
  const targetSnap = await getDoc(doc(db, 'members', targetId));
  if (!targetSnap.exists() || targetSnap.data().active === false) {
    throw new Error('Member not found.');
  }

  const now = serverTimestamp();
  await updateDoc(doc(db, 'members', targetId), {
    hasPin: false,
    pinResetRequired: true,
    updatedAt: now,
  });

  const pinSnap = await getDoc(doc(db, 'memberPins', targetId));
  if (pinSnap.exists()) {
    await updateDoc(doc(db, 'memberPins', targetId), {
      pinHash: deleteField(),
      pinUpdatedAt: now,
    });
  }

  const target = targetSnap.data();
  return {
    success: true,
    message: `PIN reset for ${target.displayName || target.fullName || targetId}.`,
    targetName: target.displayName || target.fullName,
  };
}
