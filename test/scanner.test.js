import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScanBuffer, extractCapid, isFormControl } from '../attendance-tracker/src/utils/scanner.js';

test('extractCapid accepts standard CAP badge values', () => {
  assert.equal(extractCapid('123456'), '123456');
  assert.equal(extractCapid('12345678'), '12345678');
  assert.equal(extractCapid('CAPID: 1234567'), '1234567');
  assert.equal(extractCapid('badge-123456-end'), '123456');
});

test('extractCapid rejects values without one unambiguous 6–8 digit CAPID', () => {
  assert.equal(extractCapid('12345'), '');
  assert.equal(extractCapid('123456789'), '');
  assert.equal(extractCapid('not-a-badge'), '');
});

test('scanner capture ignores form controls and editable content', () => {
  assert.equal(isFormControl({ tagName: 'INPUT' }), true);
  assert.equal(isFormControl({ tagName: 'textarea' }), true);
  assert.equal(isFormControl({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isFormControl({ tagName: 'BODY' }), false);
});


test('createScanBuffer recognizes a scanner burst and returns the CAPID', () => {
  const buffer = createScanBuffer();
  let now = 0;
  for (const key of '123456') assert.equal(buffer.push(key, (now += 10)), null);
  assert.deepEqual(buffer.push('Enter', (now += 10)), {
    raw: '123456',
    capid: '123456',
    fromScanner: true,
  });
});

test('createScanBuffer never fires on hand-typed input', () => {
  // Each keystroke is slower than the burst gap, so the buffer resets every
  // time and the terminator has nothing to report.
  const buffer = createScanBuffer();
  let now = 0;
  for (const key of '123456') buffer.push(key, (now += 400));
  assert.equal(buffer.push('Enter', (now += 400)), null);
});

test('createScanBuffer flags a merely brisk burst as not scanner-generated', () => {
  const buffer = createScanBuffer({ minBurstKeys: 20 });
  let now = 0;
  for (const key of '123456') buffer.push(key, (now += 10));
  assert.equal(buffer.push('Enter', (now += 10)).fromScanner, false);
});

test('createScanBuffer discards a stale partial burst after a long pause', () => {
  const buffer = createScanBuffer();
  let now = 0;
  for (const key of '999') buffer.push(key, (now += 10));
  for (const key of '123456') buffer.push(key, (now += 10) + 5000 * (key === '1' ? 1 : 0));
  assert.equal(buffer.push('Enter', (now += 10)).capid, '123456');
});

test('createScanBuffer handles a Tab terminator and a badge with a prefix', () => {
  const buffer = createScanBuffer();
  let now = 0;
  for (const key of 'CAP1234567') buffer.push(key, (now += 10));
  const result = buffer.push('Tab', (now += 10));
  assert.equal(result.capid, '1234567');
  assert.equal(result.fromScanner, true);
});

test('createScanBuffer returns null for a terminator with nothing buffered', () => {
  const buffer = createScanBuffer();
  assert.equal(buffer.push('Enter', 0), null);
});
