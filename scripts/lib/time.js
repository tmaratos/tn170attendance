/**
 * Timezone-safe scheduling helpers for TN-170 automation.
 *
 * GitHub Actions cron is UTC and its delivery can be late by minutes OR hours.
 * These helpers reason in America/New_York WALL-CLOCK terms so that a run which
 * begins late still targets the correct Tuesday meeting exactly once (idempotency
 * lives elsewhere). Nothing here depends on the device/runner timezone.
 */

export const DEFAULT_TIMEZONE = 'America/New_York';
export const DEFAULT_MEETING_DAY = 'Tuesday';
export const DEFAULT_MEETING_END = '21:30'; // 9:30 PM
export const DEFAULT_REPORT_TIME = '22:30'; // 10:30 PM

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** Eastern (or given tz) calendar date, YYYY-MM-DD, for the given instant. */
export function zonedDateString(now, timeZone = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

/** Wall-clock parts (weekday, date, hour 0-23, minute) in the given tz. */
export function zonedParts(now, timeZone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const map = {};
  for (const part of parts) map[part.type] = part.value;
  // Intl can emit "24" for midnight in hour12:false; normalize to 0.
  const hour = Number(map.hour) % 24;
  return {
    weekday: map.weekday,
    date: `${map.year}-${map.month}-${map.day}`,
    hour,
    minute: Number(map.minute),
  };
}

/** Parse "HH:MM" into { hour, minute }. */
export function parseClock(timeStr, fallback = DEFAULT_MEETING_END) {
  const [h, m] = String(timeStr || fallback).split(':');
  return { hour: Number(h), minute: Number(m || 0) };
}

/** YYYY-MM-DD minus one calendar day (date-only math, DST-agnostic). */
export function previousDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d) - 86400000);
  return prev.toISOString().slice(0, 10);
}

/**
 * The meeting date (YYYY-MM-DD, Eastern) this automation run should act on.
 *
 * - Manual override wins.
 * - If it is currently the meeting day in ET, that is today's ET date.
 * - If it is the day AFTER the meeting day (a delayed Tue-night run that slipped
 *   into Wed ET), it is yesterday's ET date.
 * - Otherwise returns null (not a valid automation window without a force flag).
 */
export function resolveMeetingDate(now, {
  timeZone = DEFAULT_TIMEZONE,
  meetingDay = DEFAULT_MEETING_DAY,
  override = '',
} = {}) {
  const trimmed = String(override || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const { weekday, date } = zonedParts(now, timeZone);
  if (weekday === meetingDay) return date;

  const dayIndex = WEEKDAYS.indexOf(weekday);
  const meetingIndex = WEEKDAYS.indexOf(meetingDay);
  const dayAfterMeeting = (meetingIndex + 1) % 7;
  if (dayIndex === dayAfterMeeting) return previousDate(date);

  return null;
}

/**
 * Should the automation act now, tolerating multi-hour GitHub delivery delay?
 *
 * Window (Eastern wall-clock), for a threshold like 21:30:
 *   - meeting day, at or after HH:MM  → yes
 *   - the following morning (before `graceEndHour`, default noon) → yes
 *     (covers a Tue-night cron that GitHub delivered hours late, into Wed ET)
 *   - otherwise → no
 *
 * Returns { run: boolean, reason: string, meetingDate: string|null }.
 */
export function evaluateWindow(now, {
  timeZone = DEFAULT_TIMEZONE,
  meetingDay = DEFAULT_MEETING_DAY,
  thresholdTime = DEFAULT_MEETING_END,
  graceEndHour = 12,
  force = false,
  override = '',
} = {}) {
  const meetingDate = resolveMeetingDate(now, { timeZone, meetingDay, override });

  if (force) {
    return {
      run: true,
      reason: 'forced',
      meetingDate: meetingDate || zonedDateString(now, timeZone),
    };
  }

  const { weekday, hour, minute } = zonedParts(now, timeZone);
  const threshold = parseClock(thresholdTime, DEFAULT_MEETING_END);

  if (weekday === meetingDay) {
    const afterThreshold =
      hour > threshold.hour || (hour === threshold.hour && minute >= threshold.minute);
    if (afterThreshold) {
      return { run: true, reason: 'in-window', meetingDate };
    }
    return {
      run: false,
      reason: `before ${thresholdTime} on ${meetingDay}`,
      meetingDate,
    };
  }

  if (meetingDate) {
    // We are on the morning after the meeting day (a delayed run).
    if (hour < graceEndHour) {
      return { run: true, reason: 'delayed-catch-up', meetingDate };
    }
    return {
      run: false,
      reason: `past catch-up grace window (after ${graceEndHour}:00 the morning after)`,
      meetingDate,
    };
  }

  return { run: false, reason: `not ${meetingDay} (or the following morning)`, meetingDate: null };
}

/**
 * The UTC Date corresponding to a wall-clock time (HH:MM) on `dateStr` in `timeZone`.
 * Used to stamp force-checkout at the true meeting-end instant even when the job
 * runs late, so durations stay accurate.
 */
export function zonedWallTimeToUtc(dateStr, timeStr, timeZone = DEFAULT_TIMEZONE) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const { hour, minute } = parseClock(timeStr, DEFAULT_MEETING_END);
  const utcGuess = Date.UTC(y, mo - 1, d, hour, minute);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcGuess));
  const map = {};
  for (const part of parts) map[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
  );
  const offset = asUtc - utcGuess;
  return new Date(utcGuess - offset);
}

/** Human-readable Eastern time, e.g. "9:30 PM". */
export function zonedTimeLabel(now, timeZone = DEFAULT_TIMEZONE) {
  return now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  });
}
