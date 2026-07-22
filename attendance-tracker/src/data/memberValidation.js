/**
 * Pure member-input validation shared by the roster-management service and tests.
 * These enforce the roster schema rules from the spec (no Firestore access here).
 */
import { isValidMemberGrade } from './rosterData.js';

export function validateCapid(capid) {
  const capidStr = String(capid ?? '').trim();
  if (!/^\d{6,8}$/.test(capidStr)) {
    throw new Error('CAPID must be 6–8 digits.');
  }
  return capidStr;
}

export function validateMemberNames(firstName, lastName) {
  const fn = String(firstName ?? '').trim();
  const ln = String(lastName ?? '').trim();
  if (!fn) throw new Error('First name is required.');
  if (!ln) throw new Error('Last name is required.');
  return { firstName: fn, lastName: ln };
}

export function validateMemberGrade(grade) {
  const gradeStr = String(grade ?? '').trim();
  if (!gradeStr) throw new Error('Grade/rank is required.');
  if (!isValidMemberGrade(gradeStr)) throw new Error('Select a valid grade/rank from the list.');
  return gradeStr;
}

/** Validate a full new-member input; throws on the first problem. */
export function validateNewMemberInput({ capid, firstName, middleName = '', lastName, grade }) {
  const validCapid = validateCapid(capid);
  const names = validateMemberNames(firstName, lastName);
  const validGrade = validateMemberGrade(grade);
  return {
    capid: validCapid,
    firstName: names.firstName,
    middleName: String(middleName ?? '').trim(),
    lastName: names.lastName,
    grade: validGrade,
  };
}
