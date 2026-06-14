import { hashKioskPinSync } from '../utils/kioskPin';

/** CAPIDs with admin permissions (matches scripts/seed-members.js). */
export const ADMIN_CAPIDS = new Set([
  '326320', // Maj Steven C Mellard
  '249023', // 1st Lt Ernest E Burchell
  '757794', // 2d Lt Tonya M Osborne
  '702226', // 1st Lt Mel W Osborne
  '740617', // 2d Lt Tyler M Thomas
  '729204', // 2d Lt Tristan G Maratos
]);

export const TEST_PIN = '1234';

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

function buildPermissions(capid, isSenior) {
  const isAdmin = ADMIN_CAPIDS.has(capid);
  return {
    isAdmin,
    canForceAttendance: isAdmin,
    canResetPins: isAdmin,
    canExportReports: isSenior || isAdmin,
    canManageMembers: isAdmin,
    canManageGuests: isSenior || isAdmin,
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

function meetingIso(hour, minute, minuteOffset = 0) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute + minuteOffset, 0);
  return d.toISOString();
}

/** Firestore-shaped member docs for kiosk fallback when cloud roster is empty. */
export function getEmbeddedRosterMembers() {
  return ROSTER_LINES.map(parseRosterLine);
}

/** UI-shaped members with sample attendance for mock / offline mode. */
export function buildMockMembersFromRoster() {
  const firestoreMembers = getEmbeddedRosterMembers();
  return firestoreMembers.map((member, index) => {
    let status = 'absent';
    let checkInTime = null;
    let checkOutTime = null;

    if (index < 30) {
      status = 'checked-in';
      checkInTime = meetingIso(18, 25 + (index % 25));
    } else if (index < 40) {
      status = 'checked-out';
      checkInTime = meetingIso(18, 15 + (index % 15));
      checkOutTime = meetingIso(19, 5 + (index % 20));
    }

    return {
      id: member.capid,
      name: member.displayName,
      grade: member.grade,
      capid: member.capid,
      role: member.role,
      pin: TEST_PIN,
      isAdmin: member.isAdmin,
      status,
      checkInTime,
      checkOutTime,
    };
  });
}

export function buildSampleGuests(membersByCapid) {
  const host1 = membersByCapid['326320'];
  const host2 = membersByCapid['249023'];
  const host3 = membersByCapid['740617'];
  const today = new Date().toISOString().split('T')[0];

  return [
    {
      id: 'g1',
      name: 'Alex Rivera',
      hostId: '326320',
      hostName: host1?.displayName || 'Steven C Mellard',
      checkInTime: meetingIso(18, 50),
      checkOutTime: null,
      status: 'checked-in',
      firstVisit: '2025-04-15',
      lastVisit: today,
      totalVisits: 3,
    },
    {
      id: 'g2',
      name: 'Jordan Kim',
      hostId: '249023',
      hostName: host2?.displayName || 'Ernest E Burchell',
      checkInTime: meetingIso(19, 0),
      checkOutTime: null,
      status: 'checked-in',
      firstVisit: '2025-05-01',
      lastVisit: today,
      totalVisits: 2,
    },
    {
      id: 'g3',
      name: 'Taylor Brooks',
      hostId: '740617',
      hostName: host3?.displayName || 'Tyler M Thomas',
      checkInTime: meetingIso(19, 5),
      checkOutTime: null,
      status: 'checked-in',
      firstVisit: today,
      lastVisit: today,
      totalVisits: 1,
    },
  ];
}

export function buildSampleActivity() {
  return [
    { id: 'a1', message: 'Steven C Mellard checked in', timestamp: meetingIso(18, 32), type: 'check-in' },
    { id: 'a2', message: 'Tucker Reed Wilkie checked out', timestamp: meetingIso(19, 10), type: 'check-out' },
    { id: 'a3', message: 'Alex Rivera (Guest) checked in', timestamp: meetingIso(18, 50), type: 'guest-in' },
    { id: 'a4', message: 'Hope Mariah Johnson checked in', timestamp: meetingIso(18, 45), type: 'check-in' },
    { id: 'a5', message: 'Jordan Kim (Guest) checked in', timestamp: meetingIso(19, 0), type: 'guest-in' },
  ];
}

/** Initial localStorage payload for Spark kiosk mode (PINs + tonight's attendance). */
export function buildInitialKioskLocalState() {
  const members = getEmbeddedRosterMembers();
  const pins = {};
  const attendance = {};

  members.forEach((member, index) => {
    const capid = String(member.capid);
    pins[capid] = hashKioskPinSync(TEST_PIN, capid);

    if (index < 30) {
      attendance[capid] = {
        status: 'checked-in',
        checkInTime: meetingIso(18, 25 + (index % 25)),
        checkOutTime: null,
        forceAction: false,
        forceType: null,
        forceNote: null,
      };
    } else if (index < 40) {
      attendance[capid] = {
        status: 'checked-out',
        checkInTime: meetingIso(18, 15 + (index % 15)),
        checkOutTime: meetingIso(19, 5 + (index % 20)),
        forceAction: false,
        forceType: null,
        forceNote: null,
      };
    }
  });

  const membersByCapid = Object.fromEntries(members.map((m) => [m.capid, m]));

  return {
    pins,
    attendance,
    guests: buildSampleGuests(membersByCapid),
    activity: buildSampleActivity(),
    recurringGuests: [],
  };
}

export const ROSTER_MEMBER_COUNT = ROSTER_LINES.length;
