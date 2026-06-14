import {
  buildEmptyMembersFromRoster,
  buildEmptyKioskLocalState,
  getEmbeddedRosterMembers,
  ROSTER_MEMBER_COUNT,
} from './rosterData';

export {
  getEmbeddedRosterMembers,
  buildEmptyKioskLocalState,
  buildEmptyMembersFromRoster,
  ROSTER_MEMBER_COUNT,
};

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

export const MOCK_MEMBERS = buildEmptyMembersFromRoster();

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
