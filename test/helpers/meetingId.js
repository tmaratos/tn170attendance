/**
 * Mirrors the meeting-id derivation used by both the client
 * (attendanceService.meetingDateString) and the server (Eastern date), so the
 * cross-device determinism can be tested without importing the firebase-coupled
 * client module. `eastern` is what production uses; `utc` is the old buggy value.
 */
export function meetingIdCandidates(now) {
  const eastern = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
  const utc = now.toISOString().slice(0, 10);
  return { eastern, utc };
}
