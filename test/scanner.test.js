import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createScanBuffer,
  detectScanType,
  extractCapid,
  isFormControl,
} from '../attendance-tracker/src/utils/scanner.js';

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
    type: 'cap-id',
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

// --- Driver's licence payloads over the same USB HID wire -------------------

const LICENCE = [
  '@\n\u001e\rANSI 636000090002DL00410278ZV03190008DL',
  'DCSMARATOS',
  'DACTRISTAN',
  'DBB01151990',
  'DAG123 MAIN ST',
  '',
].join('\n');

/** Types a payload as a scanner would: fast, with Enter for each newline. */
function typeScan(buffer, payload, startAt = 0, perKeyMs = 5) {
  let now = startAt;
  let result = null;
  for (const char of payload) {
    const key = char === '\n' ? 'Enter' : char === '\r' ? 'Enter' : char;
    const out = buffer.push(key, (now += perKeyMs));
    if (out) result = out;
  }
  return { result, now };
}

test('4/5. a rapid licence burst is not truncated by the newlines inside it', () => {
  const buffer = createScanBuffer();
  const { result, now } = typeScan(buffer, LICENCE);
  assert.equal(result, null, 'must not complete on an embedded Enter');

  const flushed = buffer.flushIfIdle(now + 500);
  assert.equal(flushed.type, 'drivers-license');
  assert.equal(flushed.fromScanner, true);
  assert.ok(flushed.raw.includes('DACTRISTAN'));
});

test('4b. a CAP badge still completes on its Enter terminator', () => {
  const buffer = createScanBuffer();
  let now = 0;
  for (const key of '706279') buffer.push(key, (now += 5));
  const result = buffer.push('Enter', (now += 5));
  assert.equal(result.type, 'cap-id');
  assert.equal(result.capid, '706279');
});

test('6. a hand-typed licence-length string is never treated as a scan', () => {
  const buffer = createScanBuffer();
  let now = 0;
  for (const char of 'DCSMARATOS') buffer.push(char, (now += 400));
  assert.equal(buffer.push('Enter', (now += 400)), null);
});

test('7. keystrokes aimed at form controls are left for the field', () => {
  assert.equal(isFormControl({ tagName: 'INPUT' }), true);
  assert.equal(isFormControl({ tagName: 'SELECT' }), true);
  assert.equal(isFormControl({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isFormControl({ tagName: 'SECTION' }), false);
});

test('21/23. the buffer clears after a successful scan and is ready for the next', () => {
  const buffer = createScanBuffer();
  const { now } = typeScan(buffer, LICENCE);
  buffer.flushIfIdle(now + 500);
  assert.equal(buffer.pending, '', 'buffer must not retain the payload');
  assert.equal(buffer.flushIfIdle(now + 1000), null);

  const next = typeScan(buffer, '706279', now + 2000);
  assert.equal(next.result, null);
  assert.equal(buffer.push('Enter', next.now + 5).capid, '706279');
});

test('22. the buffer clears after a failed/garbage scan', () => {
  const buffer = createScanBuffer();
  let now = 0;
  for (const char of 'NOT-A-LICENCE-9910') buffer.push(char, (now += 5));
  const result = buffer.push('Enter', (now += 5));
  assert.equal(result.type, 'unknown');
  assert.equal(buffer.pending, '');
});

test('detectScanType does not assume every numeric barcode is a licence', () => {
  assert.equal(detectScanType('706279'), 'cap-id');
  assert.equal(detectScanType(LICENCE), 'drivers-license');
  assert.equal(detectScanType('9781234567897'), 'unknown');
  assert.equal(detectScanType('SKU-ABC-1234'), 'unknown');
});
