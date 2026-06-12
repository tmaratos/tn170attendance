export const DEFAULT_SETTINGS = {
  squadronName: 'Oak Ridge Composite Squadron',
  squadronDesignator: 'TN-170',
  charterNumber: 'SER-TN-170',
  motto: 'Not Without Effort',
  adminPin: '0000',
  meetingDay: 'Tuesday',
  meetingStart: '18:30',
  meetingEnd: '21:30',
};

export const MOCK_MEMBERS = [
  { id: '1', name: 'John Smith', grade: 'Capt', capid: '123456', role: 'Senior Member', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:32:00', checkOutTime: null },
  { id: '2', name: 'Sarah Johnson', grade: 'Maj', capid: '234567', role: 'Senior Member', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:28:00', checkOutTime: null },
  { id: '3', name: 'Michael Davis', grade: '1st Lt', capid: '345678', role: 'Senior Member', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:35:00', checkOutTime: null },
  { id: '4', name: 'Emily Wilson', grade: '2d Lt', capid: '456789', role: 'Senior Member', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:40:00', checkOutTime: null },
  { id: '5', name: 'Robert Brown', grade: 'SM', capid: '567890', role: 'Senior Member', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:25:00', checkOutTime: null },
  { id: '6', name: 'Jennifer Martinez', grade: 'SM', capid: '678901', role: 'Senior Member', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:30:00', checkOutTime: null },
  { id: '7', name: 'David Anderson', grade: 'Capt', capid: '789012', role: 'Senior Member', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:33:00', checkOutTime: null },
  { id: '8', name: 'Lisa Thompson', grade: '1st Lt', capid: '890123', role: 'Senior Member', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:38:00', checkOutTime: null },
  { id: '9', name: 'James Garcia', grade: '2d Lt', capid: '901234', role: 'Senior Member', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:42:00', checkOutTime: null },
  { id: '10', name: 'Patricia Lee', grade: 'SM', capid: '012345', role: 'Senior Member', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:29:00', checkOutTime: null },
  { id: '11', name: 'William Taylor', grade: 'Maj', capid: '112233', role: 'Senior Member', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:31:00', checkOutTime: null },
  { id: '12', name: 'Maria Rodriguez', grade: 'SM', capid: '223344', role: 'Senior Member', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:36:00', checkOutTime: null },
  { id: '13', name: 'Richard White', grade: '1st Lt', capid: '334455', role: 'Senior Member', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:34:00', checkOutTime: null },
  { id: '14', name: 'Susan Harris', grade: 'SM', capid: '445566', role: 'Senior Member', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:37:00', checkOutTime: null },
  { id: '15', name: 'Joseph Clark', grade: '2d Lt', capid: '556677', role: 'Senior Member', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:39:00', checkOutTime: null },
  { id: '16', name: 'Aiden Thompson', grade: 'C/MSgt', capid: '667788', role: 'Cadet', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:20:00', checkOutTime: null },
  { id: '17', name: 'Emma Wilson', grade: 'C/TSgt', capid: '778899', role: 'Cadet', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:45:00', checkOutTime: null },
  { id: '18', name: 'Noah Martinez', grade: 'C/SSgt', capid: '889900', role: 'Cadet', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:46:00', checkOutTime: null },
  { id: '19', name: 'Olivia Davis', grade: 'C/SrA', capid: '990011', role: 'Cadet', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:47:00', checkOutTime: null },
  { id: '20', name: 'Liam Anderson', grade: 'C/A1C', capid: '101112', role: 'Cadet', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:48:00', checkOutTime: null },
  { id: '21', name: 'Sophia Brown', grade: 'C/Amn', capid: '121314', role: 'Cadet', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:49:00', checkOutTime: null },
  { id: '22', name: 'Mason Garcia', grade: 'C/2d Lt', capid: '131415', role: 'Cadet', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:50:00', checkOutTime: null },
  { id: '23', name: 'Isabella Lee', grade: 'C/MSgt', capid: '141516', role: 'Cadet', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:51:00', checkOutTime: null },
  { id: '24', name: 'Ethan Taylor', grade: 'C/TSgt', capid: '151617', role: 'Cadet', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:52:00', checkOutTime: null },
  { id: '25', name: 'Ava Rodriguez', grade: 'C/SSgt', capid: '161718', role: 'Cadet', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:53:00', checkOutTime: null },
  { id: '26', name: 'Jackson White', grade: 'C/SrA', capid: '171819', role: 'Cadet', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:54:00', checkOutTime: null },
  { id: '27', name: 'Mia Harris', grade: 'C/A1C', capid: '181920', role: 'Cadet', pin: '1234', status: 'checked-in', checkInTime: '2025-05-20T18:55:00', checkOutTime: null },
  { id: '28', name: 'Lucas Clark', grade: 'C/Amn', capid: '192021', role: 'Cadet', pin: '1234', status: 'checked-out', checkInTime: '2025-05-20T18:15:00', checkOutTime: '2025-05-20T19:05:00' },
  { id: '29', name: 'Charlotte Moore', grade: 'C/MSgt', capid: '202122', role: 'Cadet', pin: '1234', status: 'checked-out', checkInTime: '2025-05-20T18:18:00', checkOutTime: '2025-05-20T19:08:00' },
  { id: '30', name: 'Benjamin Lewis', grade: 'C/TSgt', capid: '212223', role: 'Cadet', pin: '1234', status: 'checked-out', checkInTime: '2025-05-20T18:22:00', checkOutTime: '2025-05-20T19:12:00' },
  { id: '31', name: 'Amelia Walker', grade: 'C/SSgt', capid: '222324', role: 'Cadet', pin: '1234', status: 'checked-out', checkInTime: '2025-05-20T18:24:00', checkOutTime: '2025-05-20T19:15:00' },
  { id: '32', name: 'Henry Hall', grade: 'C/SrA', capid: '232425', role: 'Cadet', pin: '1234', status: 'checked-out', checkInTime: '2025-05-20T18:26:00', checkOutTime: '2025-05-20T19:18:00' },
  { id: '33', name: 'Evelyn Allen', grade: 'C/A1C', capid: '242526', role: 'Cadet', pin: '1234', status: 'checked-out', checkInTime: '2025-05-20T18:27:00', checkOutTime: '2025-05-20T19:20:00' },
  { id: '34', name: 'Alexander Young', grade: 'C/Amn', capid: '252627', role: 'Cadet', pin: '1234', status: 'checked-out', checkInTime: '2025-05-20T18:28:00', checkOutTime: '2025-05-20T19:22:00' },
  { id: '35', name: 'Harper King', grade: 'C/2d Lt', capid: '262728', role: 'Cadet', pin: '1234', status: 'checked-out', checkInTime: '2025-05-20T18:30:00', checkOutTime: '2025-05-20T19:25:00' },
  { id: '36', name: 'Daniel Wright', grade: 'C/MSgt', capid: '272829', role: 'Cadet', pin: '1234', status: 'checked-out', checkInTime: '2025-05-20T18:32:00', checkOutTime: '2025-05-20T19:28:00' },
];

export const MOCK_GUESTS = [
  { id: 'g1', name: 'Alex Rivera', hostId: '1', hostName: 'John Smith', checkInTime: '2025-05-20T18:50:00', checkOutTime: null, status: 'checked-in', firstVisit: '2025-04-15', lastVisit: '2025-05-20', totalVisits: 3 },
  { id: 'g2', name: 'Jordan Kim', hostId: '2', hostName: 'Sarah Johnson', checkInTime: '2025-05-20T19:00:00', checkOutTime: null, status: 'checked-in', firstVisit: '2025-05-01', lastVisit: '2025-05-20', totalVisits: 2 },
  { id: 'g3', name: 'Taylor Brooks', hostId: '5', hostName: 'Robert Brown', checkInTime: '2025-05-20T19:05:00', checkOutTime: null, status: 'checked-in', firstVisit: '2025-05-20', lastVisit: '2025-05-20', totalVisits: 1 },
];

export const MOCK_ACTIVITY = [
  { id: 'a1', message: 'John Smith checked in', timestamp: '2025-05-20T18:32:00', type: 'check-in' },
  { id: 'a2', message: 'Aiden Thompson checked out', timestamp: '2025-05-20T19:10:00', type: 'check-out' },
  { id: 'a3', message: 'Alex Rivera (Guest) checked in', timestamp: '2025-05-20T18:50:00', type: 'guest-in' },
  { id: 'a4', message: 'Emma Wilson checked in', timestamp: '2025-05-20T18:45:00', type: 'check-in' },
  { id: 'a5', message: 'Jordan Kim (Guest) checked in', timestamp: '2025-05-20T19:00:00', type: 'guest-in' },
];

export function formatTime(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function formatDateTime(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDuration(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '—';
  const ms = new Date(checkOut) - new Date(checkIn);
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function getInitials(name) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function isMeetingInProgress(settings) {
  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (dayNames[now.getDay()] !== settings.meetingDay) return false;

  const [startH, startM] = settings.meetingStart.split(':').map(Number);
  const [endH, endM] = settings.meetingEnd.split(':').map(Number);
  const start = new Date(now);
  start.setHours(startH, startM, 0, 0);
  const end = new Date(now);
  end.setHours(endH, endM, 0, 0);
  return now >= start && now <= end;
}

export function formatMeetingTime(time24) {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}
