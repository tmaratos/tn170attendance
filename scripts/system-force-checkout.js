/**
 * Server-side system force checkout — run from GitHub Actions or locally.
 *
 * Force-checks-out all open member and guest attendance records for tonight's
 * meeting at settings.meetingEnd (default 21:30 / 9:30 PM local).
 *
 * Required env:
 *   FIREBASE_PROJECT_ID (default: tn170-attendance)
 *   FIREBASE_SERVICE_ACCOUNT_JSON — full service account JSON string
 *
 * Optional:
 *   SCHEDULE_TIMEZONE (default America/New_York)
 *   MEETING_DAY (default Tuesday — overridden by Firestore settings when present)
 *   FORCE_HOUR (default derived from settings.meetingEnd, typically 21)
 *   FORCE_RUN=true — skip schedule gate (manual test)
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';

const DEFAULT_PROJECT_ID = 'tn170-attendance';
const DEFAULT_MEETING_END = '21:30';

function env(name, fallback = '') {
  return process.env[name]?.trim() || fallback;
}

function meetingDateInTimezone(timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

function localTimeParts(timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
}

function parseMeetingEnd(meetingEnd) {
  const [hourRaw, minuteRaw] = String(meetingEnd || DEFAULT_MEETING_END).split(':');
  return {
    hour: Number(hourRaw),
    minute: Number(minuteRaw || 0),
  };
}

function systemForceNote(timeZone) {
  const time = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  });
  return `System force logout at ${time} local time.`;
}

function durationMinutesFrom(checkInTime, checkOutTime) {
  if (!checkInTime || !checkOutTime) return null;
  const checkInMs = checkInTime.toMillis ? checkInTime.toMillis() : new Date(checkInTime).getTime();
  const checkOutMs = checkOutTime.toMillis ? checkOutTime.toMillis() : new Date(checkOutTime).getTime();
  return Math.round((checkOutMs - checkInMs) / 60000);
}

function initFirebaseAdmin() {
  const projectId = env('FIREBASE_PROJECT_ID', DEFAULT_PROJECT_ID);
  const json = env('FIREBASE_SERVICE_ACCOUNT_JSON');
  const keyPath = env('GOOGLE_APPLICATION_CREDENTIALS');

  if (json) {
    initializeApp({
      credential: cert(JSON.parse(json)),
      projectId,
    });
    return;
  }

  if (keyPath && existsSync(keyPath)) {
    initializeApp({
      credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))),
      projectId,
    });
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

async function fetchSettings(db) {
  const snap = await db.collection('settings').doc('squadron').get();
  if (!snap.exists) {
    return {
      meetingDay: env('MEETING_DAY', 'Tuesday'),
      meetingEnd: DEFAULT_MEETING_END,
    };
  }
  const data = snap.data();
  return {
    meetingDay: data.meetingDay || env('MEETING_DAY', 'Tuesday'),
    meetingEnd: data.meetingEnd || DEFAULT_MEETING_END,
  };
}

function shouldRunNow({ meetingDay, meetingEnd }) {
  if (env('FORCE_RUN') === 'true') return true;

  const timeZone = env('SCHEDULE_TIMEZONE', 'America/New_York');
  const parts = localTimeParts(timeZone);
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);

  const { hour: endHour, minute: endMinute } = parseMeetingEnd(meetingEnd);
  const forceHour = Number(env('FORCE_HOUR', String(endHour)));

  if (weekday !== meetingDay) return false;
  if (hour > forceHour) return true;
  if (hour === forceHour && minute >= endMinute) return true;
  return false;
}

async function fetchMeetingBundle(db, meetingDate) {
  const meetingsSnap = await db
    .collection('meetings')
    .where('meetingDate', '==', meetingDate)
    .limit(1)
    .get();

  if (meetingsSnap.empty) {
    return { meeting: null, attendanceRecords: [], guestRecords: [] };
  }

  const meetingDoc = meetingsSnap.docs[0];
  const meeting = { id: meetingDoc.id, ...meetingDoc.data() };

  const [attendanceSnap, guestSnap] = await Promise.all([
    db.collection('attendanceRecords').where('meetingId', '==', meeting.id).get(),
    db.collection('guestAttendanceRecords').where('meetingId', '==', meeting.id).get(),
  ]);

  return {
    meeting,
    attendanceRecords: attendanceSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    guestRecords: guestSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  };
}

async function appendActivityLog(db, payload) {
  await db.collection('activityLog').add({
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
    timestamp: FieldValue.serverTimestamp(),
  });
}

async function runForceCheckout(db, { meeting, attendanceRecords, guestRecords, meetingDate, note }) {
  if (meeting?.systemForceCompletedDate === meetingDate) {
    console.log(`System force checkout already completed for ${meetingDate}.`);
    return { members: 0, guests: 0, skipped: true };
  }

  const openMembers = attendanceRecords.filter((record) => record.status === 'checked_in');
  const openGuests = guestRecords.filter((record) => record.status === 'checked_in');

  if (!openMembers.length && !openGuests.length) {
    if (meeting?.id) {
      await db.collection('meetings').doc(meeting.id).update({
        systemForceCompletedDate: meetingDate,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    console.log('No open attendance records — marked meeting complete.');
    return { members: 0, guests: 0, skipped: false };
  }

  const now = Timestamp.now();

  await Promise.all(
    openMembers.map(async (record) => {
      const durationMinutes = durationMinutesFrom(record.checkInTime, now);
      await db.collection('attendanceRecords').doc(record.id).update({
        status: 'checked_out',
        checkOutTime: now,
        durationMinutes,
        checkedOutBy: 'system',
        forceAction: true,
        forceActionBy: 'system',
        forceType: 'system',
        notes: note,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await appendActivityLog(db, {
        meetingId: meeting.id,
        type: 'force_check_out',
        targetMemberId: record.memberId,
        targetCapid: record.capid || record.temporaryId || record.memberId,
        targetName: record.memberName,
        details: { notes: note, forceType: 'system', source: 'github-actions' },
      });
    })
  );

  await Promise.all(
    openGuests.map(async (record) => {
      const durationMinutes = durationMinutesFrom(record.checkInTime, now);
      await db.collection('guestAttendanceRecords').doc(record.id).update({
        status: 'checked_out',
        checkOutTime: now,
        durationMinutes,
        checkedOutBy: 'system',
        forceAction: true,
        forceType: 'system',
        notes: note,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await appendActivityLog(db, {
        meetingId: meeting.id,
        type: 'guest_checked_out',
        guestId: record.guestId,
        guestName: record.name || record.guestName,
        details: { notes: note, forceType: 'system', source: 'github-actions' },
      });
    })
  );

  if (meeting?.id) {
    await db.collection('meetings').doc(meeting.id).update({
      systemForceCompletedDate: meetingDate,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  return { members: openMembers.length, guests: openGuests.length, skipped: false };
}

async function main() {
  initFirebaseAdmin();
  const db = getFirestore();

  const settings = await fetchSettings(db);
  if (!shouldRunNow(settings)) {
    console.log('Skipping — outside configured force-checkout window.');
    console.log(`Expected: ${settings.meetingDay} at or after ${settings.meetingEnd} (${env('SCHEDULE_TIMEZONE', 'America/New_York')}).`);
    console.log('Set FORCE_RUN=true to run immediately (manual test).');
    return;
  }

  const timeZone = env('SCHEDULE_TIMEZONE', 'America/New_York');
  const meetingDate = meetingDateInTimezone(timeZone);
  const note = systemForceNote(timeZone);

  const { meeting, attendanceRecords, guestRecords } = await fetchMeetingBundle(db, meetingDate);

  if (!meeting) {
    console.log(`No meeting document for ${meetingDate} — nothing to force checkout.`);
    return;
  }

  const result = await runForceCheckout(db, {
    meeting,
    attendanceRecords,
    guestRecords,
    meetingDate,
    note,
  });

  if (result.skipped) return;

  console.log(
    `System force checkout complete for ${meetingDate}: ${result.members} member(s), ${result.guests} guest(s).`
  );
}

main().catch((err) => {
  console.error('System force checkout failed:', err.message);
  process.exit(1);
});
