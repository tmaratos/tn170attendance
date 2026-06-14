import { doc, getDoc } from 'firebase/firestore';
import { callFunction, getDb, isSparkKioskMode } from './firebase';
import { verifyMemberPinInFirestore } from './kioskPin';
import { getCallableError } from './errors';
import { formatTime, formatDuration } from '../data/mockData';

function escapeCsvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function buildAttendanceCsv(members, guests) {
  const headers = ['Name', 'Grade', 'CAPID', 'Role', 'Status', 'Check-In', 'Check-Out', 'Duration'];
  const memberRows = (members || []).map((m) => [
    m.name,
    m.grade,
    m.capid,
    m.role,
    m.status === 'checked-in' ? 'Checked In' : m.status === 'checked-out' ? 'Checked Out' : 'Not Present',
    formatTime(m.checkInTime),
    formatTime(m.checkOutTime),
    formatDuration(m.checkInTime, m.checkOutTime),
  ]);
  const guestRows = (guests || []).map((g) => [
    g.name,
    '—',
    '—',
    'Guest',
    g.status === 'checked-in' ? 'Present' : 'Signed Out',
    formatTime(g.checkInTime),
    formatTime(g.checkOutTime),
    formatDuration(g.checkInTime, g.checkOutTime),
  ]);

  const rows = [headers, ...memberRows, ...guestRows];
  return rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n');
}

function defaultExportFilename() {
  return `tn170-attendance-${new Date().toISOString().split('T')[0]}.csv`;
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
    throw new Error('Invalid CAPID or PIN.');
  }

  const db = getDb();
  if (!db) throw new Error('Firebase is not configured.');

  const memberSnap = await getDoc(doc(db, 'members', memberId));
  if (!memberSnap.exists() || memberSnap.data().active === false) {
    throw new Error('Member not found.');
  }

  const member = memberSnap.data();
  if (member.isCadet) {
    throw new Error('Only senior members can export reports.');
  }
  if (!member.canExportReports && !member.isAdmin) {
    throw new Error('You do not have permission to export reports.');
  }

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
    mimeType: 'text/csv',
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

export function downloadReportContent({ content, filename, mimeType }) {
  const blob = new Blob([content], { type: mimeType || 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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
