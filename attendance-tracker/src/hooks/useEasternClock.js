import { useEffect, useState } from 'react';

const TZ = 'America/New_York';

/**
 * Live clock in America/New_York (Eastern), independent of the device timezone —
 * the kiosk must always display Eastern schedule/time, never the local device zone.
 */
export function useEasternClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const map = {};
  for (const p of parts) map[p.type] = p.value;

  return {
    now,
    timeZone: TZ,
    weekday: map.weekday,
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    dateStr: now.toLocaleDateString('en-US', {
      timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    }),
    timeStr: now.toLocaleTimeString('en-US', {
      timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true,
    }),
  };
}

/**
 * Format an ISO timestamp (or Date) as a friendly Eastern date+time string.
 * Used on success screens so the confirmation always reads in Eastern, never the
 * device zone and never Central.
 */
export function formatEastern(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }) + ' ET';
}

/** Meeting status label from squadron settings, evaluated in Eastern time. */
export function easternMeetingStatus(settings, clock) {
  if (!settings) return { label: 'Meeting scheduled', open: false };
  const [sh, sm] = String(settings.meetingStart || '18:30').split(':').map(Number);
  const [eh, em] = String(settings.meetingEnd || '21:30').split(':').map(Number);
  const nowMin = clock.hour * 60 + clock.minute;
  const isMeetingDay = clock.weekday === (settings.meetingDay || 'Tuesday');
  if (isMeetingDay && nowMin >= sh * 60 + sm && nowMin <= eh * 60 + em) {
    return { label: 'Meeting in progress', open: true };
  }
  if (isMeetingDay && nowMin > eh * 60 + em) {
    return { label: 'Meeting ended', open: false };
  }
  return { label: 'Meeting scheduled', open: false };
}
