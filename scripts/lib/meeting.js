/**
 * Deterministic meeting resolution + attendance fetch, shared by automation scripts.
 *
 * Meetings use a deterministic document ID equal to the Eastern meeting date
 * (YYYY-MM-DD) so every device and every server run resolves the SAME meeting doc.
 * Legacy meetings created with random IDs are still found via a meetingDate query
 * fallback, so this is safe to deploy without a data migration.
 */
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Resolve the meeting for an Eastern meetingDate.
 * Prefers the deterministic doc id; falls back to a meetingDate query for legacy docs.
 * Returns { meeting, attendanceRecords, guestRecords, duplicateCount }.
 */
export async function fetchMeetingBundle(db, meetingDate) {
  let meeting = null;
  let duplicateCount = 0;

  const byId = await db.collection('meetings').doc(meetingDate).get();
  if (byId.exists) {
    meeting = { id: byId.id, ...byId.data() };
  } else {
    const snap = await db
      .collection('meetings')
      .where('meetingDate', '==', meetingDate)
      .get();
    duplicateCount = snap.size;
    if (!snap.empty) {
      // Deterministic pick among any legacy duplicates: lowest doc id.
      const docs = [...snap.docs].sort((a, b) => a.id.localeCompare(b.id));
      const chosen = docs[0];
      meeting = { id: chosen.id, ...chosen.data() };
    }
  }

  if (!meeting) {
    return { meeting: null, attendanceRecords: [], guestRecords: [], duplicateCount };
  }

  const [attendanceSnap, guestSnap] = await Promise.all([
    db.collection('attendanceRecords').where('meetingId', '==', meeting.id).get(),
    db.collection('guestAttendanceRecords').where('meetingId', '==', meeting.id).get(),
  ]);

  return {
    meeting,
    attendanceRecords: attendanceSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    guestRecords: guestSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    duplicateCount,
  };
}

/**
 * Atomically claim an automation step for a meeting date via a marker document.
 * Uses a transaction so two concurrent/late workflow runs cannot both proceed.
 *
 * markerCollection e.g. 'automationRuns'; markerId e.g. `force-${meetingDate}`.
 * Returns { claimed: boolean, existing: object|null }.
 *   claimed=true  → this run won the claim; caller should do the work.
 *   claimed=false → already completed by a prior run; caller should skip.
 */
export async function claimAutomationStep(db, markerCollection, markerId, payload = {}) {
  const ref = db.collection(markerCollection).doc(markerId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().status === 'completed') {
      return { claimed: false, existing: snap.data() };
    }
    tx.set(
      ref,
      {
        ...payload,
        status: 'in_progress',
        claimedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { claimed: true, existing: snap.exists ? snap.data() : null };
  });
}

/** Mark a previously-claimed automation step as completed with an audit record. */
export async function completeAutomationStep(db, markerCollection, markerId, audit = {}) {
  await db.collection(markerCollection).doc(markerId).set(
    {
      ...audit,
      status: 'completed',
      completedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/** Record a failure on the marker so a later manual retry is idempotent-aware. */
export async function failAutomationStep(db, markerCollection, markerId, audit = {}) {
  await db.collection(markerCollection).doc(markerId).set(
    {
      ...audit,
      status: 'failed',
      failedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
