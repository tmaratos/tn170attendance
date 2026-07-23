import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDiscordResponse,
  validateWebhookUrl,
  zipSingleFile,
  deliverToDiscord,
  buildEmbed,
} from '../scripts/lib/discord.js';

test('classifyDiscordResponse maps status codes correctly', () => {
  assert.deepEqual(classifyDiscordResponse(200), { ok: true, retry: false, reason: 'delivered' });
  assert.deepEqual(classifyDiscordResponse(204), { ok: true, retry: false, reason: 'delivered' });
  assert.equal(classifyDiscordResponse(429).retry, true);
  assert.equal(classifyDiscordResponse(500).retry, true);
  assert.equal(classifyDiscordResponse(503).retry, true);
  assert.equal(classifyDiscordResponse(401).ok, false);
  assert.equal(classifyDiscordResponse(401).retry, false);
  assert.equal(classifyDiscordResponse(403).retry, false);
  assert.equal(classifyDiscordResponse(404).retry, false);
});

test('validateWebhookUrl accepts valid, rejects missing/malformed/wrong host', () => {
  assert.equal(validateWebhookUrl('https://discord.com/api/webhooks/123456/abcDEF-token').valid, true);
  assert.equal(validateWebhookUrl('https://discord.com/api/v10/webhooks/123/tok').valid, true);
  assert.equal(validateWebhookUrl('').valid, false);
  assert.equal(validateWebhookUrl(null).valid, false);
  assert.equal(validateWebhookUrl('not a url').valid, false);
  assert.equal(validateWebhookUrl('http://discord.com/api/webhooks/1/x').valid, false, 'must be https');
  assert.equal(validateWebhookUrl('https://evil.com/api/webhooks/1/x').valid, false, 'wrong host');
  assert.equal(validateWebhookUrl('https://discord.com/channels/1/2').valid, false, 'not a webhook path');
});

test('zipSingleFile produces a valid store-only zip header', () => {
  const buf = zipSingleFile('a.csv', 'hello,world\n1,2\n');
  assert.equal(buf.readUInt32LE(0), 0x04034b50, 'local file header signature');
  assert.ok(buf.includes(Buffer.from('a.csv')), 'contains filename');
  assert.ok(buf.length > 22, 'has content + central dir + EOCD');
});

// --- deliverToDiscord with an injected fetch (no network) ---
function res({ status, headers = {}, json = null, text = '' }) {
  return {
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? headers[k] ?? null },
    json: async () => {
      if (json == null) throw new Error('no body');
      return json;
    },
    text: async () => text,
  };
}
const embed = buildEmbed({
  meetingDate: '2026-07-21',
  meeting: { meetingTitle: 'Squadron Meeting' },
  summary: { memberTotal: 3, memberCheckedOut: 3, memberCheckedIn: 0, guestTotal: 1 },
  timeZone: 'America/New_York',
});
const args = { csv: 'a,b\n1,2\n', filename: 'tn170-attendance-2026-07-21.csv', embed };
const noSleep = async () => {};

test('deliverToDiscord: 204 no-content success', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return res({ status: 204 });
  };
  const r = await deliverToDiscord('https://discord.com/api/webhooks/1/t', args, { fetchImpl, sleep: noSleep });
  assert.equal(r.ok, true);
  assert.equal(r.status, 204);
  assert.equal(r.zipFilename, 'tn170-attendance-2026-07-21.zip');
  assert.equal(calls, 1);
});

test('deliverToDiscord: 200 returns message id (wait=true)', async () => {
  const fetchImpl = async (url) => {
    assert.ok(url.includes('wait=true'), 'requests message echo');
    return res({ status: 200, json: { id: '999888777' } });
  };
  const r = await deliverToDiscord('https://discord.com/api/webhooks/1/t', args, { fetchImpl, sleep: noSleep });
  assert.equal(r.ok, true);
  assert.equal(r.messageId, '999888777');
});

test('deliverToDiscord: 429 honors retry_after then succeeds', async () => {
  const delays = [];
  let n = 0;
  const fetchImpl = async () => {
    n++;
    if (n === 1) return res({ status: 429, headers: { 'retry-after': '2' }, text: '{"retry_after":2}' });
    return res({ status: 204 });
  };
  const sleep = async (ms) => { delays.push(ms); };
  const r = await deliverToDiscord('https://discord.com/api/webhooks/1/t', args, { fetchImpl, sleep });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 2);
  assert.equal(delays[0], 2000, 'slept for retry_after seconds');
});

test('deliverToDiscord: 500 retries with backoff then fails', async () => {
  let n = 0;
  const fetchImpl = async () => { n++; return res({ status: 500, text: 'server error' }); };
  const r = await deliverToDiscord('https://discord.com/api/webhooks/1/t', args, {
    fetchImpl,
    sleep: noSleep,
    maxRetries: 2,
  });
  assert.equal(r.ok, false);
  assert.equal(r.attempts, 3, '1 + 2 retries');
  assert.equal(n, 3);
  assert.match(r.error, /server error 500/);
});

test('deliverToDiscord: 404 (revoked/deleted webhook) does not retry', async () => {
  let n = 0;
  const fetchImpl = async () => { n++; return res({ status: 404, text: 'Unknown Webhook' }); };
  const r = await deliverToDiscord('https://discord.com/api/webhooks/1/t', args, { fetchImpl, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.equal(n, 1, 'no retry on 404');
  assert.match(r.error, /404/);
});

test('deliverToDiscord: 403 (wrong channel/permissions) does not retry', async () => {
  let n = 0;
  const fetchImpl = async () => { n++; return res({ status: 403, text: 'Forbidden' }); };
  const r = await deliverToDiscord('https://discord.com/api/webhooks/1/t', args, { fetchImpl, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.equal(n, 1);
});

test('deliverToDiscord: network error retries then reports', async () => {
  let n = 0;
  const fetchImpl = async () => { n++; throw new Error('ECONNRESET'); };
  const r = await deliverToDiscord('https://discord.com/api/webhooks/1/t', args, {
    fetchImpl,
    sleep: noSleep,
    maxRetries: 1,
  });
  assert.equal(r.ok, false);
  assert.equal(n, 2);
  assert.match(r.error, /network error/);
});
