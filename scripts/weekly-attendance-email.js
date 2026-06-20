/**
 * Weekly attendance email — run from GitHub Actions or locally.
 *
 * Required env:
 *   FIREBASE_PROJECT_ID (default: tn170-attendance)
 *   FIREBASE_SERVICE_ACCOUNT_JSON — full service account JSON string
 *   EMAIL_RECIPIENTS — comma/semicolon-separated addresses
 *
 * Email transport (pick one):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
 *   — or —
 *   RESEND_API_KEY, EMAIL_FROM
 *
 * Optional:
 *   SCHEDULE_TIMEZONE (default America/New_York — Oak Ridge, TN)
 *   MEETING_DAY (default Tuesday)
 *   SEND_HOUR (default 22 — 10 PM local)
 *   FORCE_SEND=true — skip schedule gate (manual runs)
 *   DISCORD_WEBHOOK_URL — posts CSV to Discord channel as backup (skipped if unset)
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import nodemailer from 'nodemailer';

const DEFAULT_PROJECT_ID = 'tn170-attendance';
const CSV_HEADERS = [
  'Type',
  'Name',
  'CAPID/Pending CAPID',
  'Role',
  'Hosted By',
  'Email',
  'Phone',
  'Check-In',
  'Check-Out',
  'Duration',
  'Status',
  'Force Action Note',
];

function env(name, fallback = '') {
  return process.env[name]?.trim() || fallback;
}

function parseRecipients(raw) {
  return String(raw || '')
    .split(/[,;\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function timestampToIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value.toDate) return value.toDate().toISOString();
  if (value._seconds) return new Date(value._seconds * 1000).toISOString();
  return null;
}

function formatTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: env('SCHEDULE_TIMEZONE', 'America/New_York'),
  });
}

function formatDuration(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '—';
  const ms = new Date(checkOut) - new Date(checkIn);
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function escapeCsvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

let crc32Table;
function crc32(buffer) {
  if (!crc32Table) {
    crc32Table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crc32Table[i] = c;
    }
  }

  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Store-only ZIP — Discord inlines text/csv attachments but not application/zip. */
function zipSingleFile(filename, content) {
  const nameBuffer = Buffer.from(filename, 'utf8');
  const dataBuffer = Buffer.from(content, 'utf8');
  const checksum = crc32(dataBuffer);
  const size = dataBuffer.length;

  const localHeader = Buffer.alloc(30 + nameBuffer.length);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(size, 18);
  localHeader.writeUInt32LE(size, 22);
  localHeader.writeUInt16LE(nameBuffer.length, 26);
  nameBuffer.copy(localHeader, 30);

  const centralHeader = Buffer.alloc(46 + nameBuffer.length);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt32LE(checksum, 16);
  centralHeader.writeUInt32LE(size, 20);
  centralHeader.writeUInt32LE(size, 24);
  centralHeader.writeUInt16LE(nameBuffer.length, 28);
  centralHeader.writeUInt32LE(0, 38);
  nameBuffer.copy(centralHeader, 46);

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(1, 8);
  endRecord.writeUInt16LE(1, 10);
  endRecord.writeUInt32LE(centralHeader.length, 12);
  endRecord.writeUInt32LE(localHeader.length + size, 16);

  return Buffer.concat([localHeader, dataBuffer, centralHeader, endRecord]);
}

function embedDescription(meetingTitle, meetingDate) {
  const fallback = `Squadron Meeting — ${meetingDate}`;
  if (!meetingTitle) return fallback;

  const suffix = ` — ${meetingDate}`;
  if (meetingTitle.endsWith(suffix + suffix)) {
    return meetingTitle.slice(0, -suffix.length);
  }
  return meetingTitle;
}

function formatGuestPhoneForCsv(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return String(phone);
}

function guestHostedBy(record) {
  if (record.isOpenHouse === true || record.signInMode === 'open_house') {
    return 'Open House';
  }
  return record.hostName || record.host || '';
}

function forceActionNote(record) {
  if (!record?.forceAction) return record?.notes || '';
  const type = record.forceType === 'system' ? 'System force logout' : 'Admin force logout';
  const note = record.notes || record.forceNote || '';
  return note ? `${type}: ${note}` : type;
}

function buildCsv(attendanceRecords, guestRecords) {
  const memberRows = attendanceRecords.map((record) => [
    'Member',
    record.memberName || '',
    record.capid || record.temporaryId || record.memberId || '',
    record.role || '',
    '',
    '',
    '',
    formatTime(timestampToIso(record.checkInTime)),
    formatTime(timestampToIso(record.checkOutTime)),
    formatDuration(timestampToIso(record.checkInTime), timestampToIso(record.checkOutTime)),
    record.status === 'checked_in' ? 'Checked In' : 'Checked Out',
    forceActionNote(record),
  ]);

  const guestRows = guestRecords.map((record) => [
    'Guest',
    record.guestName || record.name || '',
    '',
    '',
    guestHostedBy(record),
    record.email || '',
    formatGuestPhoneForCsv(record.phone),
    formatTime(timestampToIso(record.checkInTime)),
    formatTime(timestampToIso(record.checkOutTime)),
    formatDuration(timestampToIso(record.checkInTime), timestampToIso(record.checkOutTime)),
    record.status === 'checked_in' ? 'Present' : 'Signed Out',
    forceActionNote(record),
  ]);

  const rows = [CSV_HEADERS, ...memberRows, ...guestRows];
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

function meetingDateInTimezone(timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

function shouldSendNow() {
  if (env('FORCE_SEND') === 'true') return true;

  const timeZone = env('SCHEDULE_TIMEZONE', 'America/New_York');
  const meetingDay = env('MEETING_DAY', 'Tuesday');
  const sendHour = Number(env('SEND_HOUR', '22'));

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date());

  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);

  return weekday === meetingDay && hour === sendHour;
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

async function sendViaSmtp({ to, subject, text, csv, filename }) {
  const host = env('SMTP_HOST');
  const user = env('SMTP_USER');
  const pass = env('SMTP_PASS');
  const from = env('EMAIL_FROM');

  if (!host || !from) {
    throw new Error('SMTP_HOST and EMAIL_FROM are required for SMTP delivery.');
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(env('SMTP_PORT', '587')),
    secure: env('SMTP_SECURE') === 'true',
    auth: user ? { user, pass } : undefined,
  });

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    attachments: [{ filename, content: csv, contentType: 'text/csv' }],
  });
}

async function sendViaResend({ to, subject, text, csv, filename }) {
  const apiKey = env('RESEND_API_KEY');
  const from = env('EMAIL_FROM');

  if (!apiKey || !from) {
    throw new Error('RESEND_API_KEY and EMAIL_FROM are required for Resend delivery.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      attachments: [
        {
          filename,
          content: Buffer.from(csv, 'utf8').toString('base64'),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error (${response.status}): ${body}`);
  }
}

async function sendEmail({ to, subject, text, csv, filename }) {
  if (env('RESEND_API_KEY')) {
    await sendViaResend({ to, subject, text, csv, filename });
    return 'resend';
  }
  await sendViaSmtp({ to, subject, text, csv, filename });
  return 'smtp';
}

async function postToDiscord({ csv, filename, meetingDate, meeting, attendanceRecords, guestRecords, timeZone }) {
  const webhookUrl = env('DISCORD_WEBHOOK_URL');
  if (!webhookUrl) {
    console.warn('DISCORD_WEBHOOK_URL not set — skipping Discord backup post.');
    return null;
  }

  const checkedIn = attendanceRecords.filter((r) => r.status === 'checked_in').length;
  const checkedOut = attendanceRecords.filter((r) => r.status === 'checked_out').length;
  const guestsTotal = guestRecords.length;

  const embed = {
    title: `TN-170 Attendance — ${meetingDate}`,
    description: embedDescription(meeting?.meetingTitle, meetingDate),
    color: 0x1e3a5f,
    fields: [
      { name: 'Members (checked out)', value: String(checkedOut), inline: true },
      { name: 'Members (still open)', value: String(checkedIn), inline: true },
      { name: 'Guest records', value: String(guestsTotal), inline: true },
      { name: 'Timezone', value: timeZone, inline: false },
    ],
    footer: { text: 'GitHub Actions weekly backup' },
  };

  const zipFilename = filename.replace(/\.csv$/i, '.zip');
  const zipBuffer = zipSingleFile(filename, csv);

  const form = new FormData();
  form.append(
    'payload_json',
    JSON.stringify({ embeds: [embed] }),
  );
  form.append(
    'files[0]',
    new Blob([zipBuffer], { type: 'application/zip' }),
    zipFilename,
  );

  const response = await fetch(webhookUrl, { method: 'POST', body: form });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord webhook error (${response.status}): ${body.slice(0, 200)}`);
  }

  return zipFilename;
}

function buildSummaryText({ meetingDate, meeting, attendanceRecords, guestRecords, timeZone }) {
  const checkedIn = attendanceRecords.filter((r) => r.status === 'checked_in').length;
  const checkedOut = attendanceRecords.filter((r) => r.status === 'checked_out').length;
  const guestsPresent = guestRecords.filter((r) => r.status === 'checked_in').length;
  const guestsTotal = guestRecords.length;

  const lines = [
    'TN-170 Oak Ridge Composite Squadron — weekly attendance report',
    '',
    `Meeting date: ${meetingDate}`,
    meeting?.meetingTitle ? `Meeting: ${meeting.meetingTitle}` : null,
    `Timezone: ${timeZone}`,
    '',
    `Members checked in (still open): ${checkedIn}`,
    `Members checked out: ${checkedOut}`,
    `Total member attendance records: ${attendanceRecords.length}`,
    `Guests present (still open): ${guestsPresent}`,
    `Total guest records: ${guestsTotal}`,
    '',
    'CSV attachment includes member and guest rows for tonight\'s meeting.',
  ].filter(Boolean);

  return lines.join('\n');
}

async function main() {
  if (!shouldSendNow()) {
    console.log('Skipping send — outside configured Tuesday send window.');
    console.log('Set FORCE_SEND=true to run immediately (manual test).');
    return;
  }

  const recipients = parseRecipients(env('EMAIL_RECIPIENTS'));
  if (!recipients.length) {
    throw new Error('EMAIL_RECIPIENTS is empty. Add comma-separated addresses in GitHub Secrets.');
  }

  const timeZone = env('SCHEDULE_TIMEZONE', 'America/New_York');
  const meetingDate = meetingDateInTimezone(timeZone);

  initFirebaseAdmin();
  const db = getFirestore();

  const { meeting, attendanceRecords, guestRecords } = await fetchMeetingBundle(db, meetingDate);
  const csv = buildCsv(attendanceRecords, guestRecords);
  const filename = `tn170-attendance-${meetingDate}.csv`;
  const subject = `TN-170 Attendance — ${meetingDate}`;
  const text = buildSummaryText({
    meetingDate,
    meeting,
    attendanceRecords,
    guestRecords,
    timeZone,
  });

  let emailError = null;
  try {
    const provider = await sendEmail({
      to: recipients,
      subject,
      text,
      csv,
      filename,
    });
    console.log(`Sent ${filename} to ${recipients.join(', ')} via ${provider}.`);
  } catch (err) {
    emailError = err;
    console.error('Email delivery failed:', err.message);
  }

  if (!meeting) {
    console.log('Note: no Firestore meeting document found for this date — email contains headers only.');
  }

  let discordPosted = false;
  try {
    const discordAttachment = await postToDiscord({
      csv,
      filename,
      meetingDate,
      meeting,
      attendanceRecords,
      guestRecords,
      timeZone,
    });
    if (discordAttachment) {
      discordPosted = true;
      console.log(`Posted ${discordAttachment} (contains ${filename}) to Discord backup channel.`);
    }
  } catch (err) {
    console.error('Discord backup post failed:', err.message);
  }

  if (emailError && !discordPosted) {
    throw emailError;
  }
  if (emailError && discordPosted) {
    console.warn('Email failed but Discord backup succeeded — job marked successful.');
  }
}

main().catch((err) => {
  console.error('Weekly attendance email failed:', err.message);
  process.exit(1);
});
