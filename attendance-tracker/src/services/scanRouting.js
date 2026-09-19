/**
 * Decides what a completed scan means. Pure and synchronous: it performs no
 * writes, touches no network, and returns only a decision for the caller to
 * act on, so every branch below is unit-testable.
 *
 * It receives a already-parsed name, never a licence payload, which keeps
 * licence data out of this layer entirely.
 */
import { nameKey } from '../utils/aamva.js';

const personKey = (person) => {
  const first = person?.firstName;
  const last = person?.lastName;
  if (first || last) return nameKey(first, last);
  // Fall back to the display name: "First [Middle] Last".
  const tokens = String(person?.name || person?.displayName || '').trim().split(/\s+/);
  if (tokens.length === 0 || !tokens[0]) return '';
  return nameKey(tokens[0], tokens.length > 1 ? tokens[tokens.length - 1] : tokens[0]);
};

const guestKey = (guest) => {
  const tokens = String(guest?.name || guest?.guestName || '').trim().split(/\s+/);
  if (!tokens[0]) return '';
  return nameKey(tokens[0], tokens.length > 1 ? tokens[tokens.length - 1] : tokens[0]);
};

const isOpenVisit = (guest) =>
  guest?.status === 'checked-in' || guest?.status === 'checked_in';

/**
 * Routes a driver's-licence name.
 *
 * Roster match wins over a guest record, so a member who forgot their CAP card
 * is recorded as a member rather than as a visitor. Ambiguity is never guessed:
 * duplicates return a selection decision for staff.
 */
export function routeLicenceName({ firstName, lastName }, { members = [], guests = [] } = {}) {
  const key = nameKey(firstName, lastName);
  if (!key.trim()) return { kind: 'unknown' };

  const memberMatches = members.filter((member) => personKey(member) === key);
  if (memberMatches.length === 1) {
    return { kind: 'member', member: memberMatches[0] };
  }
  if (memberMatches.length > 1) {
    return { kind: 'member-ambiguous', matches: memberMatches, firstName, lastName };
  }

  const openVisits = guests.filter((guest) => isOpenVisit(guest) && guestKey(guest) === key);
  if (openVisits.length === 1) {
    return { kind: 'guest-check-out', visit: openVisits[0], firstName, lastName };
  }
  if (openVisits.length > 1) {
    return { kind: 'guest-ambiguous', visits: openVisits, firstName, lastName };
  }
  return { kind: 'guest-check-in', firstName, lastName };
}

/**
 * Routes any completed scan. `scan.type` has already classified the payload,
 * so a badge never reaches the licence parser and a licence never reaches
 * CAPID extraction.
 */
export function routeScan(scan, context = {}) {
  if (scan?.type === 'cap-id' && scan.capid) {
    return { kind: 'cap-id', capid: scan.capid };
  }
  if (scan?.type === 'drivers-license' && scan.name) {
    return routeLicenceName(scan.name, context);
  }
  return { kind: 'unknown' };
}

export default { routeScan, routeLicenceName };
