/**
 * AAMVA driver's-license PDF417 parsing.
 *
 * This module exists to pull exactly two values out of a licence payload —
 * first name and last name — and to make it easy to prove, in tests, that it
 * never yields anything else. It has no knowledge of the guest or member UI,
 * and it never logs, stores, or returns the payload it was given.
 *
 * A licence barcode also carries DL number, date of birth, address, height,
 * eye colour, document discriminator and more. None of that is extracted here,
 * so none of it can reach a caller, the backend, or an error report.
 */

// Element identifiers we may encounter directly after a name value when a
// payload has no separators. Used only to find where a name ends.
//
// Deliberately excludes DAN/DAO/DAP (obsolete v1 address elements) because
// they collide with common given names — "DANIEL" would otherwise truncate to
// the empty string. Name values are matched from index 1 onward for the same
// reason.
const FOLLOWING_CODES = [
  'DAA', 'DAB', 'DAC', 'DAD', 'DAE', 'DAF', 'DAG', 'DAI', 'DAJ', 'DAK', 'DAL',
  'DAQ', 'DAR', 'DAS', 'DAT', 'DAU', 'DAV', 'DAW', 'DAX', 'DAY', 'DAZ',
  'DBA', 'DBB', 'DBC', 'DBD', 'DBE', 'DBF', 'DBG', 'DBH', 'DBI', 'DBJ', 'DBK',
  'DBL', 'DBM', 'DBN', 'DBO', 'DBP', 'DBQ', 'DBR', 'DBS',
  'DCA', 'DCB', 'DCD', 'DCE', 'DCF', 'DCG', 'DCH', 'DCI', 'DCJ', 'DCK', 'DCL',
  'DCM', 'DCN', 'DCO', 'DCP', 'DCQ', 'DCR', 'DCS', 'DCT', 'DCU',
  'DDA', 'DDB', 'DDC', 'DDD', 'DDE', 'DDF', 'DDG', 'DDH', 'DDI', 'DDJ', 'DDK',
  'DDL',
];

// AAMVA truncates name fields at 40 characters.
const MAX_NAME_LENGTH = 40;

/** True when the payload carries AAMVA structure. Does not validate contents. */
export function isAamvaPayload(raw) {
  const value = String(raw || '');
  if (!value) return false;
  const hasHeader = value.startsWith('@') || /\bANSI\b/.test(value) || /@\s*\r?\n?\x1e/.test(value);
  const hasNameElement = /DAC/.test(value) || /DCS/.test(value);
  return hasHeader && hasNameElement;
}

/**
 * Reads one element's value. Prefers the line-delimited form the AAMVA
 * standard specifies, and falls back to scanning for the next element code
 * when a payload arrives with its fields adjacent.
 */
function readElement(payload, code) {
  const start = payload.indexOf(code);
  if (start === -1) return '';
  const after = payload.slice(start + code.length);

  // Standard form: the value runs to the end of its line.
  const lineEnd = after.search(/[\r\n]/);
  if (lineEnd !== -1) return after.slice(0, lineEnd).slice(0, MAX_NAME_LENGTH);

  // Adjacent form: the value runs to the next recognised element code.
  let cut = after.length;
  for (const next of FOLLOWING_CODES) {
    const at = after.indexOf(next, 1);
    if (at !== -1 && at < cut) cut = at;
  }
  return after.slice(0, cut).slice(0, MAX_NAME_LENGTH);
}

/**
 * Converts a licence-cased name to display casing while preserving the
 * punctuation that belongs in real names.
 *
 *   TRISTAN      -> Tristan
 *   O'BRIEN      -> O'Brien
 *   SMITH-JONES  -> Smith-Jones
 *
 * A name that already carries lower-case letters is left alone, so "McDonald"
 * and "van der Berg" survive untouched.
 */
export function normalizeName(raw) {
  const collapsed = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!collapsed) return '';
  if (/[a-z]/.test(collapsed)) return collapsed;
  return collapsed
    .split(/([ \-'])/)
    .map((part) =>
      /^[ \-']$/.test(part) || !part
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join('');
}

/**
 * Extracts only the first and last name from an AAMVA payload.
 * Returns null when the payload is not a licence or either name is absent —
 * never a partial result, and never any other licence field.
 */
export function parseAamvaName(raw) {
  const payload = String(raw || '');
  if (!isAamvaPayload(payload)) return null;

  const firstName = normalizeName(readElement(payload, 'DAC'));
  const lastName = normalizeName(readElement(payload, 'DCS'));
  if (!firstName || !lastName) return null;

  return { firstName, lastName };
}

/** Comparison key for matching a scanned name against the roster. */
export function nameKey(firstName, lastName) {
  const clean = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return `${clean(firstName)} ${clean(lastName)}`.trim();
}

export default { parseAamvaName, normalizeName, isAamvaPayload, nameKey };
