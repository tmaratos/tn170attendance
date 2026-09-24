import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAamvaName,
  normalizeName,
  isAamvaPayload,
} from '../attendance-tracker/src/utils/aamva.js';

// A realistic, line-delimited AAMVA payload carrying far more than we want.
const STANDARD = [
  '@\n\u001e\rANSI 636000090002DL00410278ZV03190008DL',
  'DAQT64235789',
  'DCSMARATOS',
  'DACTRISTAN',
  'DADQUINCY',
  'DBB01151990',
  'DBA01152030',
  'DAG123 MAIN ST',
  'DAIOAK RIDGE',
  'DAJTN',
  'DAK378300000',
  'DAU070 in',
  'DAYBRO',
  'DBC1',
  'DDEN',
  '',
].join('\n');

// Tennessee-style, including the jurisdiction-specific ZT block we must ignore.
const TENNESSEE = [
  '@\n\u001e\rANSI 636053090102DL00410285ZT03260031DL',
  'DCSSMITH',
  'DACJOHN',
  'DADALLEN',
  'DBD08012021',
  'DBB03121988',
  'DAJTN',
  'DAK372010000',
  'ZTZTAN',
  '',
].join('\n');

test('1. parses a standard AAMVA PDF417 payload', () => {
  assert.deepEqual(parseAamvaName(STANDARD), { firstName: 'Tristan', lastName: 'Maratos' });
});

test('2. parses a Tennessee-style payload without depending on ZT fields', () => {
  assert.deepEqual(parseAamvaName(TENNESSEE), { firstName: 'John', lastName: 'Smith' });
});

test('3. parses fields that are directly adjacent rather than on separate lines', () => {
  const adjacent = '@ANSI 636000090002DLDAQT642DCSMARATOSDACTRISTANDBB01151990';
  assert.deepEqual(parseAamvaName(adjacent), { firstName: 'Tristan', lastName: 'Maratos' });
});

test('3b. an adjacent given name that begins with an element-like prefix survives', () => {
  // "DANIEL" starts with the obsolete DAN element code; it must not truncate.
  const adjacent = '@ANSI 636000DLDCSSMITHDACDANIELDBB01011990';
  assert.deepEqual(parseAamvaName(adjacent), { firstName: 'Daniel', lastName: 'Smith' });
});

test('8. converts uppercase licence names to display casing', () => {
  assert.equal(normalizeName('TRISTAN'), 'Tristan');
  assert.equal(normalizeName('MARATOS'), 'Maratos');
});

test('9. preserves apostrophes', () => {
  assert.equal(normalizeName("O'BRIEN"), "O'Brien");
  assert.equal(normalizeName("D'ANGELO"), "D'Angelo");
});

test('10. preserves hyphens', () => {
  assert.equal(normalizeName('SMITH-JONES'), 'Smith-Jones');
  assert.equal(normalizeName("MARTINEZ-O'NEILL"), "Martinez-O'Neill");
});

test('normalizes whitespace and leaves mixed-case names alone', () => {
  assert.equal(normalizeName('  TRISTAN   LEE  '), 'Tristan Lee');
  assert.equal(normalizeName('McDonald'), 'McDonald');
  assert.equal(normalizeName(''), '');
});

test('11. returns null when DAC (first name) is missing', () => {
  const noFirst = '@\n\u001eANSI 636000090002DL\nDCSMARATOS\nDBB01151990\n';
  assert.equal(parseAamvaName(noFirst), null);
});

test('12. returns null when DCS (last name) is missing', () => {
  const noLast = '@\n\u001eANSI 636000090002DL\nDACTRISTAN\nDBB01151990\n';
  assert.equal(parseAamvaName(noLast), null);
});

test('13. returns null for a malformed AAMVA payload', () => {
  assert.equal(parseAamvaName('@\n\u001eANSI garbage garbage'), null);
  assert.equal(parseAamvaName('@'), null);
});

test('14. returns null for a non-licence barcode', () => {
  assert.equal(parseAamvaName('123456'), null);
  assert.equal(parseAamvaName('SOME-PRODUCT-SKU-9910'), null);
  assert.equal(parseAamvaName(''), null);
  assert.equal(parseAamvaName(null), null);
});

test('isAamvaPayload distinguishes licences from badges', () => {
  assert.equal(isAamvaPayload(STANDARD), true);
  assert.equal(isAamvaPayload('123456'), false);
  assert.equal(isAamvaPayload('ANSI but no name elements'), false);
});

test('18/20/24. the parser yields only firstName and lastName — no other licence field', () => {
  const parsed = parseAamvaName(STANDARD);
  assert.deepEqual(Object.keys(parsed).sort(), ['firstName', 'lastName']);

  // Nothing sensitive from the payload may appear anywhere in the result.
  const serialized = JSON.stringify(parsed);
  for (const secret of [
    'T64235789',   // DL number
    '01151990',    // date of birth
    '123 MAIN ST', // address
    '378300000',   // postal code
    'BRO',         // eye colour
    '070 in',      // height
    'QUINCY',      // middle name
  ]) {
    assert.equal(serialized.includes(secret), false, `leaked ${secret}`);
  }
});

// Regression: a real Tennessee licence packed several elements onto one line
// while the payload still contained newlines elsewhere. Taking the value up to
// the next newline swallowed the following elements — middle name, document
// discriminator and more — and returned 40 characters of licence data as the
// person's name.
const PACKED = [
  '@\n\u001e\rANSI 636053090102DL00410285ZT03260031DL',
  'DAQ123456789',
  'DCSMARATOSDDEUDACTRISTANDDFUDADGABRIELDDGUDCADDCB01DCDNONE',
  'DBB01151990',
  'DAG123 MAIN ST',
  '',
].join('\n');

test('packed elements on a line ending later do not run names together', () => {
  assert.deepEqual(parseAamvaName(PACKED), { firstName: 'Tristan', lastName: 'Maratos' });
});

test('no licence field survives into a packed-payload name', () => {
  const parsed = parseAamvaName(PACKED);
  const serialized = JSON.stringify(parsed);
  for (const leak of ['123456789', '01151990', 'MAIN ST', 'GABRIEL', 'Gabriel', 'DCB', 'NONE']) {
    assert.equal(serialized.includes(leak), false, `leaked ${leak}`);
  }
});

test('a digit or separator ends a name value', () => {
  // DCB01 immediately after a name must not be absorbed into it.
  assert.deepEqual(
    parseAamvaName('@ANSI 636000DLDCSSMITHDACJOHNDCB01DCDNONE'),
    { firstName: 'John', lastName: 'Smith' }
  );
});

// A licence carrying every field the standard allows. Nothing but the two name
// elements may survive parsing — this test is the contract.
const FULLY_POPULATED = [
  '@\n\u001e\rANSI 636053090102DL00410285ZT03260031DL',
  'DAQD12345678',        // driver's licence number
  'DCSMARATOS',          // last name            [KEPT]
  'DACTRISTAN',          // first name           [KEPT]
  'DADGABRIEL',          // middle name
  'DBB01151990',         // date of birth
  'DBA01152030',         // expiry
  'DBD08012021',         // issue date
  'DBC1',                // sex
  'DAU070 in',           // height
  'DAY BRO',             // eye colour
  'DAZ BRN',             // hair colour
  'DAG4512 PINE RIDGE RD', // street
  'DAIOAK RIDGE',        // city
  'DAJTN',               // state
  'DAK378300000',        // postal code
  'DCF1234567890ABCDEF', // document discriminator
  'DCGUSA',              // country
  'DCK0123456789',       // inventory control number
  'DDAF',                // compliance type
  'DDB08012020',         // card revision date
  'DDK1',                // organ donor
  'DDL1',                // veteran
  'DCBNONE',             // restrictions
  'DCDNONE',             // endorsements
  'ZTZTATN01',           // jurisdiction-specific
  '',
].join('\n');

test('a fully-populated licence yields first and last name and nothing else', () => {
  const parsed = parseAamvaName(FULLY_POPULATED);
  assert.deepEqual(parsed, { firstName: 'Tristan', lastName: 'Maratos' });
  assert.deepEqual(Object.keys(parsed), ['firstName', 'lastName']);
});

test('every other licence field is absent from the parsed result', () => {
  const serialized = JSON.stringify(parseAamvaName(FULLY_POPULATED)).toUpperCase();
  const mustNotAppear = [
    'D12345678',            // DL number
    '01151990', '01152030', '08012021', '08012020', // dates
    'GABRIEL',              // middle name
    '070 IN',               // height
    'BRO', 'BRN',           // eye / hair
    '4512', 'PINE RIDGE',   // street
    'OAK RIDGE',            // city
    '378300000',            // postal code
    '1234567890ABCDEF',     // document discriminator
    '0123456789',           // inventory control number
    'USA',                  // country
    'NONE',                 // restrictions / endorsements
    'ZTATN01',              // jurisdiction block
    'ANSI', 'DAQ', 'DCF', 'DCK', 'DDK', // structure and codes
  ];
  for (const leak of mustNotAppear) {
    assert.equal(serialized.includes(leak), false, `licence data leaked: ${leak}`);
  }
});

test('sex, organ-donor and veteran flags never appear', () => {
  const parsed = parseAamvaName(FULLY_POPULATED);
  assert.equal('sex' in parsed, false);
  assert.equal('organDonor' in parsed, false);
  assert.equal('veteran' in parsed, false);
  assert.equal(Object.keys(parsed).length, 2);
});
