/*
  TN-170 Attendance Kiosk data layer
  ------------------------------------------------------------
  This file intentionally uses a local demo store so the UI can
  work before Firebase is connected.

  When Firebase is ready, replace this adapter with Firestore
  calls using the same exported functions.
*/

const STORAGE_KEY = 'tn170-attendance-demo-v1';

const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

const seed = {
  members: [
    {
      id: 'm-tristan',
      capid: '729204',
      fullName: 'Tristan G Maratos',
      memberType: 'Senior Member',
      activeStatus: 'Active',
      pin: '',
      adminRole: 'Attendance Admin',
    },
    {
      id: 'm-steven',
      capid: '326320',
      fullName: 'Steven C Mellard',
      memberType: 'Senior Member',
      activeStatus: 'Active',
      pin: '',
      adminRole: 'PIN Reset Admin',
    },
    {
      id: 'm-ernest',
      capid: '249023',
      fullName: 'Ernest E Burchell',
      memberType: 'Senior Member',
      activeStatus: 'Active',
      pin: '',
      adminRole: 'PIN Reset Admin',
    },
    {
      id: 'm-mel',
      capid: '702226',
      fullName: 'Mel W Osborne',
      memberType: 'Senior Member',
      activeStatus: 'Active',
      pin: '',
      adminRole: 'PIN Reset Admin',
    },
    {
      id: 'm-seth',
      capid: '712652',
      fullName: 'Seth Aubre Beers',
      memberType: 'Cadet',
      activeStatus: 'Active',
      pin: '',
      adminRole: 'None',
    },
  ],
  meetings: [
    {
      id: 'meeting-demo',
      name: 'Tuesday Squadron Meeting',
      date: today(),
      location: 'Oak Ridge Composite Squadron',
      status: 'Active',
      createdAt: nowIso(),
    },
  ],
  attendance: [],
  guests: [],
  guestAttendance: [],
  reportLogs: [],
};

function loadDb() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(seed);
  try {
    return JSON.parse(raw);
  } catch {
    return structuredClone(seed);
  }
}

function saveDb(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function publicMember(member) {
  const { pin, ...safe } = member;
  return safe;
}

function getActiveMeeting(db) {
  const active = db.meetings.filter((meeting) => meeting.status === 'Active');
  if (active.length !== 1) return null;
  return active[0];
}

function findMemberByCapid(db, capid) {
  return db.members.find((member) => member.capid === String(capid).trim());
}

function validateMember(db, capid, pin) {
  const member = findMemberByCapid(db, capid);
  if (!member) return { ok: false, message: 'Member not found. Please check your CAPID.' };
  if (member.activeStatus !== 'Active') return { ok: false, message: 'This member is inactive. Please see a senior member.' };
  if (!member.pin) return { ok: false, code: 'PIN_NOT_SET', message: 'PIN not set. Please create your PIN first.' };
  if (member.pin !== String(pin).trim()) return { ok: false, message: 'Incorrect PIN. No attendance record created.' };
  return { ok: true, member };
}

export function resetDemoData() {
  saveDb(structuredClone(seed));
}

export function getDashboardData() {
  const db = loadDb();
  const activeMeeting = getActiveMeeting(db);
  const openMemberAttendance = db.attendance.filter((row) => activeMeeting && row.meetingId === activeMeeting.id && !row.checkOutTime);
  const openGuestAttendance = db.guestAttendance.filter((row) => activeMeeting && row.meetingId === activeMeeting.id && !row.checkOutTime);

  return {
    activeMeeting,
    members: db.members.map(publicMember),
    currentlyCheckedIn: openMemberAttendance.map((row) => ({
      ...row,
      person: publicMember(db.members.find((member) => member.id === row.memberId)),
    })),
    currentlyCheckedInGuests: openGuestAttendance.map((row) => ({
      ...row,
      guest: db.guests.find((guest) => guest.id === row.guestId),
      host: publicMember(db.members.find((member) => member.id === row.hostMemberId)),
    })),
  };
}

export function createPin({ capid, newPin, confirmPin }) {
  const db = loadDb();
  const member = findMemberByCapid(db, capid);
  if (!member) return { ok: false, message: 'Member not found. Please check your CAPID.' };
  if (member.activeStatus !== 'Active') return { ok: false, message: 'This member is inactive. Please see a senior member.' };
  if (member.pin) return { ok: false, message: 'PIN already exists. Please see an authorized senior member if you forgot it.' };
  if (!/^\d{4}$/.test(String(newPin))) return { ok: false, message: 'PIN must be exactly 4 digits.' };
  if (String(newPin) !== String(confirmPin)) return { ok: false, message: 'PINs do not match.' };
  member.pin = String(newPin);
  member.pinSetStatus = 'Set';
  member.updatedAt = nowIso();
  saveDb(db);
  return { ok: true, message: 'PIN created successfully.' };
}

export function checkIn({ capid, pin }) {
  const db = loadDb();
  const validation = validateMember(db, capid, pin);
  if (!validation.ok) return validation;

  const meeting = getActiveMeeting(db);
  if (!meeting) return { ok: false, message: 'No active meeting is currently open.' };

  const open = db.attendance.find((row) => row.meetingId === meeting.id && row.memberId === validation.member.id && !row.checkOutTime);
  if (open) return { ok: false, message: 'You are already checked in.' };

  db.attendance.push({
    id: crypto.randomUUID(),
    memberId: validation.member.id,
    meetingId: meeting.id,
    checkInTime: nowIso(),
    checkOutTime: null,
    checkInMethod: 'Kiosk',
    checkOutMethod: null,
    attendanceStatus: 'Checked In',
    manualCorrection: false,
    correctionNotes: '',
  });
  saveDb(db);
  return { ok: true, message: `${validation.member.fullName} checked in successfully.` };
}

export function checkOut({ capid, pin }) {
  const db = loadDb();
  const validation = validateMember(db, capid, pin);
  if (!validation.ok) return validation;

  const meeting = getActiveMeeting(db);
  if (!meeting) return { ok: false, message: 'No active meeting is currently open.' };

  const open = db.attendance.find((row) => row.meetingId === meeting.id && row.memberId === validation.member.id && !row.checkOutTime);
  if (!open) return { ok: false, message: 'You are not currently checked in.' };

  open.checkOutTime = nowIso();
  open.checkOutMethod = 'Kiosk';
  open.attendanceStatus = 'Checked Out';
  saveDb(db);
  return { ok: true, message: `${validation.member.fullName} checked out successfully.` };
}

export function guestCheckIn({ guestName, hostCapid, hostPin }) {
  const db = loadDb();
  const hostValidation = validateMember(db, hostCapid, hostPin);
  if (!hostValidation.ok) return { ok: false, message: hostValidation.message.replace('Member', 'Host') };

  const meeting = getActiveMeeting(db);
  if (!meeting) return { ok: false, message: 'No active meeting is currently open.' };

  const normalizedName = String(guestName).trim().replace(/\s+/g, ' ');
  if (!normalizedName) return { ok: false, message: 'Guest name is required.' };

  let guest = db.guests.find((item) => item.fullName.toLowerCase() === normalizedName.toLowerCase());
  if (!guest) {
    guest = {
      id: crypto.randomUUID(),
      fullName: normalizedName,
      guestStatus: 'Active Guest',
      firstVisitDate: today(),
      lastVisitDate: today(),
      visitCount: 0,
      defaultHostMemberId: hostValidation.member.id,
      notes: '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.guests.push(guest);
  }

  const open = db.guestAttendance.find((row) => row.meetingId === meeting.id && row.guestId === guest.id && !row.checkOutTime);
  if (open) return { ok: false, message: 'Guest is already checked in.' };

  guest.lastVisitDate = today();
  guest.visitCount = Number(guest.visitCount || 0) + 1;
  guest.defaultHostMemberId = hostValidation.member.id;
  guest.updatedAt = nowIso();

  db.guestAttendance.push({
    id: crypto.randomUUID(),
    guestId: guest.id,
    guestNameSnapshot: guest.fullName,
    hostMemberId: hostValidation.member.id,
    meetingId: meeting.id,
    checkInTime: nowIso(),
    checkOutTime: null,
    attendanceStatus: 'Checked In',
    checkInMethod: 'Kiosk',
    checkOutMethod: null,
    confirmedByHost: hostValidation.member.id,
    hostVerificationTime: nowIso(),
    notes: '',
  });

  saveDb(db);
  return { ok: true, message: `${guest.fullName} checked in under ${hostValidation.member.fullName}.` };
}

export function guestSearch(query) {
  const db = loadDb();
  const q = String(query).trim().toLowerCase();
  if (!q) return [];
  return db.guests.filter((guest) => guest.fullName.toLowerCase().includes(q)).slice(0, 8);
}

export function downloadCsv() {
  const db = loadDb();
  const meeting = getActiveMeeting(db);
  const rows = [
    ['Meeting','Person Type','Full Name','CAPID','Member Type','Host Member','Check-In Time','Check-Out Time','Status'],
    ...db.attendance.map((row) => {
      const member = db.members.find((m) => m.id === row.memberId);
      const mtg = db.meetings.find((m) => m.id === row.meetingId);
      return [mtg?.name || '', 'Member', member?.fullName || '', member?.capid || '', member?.memberType || '', '', row.checkInTime, row.checkOutTime || '', row.attendanceStatus];
    }),
    ...db.guestAttendance.map((row) => {
      const guest = db.guests.find((g) => g.id === row.guestId);
      const host = db.members.find((m) => m.id === row.hostMemberId);
      const mtg = db.meetings.find((m) => m.id === row.meetingId);
      return [mtg?.name || '', 'Guest', guest?.fullName || row.guestNameSnapshot || '', '', 'Guest', host?.fullName || '', row.checkInTime, row.checkOutTime || '', row.attendanceStatus];
    }),
  ];

  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"','""')}"`).join(',')).join('\n');
  return csv;
}
