/**
 * Weekly attendance report — posts the Tuesday attendance export to Discord
 * (required) and, optionally, emails it. Runs from GitHub Actions or locally.
 *
 * Discord is a REQUIRED destination and is fully decoupled from email:
 *   - Missing EMAIL_RECIPIENTS never prevents Discord delivery.
 *   - Email failure never prevents Discord delivery.
 *   - Discord failure is surfaced as a workflow failure + uploaded artifact.
 *
 * Required env:
 *   FIREBASE_SERVICE_ACCOUNT_JSON — service account JSON string
 *   DISCORD_WEBHOOK_URL — webhook created in the attendance channel (never logged)
 * Optional env:
 *   FIREBASE_PROJECT_ID, SCHEDULE_TIMEZONE (America/New_York), MEETING_DAY (Tuesday)
 *   REPORT_TIME (default 22:00 — 10:00 PM local)
 *   DELIVERY_MODE = full | discord_only | email_only   (default full)
 *   DRY_RUN=true, MEETING_DATE=YYYY-MM-DD
 *   FORCE_SEND=true  — skip the schedule gate [alias SKIP_SCHEDULE_GATE]
 *   FORCE_RESEND=true — re-post even if a prior run already succeeded
 *   ARTIFACT_DIR (default ./report-artifacts)
 * Email transport (optional): RESEND_API_KEY + EMAIL_FROM, or SMTP_* + EMAIL_FROM
 *   EMAIL_RECIPIENTS — comma/semicolon-separated addresses
 */
import { FieldValue } from 'firebase-admin/firestore';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import nodemailer from 'nodemailer';
import { initFirebaseAdmin, describeFirebaseCredential, DEFAULT_PROJECT_ID } from './lib/firebaseAdmin.js';
import {
  DEFAULT_TIMEZONE,
  DEFAULT_MEETING_DAY,
  DEFAULT_REPORT_TIME,
  evaluateWindow,
  zonedDateString,
  zonedTimeLabel,
} from './lib/time.js';
import { fetchMeetingBundle } from './lib/meeting.js';
import { buildCsv, summarize } from './lib/csv.js';
import { deliverToDiscord, buildEmbed, validateWebhookUrl } from './lib/discord.js';

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
function parseRecipients(raw) {
  return String(raw || '')
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
}

function buildSummaryText({ meetingDate, meeting, summary, timeZone }) {
  return [
    'TN-170 Oak Ridge Composite Squadron — official Tuesday attendance report',
    '',
    `Meeting date: ${meetingDate}`,
    meeting?.meetingTitle ? `Meeting: ${meeting.meetingTitle}` : null,
    `Timezone: ${timeZone}`,
    '',
    `Total member attendance records: ${summary.memberTotal}`,
    `Members checked out: ${summary.memberCheckedOut}`,
    `Members still open (should be 0): ${summary.memberCheckedIn}`,
    `Total guest records: ${summary.guestTotal}`,
    '',
    'Attachment (ZIP) contains the full member + guest CSV for tonight\'s meeting.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function sendViaResend({ to, subject, text, csv, filename }) {
  const apiKey = env('RESEND_API_KEY');
  const from = env('EMAIL_FROM');
  if (!apiKey || !from) throw new Error('RESEND_API_KEY and EMAIL_FROM are required for Resend.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      attachments: [{ filename, content: Buffer.from(csv, 'utf8').toString('base64') }],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error (${response.status}): ${body.slice(0, 200)}`);
  }
}

async function sendViaSmtp({ to, subject, text, csv, filename }) {
  const host = env('SMTP_HOST');
  const from = env('EMAIL_FROM');
  if (!host || !from) throw new Error('SMTP_HOST and EMAIL_FROM are required for SMTP.');
  const transporter = nodemailer.createTransport({
    host,
    port: Number(env('SMTP_PORT', '587')),
    secure: env('SMTP_SECURE') === 'true',
    auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') } : undefined,
  });
  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    attachments: [{ filename, content: csv, contentType: 'text/csv' }],
  });
}

async function sendEmail(args) {
  if (env('RESEND_API_KEY')) {
    await sendViaResend(args);
    return 'resend';
  }
  await sendViaSmtp(args);
  return 'smtp';
}

async function main() {
  const timeZone = env('SCHEDULE_TIMEZONE', DEFAULT_TIMEZONE);
  const dryRun = boolEnv('DRY_RUN');
  const force = boolEnv('FORCE_SEND') || boolEnv('SKIP_SCHEDULE_GATE');
  const forceResend = boolEnv('FORCE_RESEND');
  const mode = (env('DELIVERY_MODE', 'full') || 'full').toLowerCase();
  const projectId = env('FIREBASE_PROJECT_ID', DEFAULT_PROJECT_ID);
  const runId = env('GITHUB_RUN_ID') || null;
  const triggerSource = env('GITHUB_EVENT_NAME') || 'local';
  const artifactDir = env('ARTIFACT_DIR', './report-artifacts');

  const wantDiscord = mode === 'full' || mode === 'discord_only';
  const wantEmail = mode === 'full' || mode === 'email_only';
  const discordRequired = wantDiscord; // Discord is the required destination when in scope.

  // 1. Preflight configuration (presence only — never values).
  const cred = describeFirebaseCredential();
  const webhook = env('DISCORD_WEBHOOK_URL');
  const webhookCheck = validateWebhookUrl(webhook);
  const recipients = parseRecipients(env('EMAIL_RECIPIENTS'));
  log('preflight', `mode=${mode} dryRun=${dryRun} force=${force} forceResend=${forceResend}`);
  log('preflight', `firebase credential: mode=${cred.mode} ok=${cred.ok}${cred.error ? ` (${cred.error})` : ''}`);
  log('preflight', `discord webhook present=${Boolean(webhook)} syntacticallyValid=${webhookCheck.valid}${webhook ? '' : ' (DISCORD_WEBHOOK_URL missing)'}`);
  log('preflight', `email transport: resend=${Boolean(env('RESEND_API_KEY'))} smtp=${Boolean(env('SMTP_HOST'))} from=${Boolean(env('EMAIL_FROM'))} recipients=${recipients.length}`);

  if (!cred.ok) throw new Error(`Firebase credential not usable: ${cred.error}.`);

  // 3. Firebase authentication.
  const db = initFirebaseAdmin();
  log('firebase', 'admin SDK initialized.');

  // Settings for the schedule gate.
  let meetingDay = env('MEETING_DAY', DEFAULT_MEETING_DAY);
  try {
    const settingsSnap = await db.collection('settings').doc('squadron').get();
    if (settingsSnap.exists) meetingDay = settingsSnap.data().meetingDay || meetingDay;
  } catch (err) {
    log('firebase', `settings read failed (${err.message}); using defaults.`);
  }

  // 2. Schedule validation.
  const now = new Date();
  const decision = evaluateWindow(now, {
    timeZone,
    meetingDay,
    thresholdTime: env('REPORT_TIME', DEFAULT_REPORT_TIME),
    force,
    override: env('MEETING_DATE'),
  });
  log('schedule', `now(ET)=${zonedTimeLabel(now, timeZone)} → run=${decision.run} (${decision.reason})`);
  if (!decision.run) {
    log('schedule', 'Skipping — outside the report window. Set FORCE_SEND=true to run now.');
    return;
  }
  const meetingDate = decision.meetingDate || zonedDateString(now, timeZone);
  log('schedule', `Target meeting date: ${meetingDate}`);

  // 4/5. Meeting + attendance retrieval.
  const { meeting, attendanceRecords, guestRecords, duplicateCount } = await fetchMeetingBundle(db, meetingDate);
  if (duplicateCount > 1) log('meeting', `WARNING: ${duplicateCount} legacy meeting docs for ${meetingDate}.`);
  if (!meeting) log('meeting', `No Firestore meeting for ${meetingDate} — report will contain headers only.`);
  else log('meeting', `Resolved meeting ${meeting.id}.`);
  const summary = summarize(attendanceRecords, guestRecords);
  log('attendance', `members total=${summary.memberTotal} checkedOut=${summary.memberCheckedOut} open=${summary.memberCheckedIn}; guests=${summary.guestTotal}.`);

  // 7. Report generation.
  const csv = buildCsv(attendanceRecords, guestRecords, timeZone);
  const filename = `tn170-attendance-${meetingDate}.csv`;
  const subject = `TN-170 Attendance — ${meetingDate}`;
  const text = buildSummaryText({ meetingDate, meeting, summary, timeZone });

  // Always write the artifact so it is downloadable even if delivery fails.
  const zipName = filename.replace(/\.csv$/i, '.zip');
  try {
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(join(artifactDir, filename), csv, 'utf8');
    log('artifact', `Wrote ${join(artifactDir, filename)} (and ${zipName} is generated in-memory for Discord).`);
  } catch (err) {
    log('artifact', `Could not write artifact file: ${err.message}`);
  }

  // 6. Idempotency — read prior delivery record.
  const markerId = `report-${meetingDate}`;
  const markerRef = db.collection(MARKER_COLLECTION).doc(markerId);
  const priorSnap = dryRun ? null : await markerRef.get();
  const prior = priorSnap?.exists ? priorSnap.data() : null;
  const discordAlreadyDone = Boolean(prior?.discordSucceeded) && !forceResend;
  const emailAlreadyDone = Boolean(prior?.emailSucceeded) && !forceResend;

  if (dryRun) {
    log('discord', `DRY_RUN — would ${wantDiscord ? 'post' : 'skip'} Discord (webhook valid=${webhookCheck.valid}).`);
    log('email', `DRY_RUN — would ${wantEmail && recipients.length ? 'email ' + recipients.length + ' recipient(s)' : 'skip email'}.`);
    log('status', 'DRY_RUN complete. No delivery performed.');
    return;
  }

  const record = {
    kind: 'report',
    meetingId: meeting?.id || null,
    meetingDate,
    reportGeneratedAt: new Date().toISOString(),
    csvFilename: filename,
    zipFilename: zipName,
    triggerSource,
    workflowRunId: runId,
    deliveryMode: mode,
  };

  // 8. Discord delivery (required; fully independent of email).
  let discordResult = null;
  if (wantDiscord) {
    if (discordAlreadyDone) {
      log('discord', `Already delivered for ${meetingDate} (message ${prior?.discordMessageId || 'n/a'}) — skipping. Use FORCE_RESEND=true to re-post.`);
      discordResult = { ok: true, status: prior?.discordStatus || 200, messageId: prior?.discordMessageId || null };
    } else if (!webhook) {
      discordResult = { ok: false, status: 0, error: 'DISCORD_WEBHOOK_URL is not set' };
      log('discord', 'FAILED — DISCORD_WEBHOOK_URL is not set. Add the webhook secret (see docs).');
    } else if (!webhookCheck.valid) {
      discordResult = { ok: false, status: 0, error: `webhook URL invalid: ${webhookCheck.reason}` };
      log('discord', `FAILED — webhook URL is not valid (${webhookCheck.reason}).`);
    } else {
      const embed = buildEmbed({ meetingDate, meeting, summary, timeZone, official: true });
      discordResult = await deliverToDiscord(webhook, { csv, filename, embed });
      if (discordResult.ok) {
        log('discord', `Delivered ${zipName} to attendance channel (status ${discordResult.status}, message ${discordResult.messageId || 'n/a'}, attempts ${discordResult.attempts}).`);
      } else {
        log('discord', `FAILED after ${discordResult.attempts} attempt(s): ${discordResult.error} (status ${discordResult.status}).`);
      }
    }
    Object.assign(record, {
      discordAttempted: true,
      discordSucceeded: Boolean(discordResult.ok),
      discordStatus: discordResult.status || 0,
      discordMessageId: discordResult.messageId || null,
    });
  } else {
    log('discord', 'Skipped (delivery mode does not include Discord).');
    Object.assign(record, { discordAttempted: false, discordSucceeded: prior?.discordSucceeded || false });
  }

  // 9. Email delivery (optional; missing recipients/transport is not a hard failure in full mode).
  let emailResult = null;
  if (wantEmail) {
    const hasTransport = Boolean(env('RESEND_API_KEY')) || Boolean(env('SMTP_HOST'));
    if (emailAlreadyDone) {
      log('email', 'Already delivered — skipping.');
      emailResult = { ok: true, provider: prior?.emailProvider || null };
    } else if (!recipients.length || !hasTransport || !env('EMAIL_FROM')) {
      const why = !recipients.length ? 'no EMAIL_RECIPIENTS' : !hasTransport ? 'no email transport configured' : 'no EMAIL_FROM';
      log('email', `Skipped — ${why}. Email is optional; Discord is unaffected.`);
      emailResult = { ok: false, skipped: true, reason: why };
    } else {
      try {
        const provider = await sendEmail({ to: recipients, subject, text, csv, filename });
        log('email', `Sent ${filename} to ${recipients.length} recipient(s) via ${provider}.`);
        emailResult = { ok: true, provider };
      } catch (err) {
        log('email', `FAILED: ${err.message}. Discord delivery is unaffected.`);
        emailResult = { ok: false, error: err.message?.slice(0, 300) };
      }
    }
    Object.assign(record, {
      emailAttempted: !emailResult.skipped,
      emailSucceeded: Boolean(emailResult.ok),
      emailProvider: emailResult.provider || null,
    });
  } else {
    log('email', 'Skipped (delivery mode does not include email).');
  }

  // 10. Persist delivery record.
  const discordFailed = discordRequired && !(discordResult && discordResult.ok);
  const emailOnlyFailed = mode === 'email_only' && !(emailResult && emailResult.ok);
  const finalState = discordFailed || emailOnlyFailed ? 'failed' : 'delivered';
  record.errorSummary = [
    discordFailed ? `discord: ${discordResult?.error || 'failed'}` : null,
    emailResult && !emailResult.ok && !emailResult.skipped ? `email: ${emailResult.error || 'failed'}` : null,
  ]
    .filter(Boolean)
    .join('; ') || null;
  record.finalState = finalState;
  record.updatedAt = FieldValue.serverTimestamp();
  await markerRef.set(record, { merge: true });
  log('record', `Delivery record ${markerId} → ${finalState}.`);

  // 12. Final status — fail the workflow when a required destination failed.
  if (finalState === 'failed') {
    throw new Error(
      discordFailed
        ? `Discord delivery FAILED for ${meetingDate}: ${discordResult?.error || 'unknown'}. The report ZIP is attached as a workflow artifact. Fix DISCORD_WEBHOOK_URL and re-run (Discord-only, FORCE_SEND=true).`
        : `Email-only delivery failed for ${meetingDate}: ${emailResult?.error || emailResult?.reason || 'unknown'}.`,
    );
  }
  log('status', `Report delivery complete for ${meetingDate} (${finalState}).`);
}

main().catch((err) => {
  console.error(`[fatal] Weekly attendance report failed: ${err.message}`);
  process.exit(1);
});
