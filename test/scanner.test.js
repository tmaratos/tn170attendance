import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCapid, isFormControl } from '../attendance-tracker/src/utils/scanner.js';

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

