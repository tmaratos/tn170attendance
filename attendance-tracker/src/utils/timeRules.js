export function isAfterSignOutReviewTime(date = new Date()) {
  const reviewTime = new Date(date);
  reviewTime.setHours(21, 0, 0, 0);
  return date >= reviewTime;
}

export function isAfterSystemForceCheckoutTime(date = new Date()) {
  const forceTime = new Date(date);
  forceTime.setHours(21, 30, 0, 0);
  return date >= forceTime;
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
