export function parseMeetingClockTime(timeStr, date = new Date()) {
  const [hour, minute] = String(timeStr || '21:30').split(':').map(Number);
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

export function isAfterSignOutReviewTime(date = new Date(), meetingEnd = '21:30') {
  const endTime = parseMeetingClockTime(meetingEnd, date);
  const reviewTime = new Date(endTime);
  reviewTime.setMinutes(reviewTime.getMinutes() - 30);
  return date >= reviewTime;
}

/** True at or after configured meeting end (default 9:30 PM local device time). */
export function isAfterSystemForceCheckoutTime(date = new Date(), meetingEnd = '21:30') {
  return date >= parseMeetingClockTime(meetingEnd, date);
}

export function getMeetingStatus(settings, date = new Date()) {
  const [startHour, startMinute] = settings.meetingStart.split(':').map(Number);
  const [endHour, endMinute] = settings.meetingEnd.split(':').map(Number);
  const start = new Date(date);
  const end = new Date(date);
  start.setHours(startHour, startMinute, 0, 0);
  end.setHours(endHour, endMinute, 0, 0);

  if (date >= start && date <= end) return 'Meeting In Progress';
  if (date > end) return 'Meeting Closed';
  return 'Meeting Scheduled';
}

export function formatLocalDate(date = new Date()) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatLocalTime(date = new Date()) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}
