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
