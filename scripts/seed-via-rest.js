/**
 * Seed Firestore via REST API using Firebase CLI refresh token from configstore.
 * Fallback when Application Default Credentials are unavailable.
 */
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const FIREBASE_CLIENT_ID =
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'tn170-attendance';

const ADMIN_CAPIDS = new Set([
  '326320', '249023', '757794', '702226', '740617', '729204',
]);

function loadConfigstore() {
  const path = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: FIREBASE_CLIENT_ID,
    client_secret: FIREBASE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  return res.json();
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(Math.trunc(value)) };
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return { timestampValue: value };
    }
    return { stringValue: value };
  }
  throw new Error(`Unsupported type: ${typeof value}`);
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    fields[key] = toFirestoreValue(value);
  }
  return fields;
}

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseGradeAndName(tokens) {
  let gradeEnd = 2;
  if ((tokens[1] === '1st' || tokens[1] === '2d') && tokens[2] === 'Lt') {
    gradeEnd = 3;
  }
  const grade = tokens.slice(1, gradeEnd).join(' ');
  const nameTokens = tokens.slice(gradeEnd);
  const firstName = nameTokens[0] || '';
  const lastName = nameTokens.length > 1 ? nameTokens[nameTokens.length - 1] : firstName;
  const middleName = nameTokens.length > 2 ? nameTokens.slice(1, -1).join(' ') : '';
  const fullName = nameTokens.join(' ');
  const displayName = middleName
    ? `${firstName} ${middleName} ${lastName}`
    : `${firstName} ${lastName}`;
  return { grade, firstName, middleName, lastName, fullName, displayName };
}

function parseRole(grade) {
  const upper = grade.toUpperCase();
  if (upper.startsWith('C/') || upper === 'CADET') {
    return { role: 'Cadet', isCadet: true, isSeniorMember: false };
  }
  return { role: 'Senior Member', isCadet: false, isSeniorMember: true };
}

function buildPermissions(capid, isSenior) {
  const isAdmin = ADMIN_CAPIDS.has(capid);
  return {
    isAdmin,
    canForceAttendance: isAdmin,
    canResetPins: isAdmin,
    canExportReports: isSenior || isAdmin,
    canManageMembers: isAdmin,
    canManageGuests: isSenior || isAdmin,
  };
}

function parseRosterLine(line) {
  const tokens = line.split(/\s+/);
  const capid = tokens[0];
  const { grade, firstName, middleName, lastName, fullName, displayName } = parseGradeAndName(tokens);
  const roleInfo = parseRole(grade);
  const isSenior = roleInfo.isSeniorMember;
  const permissions = buildPermissions(capid, isSenior);
  const now = new Date().toISOString();

  return {
    memberId: capid,
    capid,
    temporaryId: null,
    grade,
    firstName,
    middleName,
    lastName,
    fullName,
    displayName,
    normalizedName: normalizeName(displayName),
    ...roleInfo,
    isProspective: false,
    hasPin: false,
    pinResetRequired: false,
    active: true,
    ...permissions,
    createdAt: now,
    updatedAt: now,
  };
}

function loadMembers() {
  const roster = readFileSync(join(ROOT, 'data', 'roster.txt'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  return roster.map(parseRosterLine);
}

async function batchWrite(accessToken, writes) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore commit failed (${res.status}): ${text}`);
  }

  return res.json();
}

function docWrite(collection, docId, data) {
  return {
    update: {
      name: `projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`,
      fields: toFirestoreFields(data),
    },
  };
}

async function main() {
  const config = loadConfigstore();
  const { refresh_token: refreshToken } = config.tokens || {};
  if (!refreshToken) {
    throw new Error('No refresh_token in firebase-tools configstore. Run: firebase login --reauth');
  }

  console.log('Refreshing Firebase CLI access token...');
  const tokenData = await refreshAccessToken(refreshToken);
  const accessToken = tokenData.access_token;

  const members = loadMembers();
  console.log(`Writing ${members.length} members + settings/squadron...`);

  const writes = members.map((m) => docWrite('members', m.capid, m));

  const settings = {
    squadronName: 'Oak Ridge Composite Squadron',
    squadronDesignator: 'TN-170',
    motto: 'Not Without Effort',
    meetingDay: 'Tuesday',
    meetingStart: '18:30',
    meetingEnd: '21:30',
    updatedAt: new Date().toISOString(),
  };
  writes.push(docWrite('settings', 'squadron', settings));

  // Firestore commit limit is 500 writes per request
  const batchSize = 500;
  for (let i = 0; i < writes.length; i += batchSize) {
    const batch = writes.slice(i, i + batchSize);
    await batchWrite(accessToken, batch);
    console.log(`  Committed ${Math.min(i + batch.length, writes.length)}/${writes.length} documents`);
  }

  // Update configstore with new tokens if provided
  if (tokenData.refresh_token || tokenData.access_token) {
    config.tokens = {
      ...config.tokens,
      ...tokenData,
      expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000,
    };
    writeFileSync(
      join(homedir(), '.config', 'configstore', 'firebase-tools.json'),
      JSON.stringify(config, null, '\t'),
    );
  }

  const seniors = members.filter((m) => m.isSeniorMember).length;
  const cadets = members.filter((m) => m.isCadet).length;
  const admins = members.filter((m) => m.isAdmin).length;

  console.log('Seed complete via Firestore REST API.');
  console.log(`  Members: ${members.length} (${seniors} seniors, ${cadets} cadets, ${admins} admins)`);
  console.log('  Settings: settings/squadron');
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
