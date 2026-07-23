/**
 * Discord webhook delivery with explicit HTTP handling, retries, and idempotency.
 *
 * A Discord CHANNEL ID cannot post on its own — delivery requires a webhook
 * created in that channel (DISCORD_WEBHOOK_URL). This module never logs the URL.
 */

/** Store-only ZIP of a single file. Discord inlines text/csv previews but not application/zip. */
export function zipSingleFile(filename, content) {
  const nameBuffer = Buffer.from(filename, 'utf8');
  const dataBuffer = Buffer.from(content, 'utf8');
  const checksum = crc32(dataBuffer);
  const size = dataBuffer.length;

  const localHeader = Buffer.alloc(30 + nameBuffer.length);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(size, 18);
  localHeader.writeUInt32LE(size, 22);
  localHeader.writeUInt16LE(nameBuffer.length, 26);
  nameBuffer.copy(localHeader, 30);

  const centralHeader = Buffer.alloc(46 + nameBuffer.length);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt32LE(checksum, 16);
  centralHeader.writeUInt32LE(size, 20);
  centralHeader.writeUInt32LE(size, 24);
  centralHeader.writeUInt16LE(nameBuffer.length, 28);
  centralHeader.writeUInt32LE(0, 38);
  nameBuffer.copy(centralHeader, 46);

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(1, 8);
  endRecord.writeUInt16LE(1, 10);
  endRecord.writeUInt32LE(centralHeader.length, 12);
  endRecord.writeUInt32LE(localHeader.length + size, 16);

  return Buffer.concat([localHeader, dataBuffer, centralHeader, endRecord]);
}

let crc32Table;
function crc32(buffer) {
  if (!crc32Table) {
    crc32Table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crc32Table[i] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const DISCORD_HOSTS = new Set([
  'discord.com',
  'discordapp.com',
  'ptb.discord.com',
  'canary.discord.com',
]);

/** Syntactic validation only (cannot detect a revoked webhook without a request). */
export function validateWebhookUrl(url) {
  if (!url) return { valid: false, reason: 'missing' };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: 'not a URL' };
  }
  if (parsed.protocol !== 'https:') return { valid: false, reason: 'not https' };
  if (!DISCORD_HOSTS.has(parsed.hostname)) return { valid: false, reason: 'not a discord host' };
  if (!/\/api(?:\/v\d+)?\/webhooks\/\d+\/.+/.test(parsed.pathname)) {
    return { valid: false, reason: 'not a webhook path' };
  }
  return { valid: true, reason: 'ok' };
}

/** Map an HTTP status to a delivery decision. */
export function classifyDiscordResponse(status) {
  if (status === 200 || status === 204) return { ok: true, retry: false, reason: 'delivered' };
  if (status === 429) return { ok: false, retry: true, reason: 'rate limited' };
  if (status >= 500) return { ok: false, retry: true, reason: `server error ${status}` };
  if (status === 401) return { ok: false, retry: false, reason: 'invalid credentials (401)' };
  if (status === 403) return { ok: false, retry: false, reason: 'insufficient access (403)' };
  if (status === 404) return { ok: false, retry: false, reason: 'webhook deleted or invalid (404)' };
  return { ok: false, retry: false, reason: `unexpected status ${status}` };
}

export function buildEmbed({ meetingDate, meeting, summary, timeZone, official = true }) {
  const title = meeting?.meetingTitle
    ? `${meeting.meetingTitle}`
    : `Squadron Meeting — ${meetingDate}`;
  return {
    title: `TN-170 Attendance — ${meetingDate}`,
    description: official
      ? `Official Tuesday attendance export — ${title}`
      : title,
    color: 0x1e3a5f,
    fields: [
      { name: 'Members present (records)', value: String(summary.memberTotal), inline: true },
      { name: 'Members checked out', value: String(summary.memberCheckedOut), inline: true },
      { name: 'Members still open', value: String(summary.memberCheckedIn), inline: true },
      { name: 'Guest records', value: String(summary.guestTotal), inline: true },
      { name: 'Timezone', value: timeZone, inline: true },
    ],
    footer: { text: 'TN-170 Attendance Export • GitHub Actions' },
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Deliver the report ZIP + embed to Discord with bounded retries.
 * Returns { ok, status, attempts, messageId, zipFilename, error }.
 *
 * Options: { fetchImpl, sleep, maxRetries=3, baseDelayMs=1000 } (injectable for tests).
 */
export async function deliverToDiscord(
  webhookUrl,
  { csv, filename, embed },
  { fetchImpl = fetch, sleep = wait, maxRetries = 3, baseDelayMs = 1000 } = {},
) {
  const zipFilename = filename.replace(/\.csv$/i, '.zip');
  const zipBuffer = zipSingleFile(filename, csv);
  const url = `${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}wait=true`;

  let attempts = 0;
  let lastStatus = 0;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts = attempt + 1;
    const form = new FormData();
    form.append('payload_json', JSON.stringify({ embeds: [embed] }));
    form.append('files[0]', new Blob([zipBuffer], { type: 'application/zip' }), zipFilename);

    let response;
    try {
      response = await fetchImpl(url, { method: 'POST', body: form });
    } catch (err) {
      lastError = `network error: ${err.message}`;
      lastStatus = 0;
      if (attempt < maxRetries) {
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }
      break;
    }

    lastStatus = response.status;
    const decision = classifyDiscordResponse(response.status);

    if (decision.ok) {
      let messageId = null;
      try {
        const body = await response.json();
        messageId = body?.id || null;
      } catch {
        /* 204 has no body */
      }
      return { ok: true, status: response.status, attempts, messageId, zipFilename, error: null };
    }

    let bodyText = '';
    try {
      bodyText = (await response.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    lastError = `${decision.reason}${bodyText ? `: ${bodyText}` : ''}`;

    if (!decision.retry || attempt === maxRetries) {
      break;
    }

    let delayMs = baseDelayMs * 2 ** attempt;
    if (response.status === 429) {
      const retryAfter = Number(response.headers?.get?.('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        delayMs = Math.min(retryAfter * 1000, 30000);
      }
    }
    await sleep(delayMs);
  }

  return { ok: false, status: lastStatus, attempts, messageId: null, zipFilename, error: lastError };
}
