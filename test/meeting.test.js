import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchMeetingBundle,
  claimAutomationStep,
  completeAutomationStep,
} from '../scripts/lib/meeting.js';
import { meetingIdCandidates } from './helpers/meetingId.js';

// ---- Minimal in-memory Firestore fake (only what meeting.js uses) ----
function makeDb(seed = {}) {
  const store = new Map(); // `${col}/${id}` -> data
  for (const [key, data] of Object.entries(seed)) store.set(key, { ...data });

  const snap = (col, id) => {
    const key = `${col}/${id}`;
    const exists = store.has(key);
    return { exists, id, data: () => (exists ? { ...store.get(key) } : undefined) };
  };

  function collection(col) {
    return {
      doc(id) {
        const key = `${col}/${id}`;
        return {
          _key: key,
          col,
          id,
          async get() { return snap(col, id); },
          async set(data, opts) {
            const prev = opts?.merge ? store.get(key) || {} : {};
            store.set(key, { ...prev, ...data });
          },
          async update(data) {
            store.set(key, { ...(store.get(key) || {}), ...data });
          },
        };
      },
      where(field, _op, value) {
        return {
          async get() {
            const docs = [];
            for (const [key, data] of store.entries()) {
              const [c, id] = key.split('/');
              if (c === col && data[field] === value) {
                docs.push({ id, data: () => ({ ...data }) });
              }
            }
            return { size: docs.length, empty: docs.length === 0, docs };
          },
        };
      },
    };
  }

  return {
    _store: store,
    collection,
    async runTransaction(fn) {
      // Serial execution in tests → emulates atomicity for our once-only claim.
      const tx = {
        async get(ref) { return snap(ref.col, ref.id); },
        set(ref, data, opts) {
          const prev = opts?.merge ? store.get(ref._key) || {} : {};
          store.set(ref._key, { ...prev, ...data });
        },
      };
      return fn(tx);
    },
  };
}

test('fetchMeetingBundle resolves the deterministic Eastern-date meeting id', async () => {
  const db = makeDb({
    'meetings/2026-07-21': { meetingDate: '2026-07-21', meetingTitle: 'T' },
    'attendanceRecords/a1': { meetingId: '2026-07-21', memberId: '1', status: 'checked_in' },
    'guestAttendanceRecords/g1': { meetingId: '2026-07-21', status: 'checked_in' },
  });
  const b = await fetchMeetingBundle(db, '2026-07-21');
  assert.equal(b.meeting.id, '2026-07-21');
  assert.equal(b.attendanceRecords.length, 1);
  assert.equal(b.guestRecords.length, 1);
  assert.equal(b.duplicateCount, 0);
});

test('fetchMeetingBundle falls back to a legacy random-id meeting by meetingDate', async () => {
  const db = makeDb({
    'meetings/RAND123': { meetingDate: '2026-07-21', meetingTitle: 'legacy' },
    'attendanceRecords/a1': { meetingId: 'RAND123', memberId: '1', status: 'checked_in' },
  });
  const b = await fetchMeetingBundle(db, '2026-07-21');
  assert.equal(b.meeting.id, 'RAND123');
  assert.equal(b.attendanceRecords.length, 1);
});

test('fetchMeetingBundle picks a deterministic doc among duplicates (lowest id)', async () => {
  const db = makeDb({
    'meetings/ZZZ': { meetingDate: '2026-07-21' },
    'meetings/AAA': { meetingDate: '2026-07-21' },
  });
  const b = await fetchMeetingBundle(db, '2026-07-21');
  assert.equal(b.meeting.id, 'AAA');
  assert.equal(b.duplicateCount, 2);
});

test('fetchMeetingBundle returns null meeting when none exists', async () => {
  const db = makeDb({});
  const b = await fetchMeetingBundle(db, '2026-07-21');
  assert.equal(b.meeting, null);
  assert.deepEqual(b.attendanceRecords, []);
});

test('claimAutomationStep is once-only across duplicate runs (idempotency)', async () => {
  const db = makeDb({});
  const first = await claimAutomationStep(db, 'automationRuns', 'force-2026-07-21', { meetingId: '2026-07-21' });
  assert.equal(first.claimed, true, 'first run claims');
  await completeAutomationStep(db, 'automationRuns', 'force-2026-07-21', { memberCount: 3 });

  const second = await claimAutomationStep(db, 'automationRuns', 'force-2026-07-21', {});
  assert.equal(second.claimed, false, 'second run must NOT re-claim a completed step');

  const rec = db._store.get('automationRuns/force-2026-07-21');
  assert.equal(rec.status, 'completed');
  assert.equal(rec.memberCount, 3);
});

test('cross-device: every device derives the SAME meeting id for a Tuesday meeting', () => {
  // Simulated wall-clock instants during one Tuesday meeting (EDT). A device that
  // opens at 6:30 PM and another at 8:30 PM (past UTC midnight) must agree.
  const during = ['2026-07-21T22:30:00Z', '2026-07-22T00:00:00Z', '2026-07-22T00:30:00Z', '2026-07-22T01:15:00Z'];
  const ids = during.map((iso) => meetingIdCandidates(new Date(iso)).eastern);
  assert.ok(ids.every((id) => id === '2026-07-21'), `all resolve to 2026-07-21, got ${ids.join()}`);

  // The OLD UTC-based id diverges after 8 PM EDT → the cross-device desync bug.
  const utcIds = during.map((iso) => meetingIdCandidates(new Date(iso)).utc);
  assert.notEqual(utcIds[0], utcIds[3], 'UTC ids diverge across midnight — the bug we fixed');
});
