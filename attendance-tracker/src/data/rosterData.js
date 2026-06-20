/** Legacy fallback CAPIDs for offline Spark kiosk (all seniors are admins via isSeniorMember). */
export const ADMIN_CAPIDS = new Set([
  '326320', // Maj Steven C Mellard
  '249023', // 1st Lt Ernest E Burchell
  '757794', // 2d Lt Tonya M Osborne
  '702226', // 1st Lt Mel W Osborne
  '740617', // 2d Lt Tyler M Thomas
  '729204', // 2d Lt Tristan G Maratos
]);

const ROSTER_LINES = `
362254 Maj Lemont T Adrian
706279 2d Lt Janelle C Allison
712652 C/CMSgt Seth Aubre Beers
754819 C/SrA Jordan Gavin Botts
249023 1st Lt Ernest E Burchell
775740 CADET Isaac T Cannon
743307 C/SrA Karlie Chase
744144 2d Lt Rebecca J Chretien
744143 2d Lt Everett J Chretien
721598 C/SrA Lily Grace Cole
759751 C/A1C Aiden Bryce Cooper
766637 SM Guy R Cooper
743923 C/A1C Ethan Moses Corey
764706 SM Andrew Diaz
763051 CADET Adalynn Calli Duncan
735120 2d Lt Margaret A Durgin
731444 C/SrA Alexis Mahalia Hackworth
766638 SM Amanda L Harvey
759756 C/A1C Cali Mae Harvey
759753 C/A1C Madelyn Pearl Harvey
760274 C/Amn Owen Grant Hunt
411177 1st Lt Zachary D Johnson Jr
711242 C/CMSgt Hope Mariah Johnson
450227 Maj Clarence M Juneau
725171 C/A1C Emma Rose Kirby
778674 CADET Lucas Joseph Manuel
729204 2d Lt Tristan G Maratos
326320 Maj Steven C Mellard
736465 SM Desiree Morse
750086 C/SrA Matthew A Newman
757794 2d Lt Tonya M Osborne
702226 1st Lt Mel W Osborne
776446 CADET Lillionya Lamae Pinkerton
719566 C/SMSgt Marley Amaris Puska
621484 SM Sandra L Puska
754798 C/A1C Silas Rivers Puska
739522 C/SrA Andrew Schwartzenberger
744012 C/SrA Jocelyn Elizabeth Slagle
712573 C/SrA Angelina Kylie Smith
735480 C/CMSgt Thomas Morgan Stratton
577946 1st Lt Annabelle Thomas
740617 2d Lt Tyler M Thomas
778696 CADET Joshua-jaden Thomas
735602 C/SrA Logan Allen Viars
270831 Maj Timothy S Waddell
744650 C/SrA Gideon Michael Zeal Waldroup
743315 C/SrA Reagan Rockwell Waldroup
657945 2d Lt Anthony A Warthan
662670 2d Lt Colleen J Warthan
702416 C/TSgt Garrett Tage Warthan
738555 SM Jesse W Wilkie
734587 C/MSgt Tucker Reed Wilkie
`.trim().split('\n').map((l) => l.trim()).filter(Boolean);

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

function memberIsSenior(memberDoc) {
  if (!memberDoc) return false;
  if (memberDoc.isProspective) return false;
  if (memberDoc.isSeniorMember) return true;
  if (memberDoc.role === 'Senior Member') return true;
  if (memberDoc.isCadet || memberDoc.role === 'Cadet') return false;
  const grade = String(memberDoc.grade || '').toUpperCase();
  return !grade.startsWith('C/') && grade !== 'CADET';
}

/** Merge Firestore member fields with senior-member admin defaults (Spark kiosk fallback). */
export function resolveMemberAdminPermissions(memberDoc) {
  const capid = String(memberDoc?.capid || memberDoc?.memberId || '');
  const isSenior = memberIsSenior(memberDoc);
  const isAdmin = isSenior || ADMIN_CAPIDS.has(capid) || !!memberDoc?.isAdmin;
  return {
    isAdmin,
    canForceAttendance: isAdmin || !!memberDoc?.canForceAttendance,
    canResetPins: isAdmin || !!memberDoc?.canResetPins,
    canExportReports: isAdmin || !!memberDoc?.canExportReports,
    canManageMembers: isAdmin || !!memberDoc?.canManageMembers,
    canManageGuests: isAdmin || !!memberDoc?.canManageGuests,
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

/** Firestore-shaped member docs for kiosk fallback when cloud roster is empty. */
export function getEmbeddedRosterMembers() {
  return ROSTER_LINES.map(parseRosterLine);
}

/** UI-shaped roster members with no attendance (offline / mock mode). */
export function buildEmptyMembersFromRoster() {
  return getEmbeddedRosterMembers().map((member) => ({
    id: member.capid,
    name: member.displayName,
    grade: member.grade,
    capid: member.capid,
    role: member.role,
    pin: '',
    isAdmin: member.isAdmin,
    status: 'absent',
    checkInTime: null,
    checkOutTime: null,
  }));
}

/** Empty localStorage payload for Spark kiosk mode (PINs live in Firestore). */
export function buildEmptyKioskLocalState() {
  return {
    pins: {},
    attendance: {},
    guests: [],
    activity: [],
    recurringGuests: [],
  };
}

export const ROSTER_MEMBER_COUNT = ROSTER_LINES.length;
