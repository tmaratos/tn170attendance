/**
 * Attendance CSV builder (pure) shared by the report script and tests.
 */
import { DEFAULT_TIMEZONE } from './time.js';

export const CSV_HEADERS = [
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

export function timestampToIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value.toDate) return value.toDate().toISOString();
  if (value._seconds != null) return new Date(value._seconds * 1000).toISOString();
  if (value.seconds != null) return new Date(value.seconds * 1000).toISOString();
  return null;
}

export function formatTime(isoString, timeZone = DEFAULT_TIMEZONE) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  });
}

export function formatDuration(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '—';
  const ms = new Date(checkOut) - new Date(checkIn);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function escapeCsvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function formatGuestPhoneForCsv(phone) {
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
  // A scanned visitor has no host and is not an open-house attendee; the column
  // is left blank rather than borrowing a label that misreports why they came.
  if (record.signInMode === 'badge') return '';
  if (record.isOpenHouse === true || record.signInMode === 'open_house') return 'Open House';
  return record.hostName || record.host || '';
}

function forceActionNote(record) {
  if (!record?.forceAction) return record?.notes || '';
  const type = record.forceType === 'system' ? 'System force logout' : 'Admin force logout';
  const note = record.notes || record.forceNote || '';
  return note ? `${type}: ${note}` : type;
}

export function buildCsv(attendanceRecords, guestRecords, timeZone = DEFAULT_TIMEZONE) {
  const memberRows = attendanceRecords.map((record) => [
    'Member',
    record.memberName || '',
    record.capid || record.temporaryId || record.memberId || '',
    record.role || '',
    '',
    '',
    '',
    formatTime(timestampToIso(record.checkInTime), timeZone),
    formatTime(timestampToIso(record.checkOutTime), timeZone),
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
    formatTime(timestampToIso(record.checkInTime), timeZone),
    formatTime(timestampToIso(record.checkOutTime), timeZone),
    formatDuration(timestampToIso(record.checkInTime), timestampToIso(record.checkOutTime)),
    record.status === 'checked_in' ? 'Present' : 'Signed Out',
    forceActionNote(record),
  ]);

  const rows = [CSV_HEADERS, ...memberRows, ...guestRows];
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

/** Attendance totals used in the summary text and Discord embed. */
export function summarize(attendanceRecords, guestRecords) {
  const memberCheckedIn = attendanceRecords.filter((r) => r.status === 'checked_in').length;
  const memberCheckedOut = attendanceRecords.filter((r) => r.status === 'checked_out').length;
  const guestsPresent = guestRecords.filter((r) => r.status === 'checked_in').length;
  return {
    memberTotal: attendanceRecords.length,
    memberCheckedIn,
    memberCheckedOut,
    guestTotal: guestRecords.length,
    guestsPresent,
  };
}
