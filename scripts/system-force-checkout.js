/**
 * Server-side system force checkout — the AUTHORITATIVE Tuesday 9:30 PM checkout.
 *
 * Runs from GitHub Actions (or locally). Force-checks-out every open member and
 * guest attendance record for the correct Eastern meeting date, exactly once,
 * with atomic Firestore idempotency and a persistent audit record. It does NOT
 * depend on any kiosk browser being open, nor on the runner's clock/timezone.
 *
 * Required env:
 *   FIREBASE_SERVICE_ACCOUNT_JSON — full service account JSON string
 * Optional env:
 *   FIREBASE_PROJECT_ID (default tn170-attendance)
 *   SCHEDULE_TIMEZONE (default America/New_York)
 *   MEETING_DAY (default Tuesday; overridden by Firestore settings when present)
 *   DRY_RUN=true            — report what would happen; write nothing
 *   MEETING_DATE=YYYY-MM-DD — process a specific Eastern meeting date
 *   FORCE_RUN=true          — skip the schedule gate (manual test) [alias SKIP_SCHEDULE_GATE]
 *   GITHUB_RUN_ID / GITHUB_EVENT_NAME — captured into the audit record when present
 */
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { initFirebaseAdmin, describeFirebaseCredential, DEFAULT_PROJECT_ID } from './lib/firebaseAdmin.js';
import {
  DEFAULT_TIMEZONE,
  DEFAULT_MEETING_DAY,
  DEFAULT_MEETING_END,
  evaluateWindow,
  zonedDateString,
  zonedWallTimeToUtc,
  zonedTimeLabel,
} from './lib/time.js';
import {
  fetchMeetingBundle,
  claimAutomationStep,
  completeAutomationStep,
  failAutomationStep,
} from './lib/meeting.js';

const MARKER_COLLECTION = 'automationRuns';

function env(name, fallback = '') {
  return process.env[name]?.trim() || fallback;
}

function boolEnv(name) {
  return env(name).toLowerCase() === 'true';
}

function log(stage, message) {
  console.log(`[${stage}] ${message}`);
}

function durationMinutesFrom(checkInTime, checkOutTime) {
  if (!checkInTime || !checkOutTime) return null;
  const inMs = checkInTime.toMillis ? checkInTime.toMillis() : new Date(checkInTime).getTime();
  const outMs = checkOutTime.toMillis ? checkOutTime.toMillis() : new Date(checkOutTime).getTime();
  const mins = Math.round((outMs - inMs) / 60000);
  return mins >= 0 ? mins : null;
}

async function appendActivityLog(db, payload) {
  await db.collection('activityLog').add({
    meetingId: payload.meetingId || null,
    activityType: payload.type,
    type: payload.type,
    actorMemberId: null,
    actorCapid: 'system',
    actorName: 'System',
    targetMemberId: payload.targetMemberId || null,
    targetCapid: payload.targetCapid || null,
    targetName: payload.targetName || null,
    guestId: payload.guestId || null,
    guestName: payload.guestName || null,
    details: payload.details || null,
    timestamp: FieldValue.serverTimestamp(),
  });
}

async function main() {
  const timeZone = env('SCHEDULE_TIMEZONE', DEFAULT_TIMEZONE);
  const dryRun = boolEnv('DRY_RUN');
  const force = boolEnv('FORCE_RUN') || boolEnv('SKIP_SCHEDULE_GATE');
  const projectId = env('FIREBASE_PROJECT_ID', DEFAULT_PROJECT_ID);
  const runId = env('GITHUB_RUN_ID') || null;
  const triggerSource = env('GITHUB_EVENT_NAME') || 'local';

  // 1. Preflight configuration (no secret values).
  const cred = describeFirebaseCredential();
  log('preflight', `project=${projectId} tz=${timeZone} dryRun=${dryRun} force=${force}`);
  log('preflight', `firebase credential: mode=${cred.mode} ok=${cred.ok}${cred.error ? ` (${cred.error})` : ''}`);
  if (!cred.ok) {
    throw new Error(`Firebase credential not usable: ${cred.error}. Set FIREBASE_SERVICE_ACCOUNT_JSON.`);
  }

  // 3. Firebase authentication.
  const db = initFirebaseAdmin();
  log('firebase', 'admin SDK initialized.');

  // Settings (meetingDay/meetingEnd) drive the schedule gate.
  let meetingDay = env('MEETING_DAY', DEFAULT_MEETING_DAY);
  let meetingEnd = DEFAULT_MEETING_END;
  try {
    const settingsSnap = await db.collection('settings').doc('squadron').get();
    if (settingsSnap.exists) {
      const data = settingsSnap.data();
      meetingDay = data.meetingDay || meetingDay;
      meetingEnd = data.meetingEnd || meetingEnd;
    }
  } catch (err) {
    log('firebase', `settings read failed (${err.message}); using defaults.`);
  }

  // 2. Schedule validation.
  const now = new Date();
  const decision = evaluateWindow(now, {
    timeZone,
    meetingDay,
    thresholdTime: meetingEnd,
    force,
    override: env('MEETING_DATE'),
  });
  log('schedule', `now(ET)=${zonedTimeLabel(now, timeZone)} weekday-check → run=${decision.run} (${decision.reason})`);
  if (!decision.run) {
    log('schedule', `Skipping — ${decision.reason}. Meeting end ${meetingEnd} ${meetingDay} (${timeZone}).`);
    log('schedule', 'Set FORCE_RUN=true (or workflow_dispatch skip_schedule_gate) to run immediately.');
    return;
  }

  const meetingDate = decision.meetingDate || zonedDateString(now, timeZone);
  log('schedule', `Target meeting date: ${meetingDate}`);

  // 4. Meeting resolution.
  const { meeting, attendanceRecords, guestRecords, duplicateCount } = await fetchMeetingBundle(db, meetingDate);
  if (duplicateCount > 1) {
    log('meeting', `WARNING: ${duplicateCount} legacy meeting docs found for ${meetingDate}; using lowest id ${meeting?.id}.`);
  }
  if (!meeting) {
    log('meeting', `No meeting document for ${meetingDate} — nothing to force checkout.`);
    return;
  }
  log('meeting', `Resolved meeting ${meeting.id} (${meeting.meetingTitle || 'untitled'}).`);

  // 5. Attendance retrieval.
  const openMembers = attendanceRecords.filter((r) => r.status === 'checked_in');
  const openGuests = guestRecords.filter((r) => r.status === 'checked_in');
  log('attendance', `${attendanceRecords.length} member / ${guestRecords.length} guest records; open: ${openMembers.length} member, ${openGuests.length} guest.`);

  const checkOutInstant = zonedWallTimeToUtc(meetingDate, meetingEnd, timeZone);
  const now2 = new Date();
  const stampDate = checkOutInstant <= now2 ? checkOutInstant : now2;
  const note = `System force logout at ${zonedTimeLabel(checkOutInstant, timeZone)} ${timeZone}.`;

  if (dryRun) {
    log('idempotency', 'DRY_RUN — skipping idempotency claim.');
    log('force-checkout', `DRY_RUN — would check out ${openMembers.length} member(s) and ${openGuests.length} guest(s) at ${stampDate.toISOString()}.`);
    log('status', 'DRY_RUN complete. No writes performed.');
    return;
  }

  // 6. Idempotency check (atomic claim).
  const markerId = `force-${meetingDate}`;
  const alreadyByLegacyFlag = meeting.systemForceCompletedDate === meetingDate;
  let claim;
  try {
    claim = await claimAutomationStep(db, MARKER_COLLECTION, markerId, {
      kind: 'force-checkout',
      meetingId: meeting.id,
      meetingDate,
      triggerSource,
      workflowRunId: runId,
    });
  } catch (err) {
    throw new Error(`Idempotency transaction failed: ${err.message}`);
  }

  if (!claim.claimed || alreadyByLegacyFlag) {
    log('idempotency', `Already completed for ${meetingDate} — skipping (once-only guarantee held).`);
    return;
  }
  log('idempotency', `Claimed ${markerId}.`);

  // 7. Force checkout.
  const stamp = Timestamp.fromDate(stampDate);
  try {
    for (const record of openMembers) {
      await db.collection('attendanceRecords').doc(record.id).update({
        status: 'checked_out',
        checkOutTime: stamp,
        durationMinutes: durationMinutesFrom(record.checkInTime, stamp),
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
        details: { notes: note, forceType: 'system', source: 'github-actions', runId },
      });
    }

    for (const record of openGuests) {
      await db.collection('guestAttendanceRecords').doc(record.id).update({
        status: 'checked_out',
        checkOutTime: stamp,
        durationMinutes: durationMinutesFrom(record.checkInTime, stamp),
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
        details: { notes: note, forceType: 'system', source: 'github-actions', runId },
      });
    }

    await db.collection('meetings').doc(meeting.id).update({
      systemForceCompletedDate: meetingDate,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // 10. Persistent completion record (failure).
    await failAutomationStep(db, MARKER_COLLECTION, markerId, {
      meetingId: meeting.id,
      meetingDate,
      configuredMeetingEnd: meetingEnd,
      executedAtUtc: new Date().toISOString(),
      executedAtEastern: zonedTimeLabel(new Date(), timeZone),
      triggerSource,
      workflowRunId: runId,
      error: err.message?.slice(0, 500) || 'unknown error',
    });
    throw err;
  }

  // 10. Persistent completion record (success).
  await completeAutomationStep(db, MARKER_COLLECTION, markerId, {
    meetingId: meeting.id,
    meetingDate,
    configuredMeetingEnd: meetingEnd,
    checkoutInstantUtc: stampDate.toISOString(),
    executedAtUtc: new Date().toISOString(),
    executedAtEastern: zonedTimeLabel(new Date(), timeZone),
    triggerSource,
    workflowRunId: runId,
    memberCount: openMembers.length,
    guestCount: openGuests.length,
    skipped: false,
  });

  // 12. Final status.
  log('status', `System force checkout complete for ${meetingDate}: ${openMembers.length} member(s), ${openGuests.length} guest(s) checked out at ${zonedTimeLabel(stampDate, timeZone)} ET.`);
}

main().catch((err) => {
  console.error(`[fatal] System force checkout failed: ${err.message}`);
  process.exit(1);
});
