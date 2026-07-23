import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMemberDocument,
  parseRole,
  isValidMemberGrade,
  resolveMemberAdminPermissions,
  normalizeName,
  CADET_GRADES,
  SENIOR_GRADES,
} from '../attendance-tracker/src/data/rosterData.js';
import {
  validateCapid,
  validateMemberNames,
  validateMemberGrade,
  validateNewMemberInput,
} from '../attendance-tracker/src/data/memberValidation.js';

test('validateCapid enforces 6–8 digits, numeric only', () => {
  assert.equal(validateCapid('123456'), '123456');
  assert.equal(validateCapid('12345678'), '12345678');
  assert.equal(validateCapid('  729204 '), '729204', 'trims');
  assert.throws(() => validateCapid('12345'), /6–8 digits/, 'too short');
  assert.throws(() => validateCapid('123456789'), /6–8 digits/, 'too long');
  assert.throws(() => validateCapid('12a456'), /6–8 digits/, 'non-numeric');
  assert.throws(() => validateCapid(''), /6–8 digits/);
});

test('validateMemberNames requires first and last', () => {
  assert.deepEqual(validateMemberNames('Jane', 'Doe'), { firstName: 'Jane', lastName: 'Doe' });
  assert.throws(() => validateMemberNames('', 'Doe'), /First name is required/);
  assert.throws(() => validateMemberNames('Jane', ''), /Last name is required/);
});

test('validateMemberGrade accepts approved grades, rejects others', () => {
  assert.equal(validateMemberGrade('CADET'), 'CADET');
  assert.equal(validateMemberGrade('Maj'), 'Maj');
  assert.throws(() => validateMemberGrade('General'), /valid grade/);
  assert.throws(() => validateMemberGrade(''), /required/);
});

test('every cadet grade builds a Cadet with no admin permissions', () => {
  for (const grade of CADET_GRADES) {
    assert.ok(isValidMemberGrade(grade), `${grade} is valid`);
    const doc = buildMemberDocument({ capid: '775740', firstName: 'Test', lastName: 'Cadet', grade });
    assert.equal(doc.role, 'Cadet', grade);
    assert.equal(doc.isCadet, true, grade);
    assert.equal(doc.isSeniorMember, false, grade);
    assert.equal(doc.isAdmin, false, grade);
    assert.equal(doc.canManageMembers, false, grade);
    assert.equal(doc.canForceAttendance, false, grade);
    // New-member invariants (match the spec + Firestore rules).
    assert.equal(doc.active, true);
    assert.equal(doc.hasPin, false);
    assert.equal(doc.pinResetRequired, false);
    assert.equal(doc.isProspective, false);
    assert.equal(doc.temporaryId, null);
  }
});

test('every senior grade builds a Senior Member with admin permissions', () => {
  for (const grade of SENIOR_GRADES) {
    const doc = buildMemberDocument({ capid: '326320', firstName: 'Test', lastName: 'Senior', grade });
    assert.equal(doc.role, 'Senior Member', grade);
    assert.equal(doc.isCadet, false, grade);
    assert.equal(doc.isSeniorMember, true, grade);
    assert.equal(doc.isAdmin, true, grade);
    assert.equal(doc.canManageMembers, true, grade);
  }
});

test('buildMemberDocument handles blank and present middle name', () => {
  const noMiddle = buildMemberDocument({ capid: '111111', firstName: 'Jane', lastName: 'Doe', grade: 'CADET' });
  assert.equal(noMiddle.fullName, 'Jane Doe');
  assert.equal(noMiddle.displayName, 'Jane Doe');
  assert.equal(noMiddle.middleName, '');

  const withMiddle = buildMemberDocument({ capid: '111111', firstName: 'Jane', middleName: 'Q', lastName: 'Doe', grade: 'CADET' });
  assert.equal(withMiddle.fullName, 'Jane Q Doe');
  assert.equal(withMiddle.normalizedName, 'jane q doe');
});

test('parseRole distinguishes cadet vs senior grades', () => {
  assert.deepEqual(parseRole('C/SrA'), { role: 'Cadet', isCadet: true, isSeniorMember: false });
  assert.deepEqual(parseRole('CADET'), { role: 'Cadet', isCadet: true, isSeniorMember: false });
  assert.deepEqual(parseRole('SM'), { role: 'Senior Member', isCadet: false, isSeniorMember: true });
  assert.deepEqual(parseRole('1st Lt'), { role: 'Senior Member', isCadet: false, isSeniorMember: true });
});

test('resolveMemberAdminPermissions: seniors admin, cadets not, doc flag honored', () => {
  assert.equal(resolveMemberAdminPermissions({ capid: '326320', isSeniorMember: true }).isAdmin, true);
  assert.equal(resolveMemberAdminPermissions({ capid: '775740', isCadet: true, role: 'Cadet' }).isAdmin, false);
  // Known-admin CAPID fallback (offline).
  assert.equal(resolveMemberAdminPermissions({ capid: '729204' }).isAdmin, true);
});

test('validateNewMemberInput composes all validators', () => {
  const out = validateNewMemberInput({ capid: '775740', firstName: 'Jane', middleName: ' ', lastName: 'Doe', grade: 'CADET' });
  assert.deepEqual(out, { capid: '775740', firstName: 'Jane', middleName: '', lastName: 'Doe', grade: 'CADET' });
  assert.throws(() => validateNewMemberInput({ capid: '12', firstName: 'A', lastName: 'B', grade: 'CADET' }), /6–8 digits/);
  assert.throws(() => validateNewMemberInput({ capid: '775740', firstName: 'A', lastName: 'B', grade: 'Colonel' }), /valid grade/);
});

test('normalizeName lowercases and collapses whitespace', () => {
  assert.equal(normalizeName('  Jane   Q   Doe '), 'jane q doe');
});
