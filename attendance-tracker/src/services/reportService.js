import { doc, getDoc } from 'firebase/firestore';
import { callFunction, getDb, isSparkKioskMode } from './firebase';
import { verifyMemberPinInFirestore } from './kioskPin';
import { getCallableError } from './errors';
import { formatTime, formatDuration } from '../data/mockData';
import { ADMIN_CAPIDS, getEmbeddedRosterMembers } from '../data/rosterData';

const CSV_HEADERS = [
  'Type',
  'Name',
  'CAPID/Pending CAPID',
  'Role',
  'Hosted By',
  'Check-In',
  'Check-Out',
  'Duration',
  'Status',
  'Force Action Note',
];

function escapeCsvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function statusLabel(status) {
  if (status === 'checked-in' || status === 'checked_in') return 'Checked In';
  if (status === 'checked-out' || status === 'checked_out') return 'Checked Out';
  return 'Not Present';
}

function guestStatusLabel(status) {
  if (status === 'checked-in' || status === 'checked_in') return 'Present';
  if (status === 'checked-out' || status === 'checked_out') return 'Signed Out';
  return 'Not Present';
}

function memberCapidLabel(member) {
  if (member.capid && member.capid !== '—') return member.capid;
  if (member.temporaryId) return member.temporaryId;
  if (member.capidRaw) return member.capidRaw;
  return 'Pending CAPID';
}

function forceActionNote(record) {
  if (!record?.forceAction || !record?.forceNote) return '';
  const type = record.forceType === 'system' ? 'System force logout' : 'Admin force logout';
  return `${type}: ${record.forceNote}`;
}

export function buildMemberExportRow(member) {
  return [
    'Member',
    member.name,
    memberCapidLabel(member),
    member.role || '',
    '',
    formatTime(member.checkInTime),
    formatTime(member.checkOutTime),
    formatDuration(member.checkInTime, member.checkOutTime),
    statusLabel(member.status),
    forceActionNote(member),
  ];
}

export function buildGuestExportRow(guest) {
  return [
    'Guest',
    guest.name,
    '',
    '',
    guest.hostName || guest.host || '',
    formatTime(guest.checkInTime),
    formatTime(guest.checkOutTime),
    formatDuration(guest.checkInTime, guest.checkOutTime),
    guestStatusLabel(guest.status),
    '',
  ];
}

export function buildAttendanceCsv(members, guests) {
  const memberRows = (members || []).map(buildMemberExportRow);
  const guestRows = (guests || []).map(buildGuestExportRow);
  const rows = [CSV_HEADERS, ...memberRows, ...guestRows];
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

function defaultExportFilename() {
  return `tn170-attendance-${new Date().toISOString().split('T')[0]}.csv`;
}

function findRosterMember(memberId) {
  const id = String(memberId);
  return getEmbeddedRosterMembers().find(
    (member) => String(member.memberId) === id || String(member.capid) === id
  );
}

async function loadExportMember(memberId) {
  const rosterMember = findRosterMember(memberId);
  const db = getDb();

  if (db) {
    const memberSnap = await getDoc(doc(db, 'members', memberId));
    if (memberSnap.exists() && memberSnap.data().active !== false) {
      const firestoreMember = memberSnap.data();
      const isAdmin =
        !!firestoreMember.isAdmin || !!rosterMember?.isAdmin || ADMIN_CAPIDS.has(memberId);
      const isSeniorMember =
        firestoreMember.isSeniorMember ??
        rosterMember?.isSeniorMember ??
        (!firestoreMember.isCadet && firestoreMember.role !== 'Cadet');
      const canExportReports =
        !!firestoreMember.canExportReports ||
        isAdmin ||
        !!rosterMember?.canExportReports ||
        isSeniorMember;

      return {
        memberId,
        ...rosterMember,
        ...firestoreMember,
        isAdmin,
        isSeniorMember,
        isCadet: firestoreMember.isCadet ?? rosterMember?.isCadet ?? false,
        canExportReports,
      };
    }
  }

  return rosterMember || null;
}

function assertExportPermission(member, memberId) {
  const isAdmin = !!member.isAdmin || ADMIN_CAPIDS.has(memberId);
  const isSenior =
    !!member.isSeniorMember ||
    member.role === 'Senior Member' ||
    (!member.isCadet && member.role !== 'Cadet');

  if (member.isCadet && !isAdmin) {
    throw new Error('Only senior members can export reports.');
  }
  if (!isSenior && !isAdmin) {
    throw new Error('Only senior members can export reports.');
  }
  if (!member.canExportReports && !isAdmin) {
    throw new Error('You do not have permission to export reports.');
  }
}

async function verifySparkExportAccess(actorCapid, actorPin) {
  const memberId = String(actorCapid).trim();
  if (!memberId) {
    throw new Error('Enter your CAPID.');
  }
  if (!/^\d{4}$/.test(actorPin)) {
    throw new Error('Enter your 4-digit PIN.');
  }

  const valid = await verifyMemberPinInFirestore(memberId, actorPin);
  if (!valid) {
    throw new Error('Incorrect PIN.');
  }

  const member = await loadExportMember(memberId);
  if (!member) {
    throw new Error('Member not found.');
  }

  assertExportPermission(member, memberId);
  return { memberId, ...member };
}

/** Spark / free tier: verify PIN in Firestore and build CSV in the browser. */
export async function exportReportSpark({ actorCapid, actorPin, members, guests, format = 'csv' }) {
  const member = await verifySparkExportAccess(actorCapid, actorPin);

  if (format !== 'csv') {
    throw new Error(`${format.toUpperCase()} export requires Cloud Functions. Use CSV on Spark.`);
  }

  return {
    success: true,
    content: buildAttendanceCsv(members, guests),
    filename: defaultExportFilename(),
    mimeType: 'text/csv;charset=utf-8;',
    exportedBy: member.displayName || member.fullName || member.memberId,
  };
}

export async function exportReport({ actorCapid, actorPin, meetingId, format = 'csv' }) {
  const fn = callFunction('exportReport');
  try {
    const result = await fn({
      actorCapid: String(actorCapid),
      actorPin,
      meetingId: meetingId || null,
      format,
    });
    return result.data;
  } catch (err) {
    throw new Error(getCallableError(err));
  }
}

export function downloadCsv(filename, content) {
  downloadReportContent({
    content,
    filename: filename || defaultExportFilename(),
    mimeType: 'text/csv;charset=utf-8;',
  });
}

export function downloadReportContent({ content, filename, mimeType }) {
  const csvBody = content.startsWith('\uFEFF') ? content : `\uFEFF${content}`;
  const blob = new Blob([csvBody], { type: mimeType || 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || defaultExportFilename();
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 250);
}

export async function exportAndDownload({
  actorCapid,
  actorPin,
  meetingId,
  format,
  members,
  guests,
}) {
  const data = isSparkKioskMode()
    ? await exportReportSpark({ actorCapid, actorPin, members, guests, format })
    : await exportReport({ actorCapid, actorPin, meetingId, format });

  downloadReportContent({
    content: data.content,
    filename: data.filename,
    mimeType: data.mimeType,
  });
  return data;
}
