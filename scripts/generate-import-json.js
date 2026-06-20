/**
 * Generate Firestore import JSON for browser/REST bulk upload.
 * Usage: node scripts/generate-import-json.js > data/firestore-import.json
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DEFAULT_ROSTER = readFileSync(join(ROOT, 'data', 'roster.txt'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseGradeAndName(tokens) {
  let gradeEnd = 2;
  if ((tokens[1] === '1st' || tokens[1] === '2d') && tokens[2] === 'Lt') {
    gradeEnd = 3;
  }
  const grade = tokens.slice(1, gradeEnd).join(' ');
  const nameTokens = tokens.slice(gradeEnd);
  const firstName = nameTokens[0] || '';
  const lastName = nameTokens.length > 1 ? nameTokens[nameTokens.length - 1] : firstName;
  const middleName = nameTokens.length > 2 ? nameTokens.slice(1, -1).join(' ') : '';
  const fullName = nameTokens.join(' ');
  const displayName = middleName
    ? `${firstName} ${middleName} ${lastName}`
    : `${firstName} ${lastName}`;
  return { grade, firstName, middleName, lastName, fullName, displayName };
}

function parseRole(grade) {
  const upper = grade.toUpperCase();
  if (upper.startsWith('C/') || upper === 'CADET') {
    return { role: 'Cadet', isCadet: true, isSeniorMember: false };
  }
  return { role: 'Senior Member', isCadet: false, isSeniorMember: true };
}

function buildPermissions(_capid, isSenior) {
  return {
    isAdmin: isSenior,
    canForceAttendance: isSenior,
    canResetPins: isSenior,
    canExportReports: isSenior,
    canManageMembers: isSenior,
    canManageGuests: isSenior,
  };
}

function parseRosterLine(line) {
  const tokens = line.split(/\s+/);
  const capid = tokens[0];
  const { grade, firstName, middleName, lastName, fullName, displayName } = parseGradeAndName(tokens);
  const roleInfo = parseRole(grade);
  const isSenior = roleInfo.isSeniorMember;
  const permissions = buildPermissions(capid, isSenior);

  return {
    memberId: capid,
    capid,
    temporaryId: null,
    grade,
    firstName,
    middleName,
    lastName,
    fullName,
    displayName,
    normalizedName: normalizeName(displayName),
    ...roleInfo,
    isProspective: false,
    hasPin: false,
    pinResetRequired: false,
    active: true,
    ...permissions,
  };
}

const now = new Date().toISOString();
const members = DEFAULT_ROSTER.map(parseRosterLine).map((m) => ({
  ...m,
  createdAt: now,
  updatedAt: now,
}));

const settings = {
  squadronName: 'Oak Ridge Composite Squadron',
  squadronDesignator: 'TN-170',
  motto: 'Not Without Effort',
  meetingDay: 'Tuesday',
  meetingStart: '18:30',
  meetingEnd: '21:30',
  updatedAt: now,
};

const output = { members, settings };
const outPath = join(ROOT, 'data', 'firestore-import.json');
writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`Wrote ${members.length} members + settings to ${outPath}`);
