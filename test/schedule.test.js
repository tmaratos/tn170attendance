import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateWindow,
  resolveMeetingDate,
  zonedDateString,
  zonedWallTimeToUtc,
  previousDate,
  parseClock,
} from '../scripts/lib/time.js';

// July 2026 is EDT (UTC-4); January 2026 is EST (UTC-5). Instants are given in UTC
// so results are independent of the machine/runner timezone (Intl uses explicit tz).
const force = (iso, thresholdTime) => evaluateWindow(new Date(iso), { thresholdTime });

const FORCE = '21:30'; // 9:30 PM force checkout threshold
const REPORT = '22:00'; // 10:00 PM report threshold

test('force checkout — EDT Tuesday time matrix', () => {
  // Tue 2026-07-21, EDT (UTC-4): ET = UTC - 4h
  assert.equal(force('2026-07-22T00:00:00Z', FORCE).run, false, '8:00 PM ET → no');
  assert.equal(force('2026-07-22T01:29:00Z', FORCE).run, false, '9:29 PM ET → no');
  assert.equal(force('2026-07-22T01:30:00Z', FORCE).run, true, '9:30 PM ET → yes');
  assert.equal(force('2026-07-22T01:39:00Z', FORCE).run, true, '9:39 PM ET → yes');
  assert.equal(force('2026-07-22T02:30:00Z', FORCE).run, true, '10:30 PM ET → yes (idempotency dedupes)');
  // All resolve to the same Eastern meeting date.
  assert.equal(force('2026-07-22T01:30:00Z', FORCE).meetingDate, '2026-07-21');
});

test('force checkout — the 8:00 PM premature-checkout incident is rejected', () => {
  // Stale local 20:00 could trip the OLD client at 8 PM; the server gate at 21:30 never does.
  assert.equal(force('2026-07-22T00:00:00Z', FORCE).run, false);
});

test('force checkout — EST Tuesday time matrix', () => {
  // Tue 2026-01-13, EST (UTC-5): ET = UTC - 5h
  assert.equal(force('2026-01-14T01:00:00Z', FORCE).run, false, '8:00 PM ET → no');
  assert.equal(force('2026-01-14T02:29:00Z', FORCE).run, false, '9:29 PM ET → no');
  assert.equal(force('2026-01-14T02:30:00Z', FORCE).run, true, '9:30 PM ET → yes');
  assert.equal(force('2026-01-14T02:30:00Z', FORCE).meetingDate, '2026-01-13');
});

test('report — 10:00 PM threshold matrix (EDT + EST)', () => {
  assert.equal(force('2026-07-22T01:59:00Z', REPORT).run, false, 'EDT 9:59 PM → no');
  assert.equal(force('2026-07-22T02:00:00Z', REPORT).run, true, 'EDT 10:00 PM → yes');
  assert.equal(force('2026-07-22T02:01:00Z', REPORT).run, true, 'EDT 10:01 PM → yes');
  assert.equal(force('2026-01-14T02:59:00Z', REPORT).run, false, 'EST 9:59 PM → no');
  assert.equal(force('2026-01-14T03:00:00Z', REPORT).run, true, 'EST 10:00 PM → yes');
});

test('delayed GitHub cron (the Jul 14/21 failure) still processes the right meeting', () => {
  // GitHub delivered the run at Wed ~00:44 ET; the OLD "is it Tuesday" gate skipped.
  const d = force('2026-07-22T04:44:00Z', FORCE); // Wed 00:44 ET
  assert.equal(d.run, true, 'delayed-catch-up must run');
  assert.equal(d.reason, 'delayed-catch-up');
  assert.equal(d.meetingDate, '2026-07-21', 'targets Tuesday, not Wednesday');
});

test('non-Tuesday and past-grace runs do not fire', () => {
  assert.equal(force('2026-07-20T22:00:00Z', FORCE).run, false, 'Monday evening → no');
  assert.equal(force('2026-07-23T22:00:00Z', FORCE).run, false, 'Thursday → no');
  // Wed 1:00 PM ET = 17:00 UTC — well past the morning grace window.
  const late = force('2026-07-22T17:00:00Z', FORCE);
  assert.equal(late.run, false, 'Wed afternoon → past grace');
});

test('force flag overrides the schedule gate any day/time', () => {
  const d = evaluateWindow(new Date('2026-07-20T15:00:00Z'), { thresholdTime: FORCE, force: true });
  assert.equal(d.run, true);
  assert.equal(d.reason, 'forced');
});

test('manual meeting_date override is honored', () => {
  const d = evaluateWindow(new Date('2026-07-22T01:30:00Z'), {
    thresholdTime: FORCE,
    override: '2026-06-30',
  });
  assert.equal(d.meetingDate, '2026-06-30');
});

test('decision is deterministic (safe for duplicate scheduled runs)', () => {
  const a = force('2026-07-22T01:31:00Z', FORCE);
  const b = force('2026-07-22T01:31:00Z', FORCE);
  assert.deepEqual(a, b);
});

test('zonedDateString gives the Eastern date across the UTC midnight rollover', () => {
  // 8:30 PM EDT Tue = 00:30 UTC Wed. Eastern date must still be Tuesday.
  assert.equal(zonedDateString(new Date('2026-07-22T00:30:00Z')), '2026-07-21');
  // Contrast: naive UTC date would be 2026-07-22 (the cross-device desync bug).
  assert.notEqual('2026-07-22', zonedDateString(new Date('2026-07-22T00:30:00Z')));
});

test('zonedWallTimeToUtc stamps the true meeting-end instant (EDT + EST)', () => {
  assert.equal(zonedWallTimeToUtc('2026-07-21', '21:30').toISOString(), '2026-07-22T01:30:00.000Z');
  assert.equal(zonedWallTimeToUtc('2026-01-13', '21:30').toISOString(), '2026-01-14T02:30:00.000Z');
});

test('previousDate handles month/year boundaries', () => {
  assert.equal(previousDate('2026-07-22'), '2026-07-21');
  assert.equal(previousDate('2026-07-01'), '2026-06-30');
  assert.equal(previousDate('2026-01-01'), '2025-12-31');
});

test('parseClock parses HH:MM', () => {
  assert.deepEqual(parseClock('21:30'), { hour: 21, minute: 30 });
  assert.deepEqual(parseClock('9:05'), { hour: 9, minute: 5 });
});

test('resolveMeetingDate: Tuesday→today, Wednesday→yesterday, else null', () => {
  assert.equal(resolveMeetingDate(new Date('2026-07-22T01:30:00Z')), '2026-07-21'); // Tue 9:30 PM ET
  assert.equal(resolveMeetingDate(new Date('2026-07-22T05:00:00Z')), '2026-07-21'); // Wed 1 AM ET
  assert.equal(resolveMeetingDate(new Date('2026-07-24T15:00:00Z')), null); // Friday
});
