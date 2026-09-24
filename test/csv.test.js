import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCsv,
  summarize,
  formatDuration,
  formatGuestPhoneForCsv,
  CSV_HEADERS,
} from '../scripts/lib/csv.js';

const members = [
  {
    memberName: 'Jane Cadet',
    capid: '775740',
    role: 'Cadet',
    status: 'checked_out',
    checkInTime: '2026-07-22T22:35:00.000Z',
    checkOutTime: '2026-07-23T01:30:00.000Z',
    forceAction: true,
    forceType: 'system',
    notes: 'System force logout at 9:30 PM America/New_York.',
  },
  {
    memberName: 'John Senior',
    capid: '326320',
    role: 'Senior Member',
    status: 'checked_in',
    checkInTime: '2026-07-22T22:40:00.000Z',
    checkOutTime: null,
  },
];

const guests = [
  {
    guestName: 'Open Houser',
    signInMode: 'open_house',
    isOpenHouse: true,
    email: 'visitor@example.com',
    phone: '8655551234',
    status: 'checked_out',
    checkInTime: '2026-07-22T22:50:00.000Z',
    checkOutTime: '2026-07-23T00:15:00.000Z',
  },
  {
    guestName: 'Hosted Guest',
    hostName: 'John Senior',
    status: 'checked_in',
    checkInTime: '2026-07-22T23:00:00.000Z',
    checkOutTime: null,
  },
];

test('buildCsv header row matches spec columns', () => {
  const csv = buildCsv([], []);
  assert.equal(csv, CSV_HEADERS.map((h) => `"${h}"`).join(','));
});

test('buildCsv includes member and guest rows with correct classification', () => {
  const csv = buildCsv(members, guests);
  const lines = csv.split('\n');
  assert.equal(lines.length, 1 + members.length + guests.length);
  assert.match(csv, /"Member","Jane Cadet","775740","Cadet"/);
  assert.match(csv, /"Member","John Senior","326320","Senior Member"/);
  // Open house guest → Hosted By = Open House; email + formatted phone present.
  assert.match(csv, /"Guest","Open Houser","","","Open House","visitor@example.com","\(865\) 555-1234"/);
  // Hosted guest → host name in Hosted By.
  assert.match(csv, /"Guest","Hosted Guest","","","John Senior"/);
  // Force note surfaced.
  assert.match(csv, /System force logout/);
  // Statuses.
  assert.match(csv, /"Checked In"/);
  assert.match(csv, /"Checked Out"/);
  assert.match(csv, /"Present"/);
  assert.match(csv, /"Signed Out"/);
});

test('summarize counts members/guests correctly', () => {
  const s = summarize(members, guests);
  assert.equal(s.memberTotal, 2);
  assert.equal(s.memberCheckedOut, 1);
  assert.equal(s.memberCheckedIn, 1);
  assert.equal(s.guestTotal, 2);
  assert.equal(s.guestsPresent, 1);
});

test('formatGuestPhoneForCsv formats US numbers', () => {
  assert.equal(formatGuestPhoneForCsv('8655551234'), '(865) 555-1234');
  assert.equal(formatGuestPhoneForCsv('18655551234'), '+1 (865) 555-1234');
  assert.equal(formatGuestPhoneForCsv(''), '');
  assert.equal(formatGuestPhoneForCsv('12345'), '12345');
});

test('formatDuration handles normal, missing, and negative spans', () => {
  assert.equal(formatDuration('2026-07-22T22:00:00Z', '2026-07-23T00:30:00Z'), '2h 30m');
  assert.equal(formatDuration('2026-07-22T22:00:00Z', '2026-07-22T22:45:00Z'), '45m');
  assert.equal(formatDuration(null, '2026-07-22T22:45:00Z'), '—');
  assert.equal(formatDuration('2026-07-22T23:00:00Z', '2026-07-22T22:00:00Z'), '—');
});

test('CSV cells escape embedded quotes', () => {
  const csv = buildCsv([{ memberName: 'A "B" C', capid: '111111', role: 'Cadet', status: 'checked_in', checkInTime: null, checkOutTime: null }], []);
  assert.match(csv, /"A ""B"" C"/);
});

// "Hosted By" is column 5 in CSV_HEADERS.
const HOSTED_BY = CSV_HEADERS.indexOf('Hosted By');

function guestRow(record) {
  const csv = buildCsv(
    [],
    [{ status: 'checked_in', checkInTime: '2026-09-24T22:42:00Z', ...record }],
    'America/New_York'
  );
  // Cells are CSV-escaped; unwrap them so assertions read naturally.
  return csv
    .split('\n')[1]
    .split(',')
    .map((cell) => cell.replace(/^"(.*)"$/s, '$1').replace(/""/g, '"'));
}

// A scanned visitor has no host and is not an open-house attendee. Borrowing
// the open-house label misreported why they were there, so that column is
// blank for a badge sign-in.
test('a badge sign-in leaves the Hosted By column blank', () => {
  const row = guestRow({ guestName: 'Bob Williams', signInMode: 'badge', isOpenHouse: false });
  assert.equal(row[HOSTED_BY], '');
  assert.equal(row[1], 'Bob Williams');
});

test('open house and hosted guests keep their labels', () => {
  assert.equal(
    guestRow({ guestName: 'Ann Lee', isOpenHouse: true })[HOSTED_BY],
    'Open House'
  );
  assert.equal(
    guestRow({ guestName: 'Cal Ray', isOpenHouse: false, hostName: 'Maj Adrian' })[HOSTED_BY],
    'Maj Adrian'
  );
});

test('a badge sign-in carries no contact details into the report', () => {
  const row = guestRow({ guestName: 'Bob Williams', signInMode: 'badge' });
  assert.equal(row[CSV_HEADERS.indexOf('Email')], '');
  assert.equal(row[CSV_HEADERS.indexOf('Phone')], '');
});
