import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeScan, routeLicenceName } from '../attendance-tracker/src/services/scanRouting.js';

const members = [
  { id: '362254', capid: '362254', name: 'Lemont T Adrian', role: 'Senior Member' },
  { id: '706279', capid: '706279', firstName: 'Janelle', lastName: 'Allison', name: 'Janelle C Allison' },
  { id: '111111', capid: '111111', name: 'Chris Taylor' },
  { id: '222222', capid: '222222', name: 'Chris Taylor' },
];

test('a CAP badge routes to the existing CAPID path', () => {
  const decision = routeScan({ type: 'cap-id', capid: '706279' }, { members, guests: [] });
  assert.deepEqual(decision, { kind: 'cap-id', capid: '706279' });
});

test('a licence name matching a member routes to member attendance, not a guest record', () => {
  const decision = routeLicenceName({ firstName: 'Janelle', lastName: 'Allison' }, { members, guests: [] });
  assert.equal(decision.kind, 'member');
  assert.equal(decision.member.capid, '706279');
});

test('a member with a middle name still matches on first and last only', () => {
  const decision = routeLicenceName({ firstName: 'Lemont', lastName: 'Adrian' }, { members, guests: [] });
  assert.equal(decision.kind, 'member');
  assert.equal(decision.member.capid, '362254');
});

test('matching is case- and whitespace-insensitive', () => {
  const decision = routeLicenceName({ firstName: '  jANELLE ', lastName: 'allison' }, { members, guests: [] });
  assert.equal(decision.kind, 'member');
});

test('duplicate roster names are never guessed — staff must choose', () => {
  const decision = routeLicenceName({ firstName: 'Chris', lastName: 'Taylor' }, { members, guests: [] });
  assert.equal(decision.kind, 'member-ambiguous');
  assert.equal(decision.matches.length, 2);
});

test('15. a licence with no roster match and no open visit checks a guest in', () => {
  const decision = routeLicenceName({ firstName: 'Bob', lastName: 'Williams' }, { members, guests: [] });
  assert.deepEqual(decision, { kind: 'guest-check-in', firstName: 'Bob', lastName: 'Williams' });
});

test('15b. scanning again while a visit is open checks that guest out', () => {
  const guests = [{ id: 'g1', name: 'Bob Williams', status: 'checked-in', checkInTime: '2026-09-18T22:42:00Z' }];
  const decision = routeLicenceName({ firstName: 'Bob', lastName: 'Williams' }, { members, guests });
  assert.equal(decision.kind, 'guest-check-out');
  assert.equal(decision.visit.id, 'g1');
});

test('16. scanning after the previous visit closed creates a new visit', () => {
  const guests = [{ id: 'g1', name: 'Bob Williams', status: 'checked-out', checkInTime: '2026-09-18T22:42:00Z' }];
  const decision = routeLicenceName({ firstName: 'Bob', lastName: 'Williams' }, { members, guests });
  assert.equal(decision.kind, 'guest-check-in');
});

test('17. duplicate open guest names trigger staff selection', () => {
  const guests = [
    { id: 'g1', name: 'Bob Williams', status: 'checked-in', checkInTime: '2026-09-18T22:42:00Z' },
    { id: 'g2', name: 'Bob Williams', status: 'checked-in', checkInTime: '2026-09-18T23:10:00Z' },
  ];
  const decision = routeLicenceName({ firstName: 'Bob', lastName: 'Williams' }, { members, guests });
  assert.equal(decision.kind, 'guest-ambiguous');
  assert.equal(decision.visits.length, 2);
});

test('an unrecognized scan routes to unknown', () => {
  assert.equal(routeScan({ type: 'unknown', raw: 'SKU-1234' }, { members }).kind, 'unknown');
  assert.equal(routeScan({ type: 'drivers-license' }, { members }).kind, 'unknown');
  assert.equal(routeLicenceName({ firstName: '', lastName: '' }, { members }).kind, 'unknown');
});

test('20/24. a routing decision carries no licence payload', () => {
  const scan = {
    type: 'drivers-license',
    raw: '@ANSI 636000DLDAQT64235789DCSWILLIAMSDACBOBDBB01151990DAG123 MAIN ST',
    name: { firstName: 'Bob', lastName: 'Williams' },
  };
  const decision = routeScan(scan, { members, guests: [] });
  const serialized = JSON.stringify(decision);
  for (const secret of ['T64235789', '01151990', '123 MAIN ST', 'ANSI', 'DAQ', 'DCS']) {
    assert.equal(serialized.includes(secret), false, `leaked ${secret}`);
  }
  assert.deepEqual(decision, { kind: 'guest-check-in', firstName: 'Bob', lastName: 'Williams' });
});
