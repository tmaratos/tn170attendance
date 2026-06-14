/**
 * Delete all memberPins documents and reset every member for first-time PIN setup.
 *
 * Usage:
 *   $env:FIREBASE_PROJECT_ID="tn170-attendance"
 *   $env:NODE_OPTIONS="--use-system-ca"
 *   node scripts/clear-all-pins.js
 *
 * Auth (first match wins):
 *   FIREBASE_ACCESS_TOKEN — OAuth bearer token
 *   gcloud auth print-access-token
 *   firebase-admin ADC (GOOGLE_APPLICATION_CREDENTIALS or gcloud application-default login)
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'tn170-attendance';
const BATCH_SIZE = 400;
const FIREBASE_CLIENT_ID =
  process.env.FIREBASE_CLIENT_ID
  || '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLIENT_SECRET = process.env.FIREBASE_CLIENT_SECRET || 'j9iVZfS8kkCEFUPaAeJV0sAi';

function readFirebaseCliRefreshToken() {
  const configPath = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!existsSync(configPath)) return null;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    return config?.tokens?.refresh_token || null;
  } catch {
    return null;
  }
}

async function refreshFirebaseCliAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: FIREBASE_CLIENT_ID,
    client_secret: FIREBASE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || response.statusText);
  }
  return payload.access_token;
}

async function getAccessToken() {
  if (process.env.FIREBASE_ACCESS_TOKEN?.trim()) {
    return process.env.FIREBASE_ACCESS_TOKEN.trim();
  }

  const refreshToken = readFirebaseCliRefreshToken();
  if (refreshToken) {
    return refreshFirebaseCliAccessToken(refreshToken);
  }

  try {
    return execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function docPath(collectionId, docId) {
  return `projects/${PROJECT_ID}/databases/(default)/documents/${collectionId}/${docId}`;
}

function encodeFieldPaths(paths) {
  return paths.map((path) => `updateMask.fieldPaths=${encodeURIComponent(path)}`).join('&');
}

async function restFetch(path, { method = 'GET', body, token }) {
  const url = path.startsWith('http')
    ? path
    : `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.raw || response.statusText;
    throw new Error(`${method} ${url} failed (${response.status}): ${message}`);
  }

  return payload;
}

async function listCollection(collectionId, token) {
  const docs = [];
  let pageToken = null;

  do {
    const query = pageToken ? `?pageSize=300&pageToken=${encodeURIComponent(pageToken)}` : '?pageSize=300';
    const payload = await restFetch(`${collectionId}${query}`, { token });
    for (const doc of payload.documents || []) {
      docs.push(doc);
    }
    pageToken = payload.nextPageToken || null;
  } while (pageToken);

  return docs;
}

async function commitWrites(writes, token) {
  await restFetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      token,
      body: { writes },
    }
  );
}

function timestampField() {
  return { timestampValue: new Date().toISOString() };
}

async function clearViaRest(token) {
  console.log(`Using Firestore REST API (project: ${PROJECT_ID})`);

  const pinDocs = await listCollection('memberPins', token);
  console.log(`Found ${pinDocs.length} memberPins document(s).`);

  let pinsDeleted = 0;
  for (let index = 0; index < pinDocs.length; index += BATCH_SIZE) {
    const chunk = pinDocs.slice(index, index + BATCH_SIZE);
    const writes = chunk.map((doc) => ({ delete: doc.name }));
    await commitWrites(writes, token);
    pinsDeleted += chunk.length;
    console.log(`  Deleted ${pinsDeleted}/${pinDocs.length} memberPins...`);
  }

  const memberDocs = await listCollection('members', token);
  console.log(`Found ${memberDocs.length} member document(s) to reset.`);

  let membersUpdated = 0;
  for (let index = 0; index < memberDocs.length; index += BATCH_SIZE) {
    const chunk = memberDocs.slice(index, index + BATCH_SIZE);
    const writes = chunk.map((doc) => {
      const docId = doc.name.split('/').pop();
      const fields = {
        hasPin: { booleanValue: false },
        pinResetRequired: { booleanValue: false },
        updatedAt: timestampField(),
      };

      if (doc.fields?.pinHash) {
        return {
          transform: {
            document: docPath('members', docId),
            fieldTransforms: [{ fieldPath: 'pinHash', deleteField: {} }],
          },
        };
      }

      return {
        update: {
          name: docPath('members', docId),
          fields,
        },
        updateMask: { fieldPaths: ['hasPin', 'pinResetRequired', 'updatedAt'] },
      };
    });

    await commitWrites(writes, token);
    membersUpdated += chunk.length;
    console.log(`  Updated ${membersUpdated}/${memberDocs.length} members...`);
  }

  return { pinsDeleted, membersUpdated };
}

async function clearViaAdmin() {
  const { initializeApp, applicationDefault, cert } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && existsSync(credPath)) {
    const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
    initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
  } else {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }

  const db = getFirestore();
  console.log(`Using firebase-admin (project: ${PROJECT_ID})`);

  const pinSnap = await db.collection('memberPins').get();
  let pinsDeleted = 0;
  if (!pinSnap.empty) {
    let batch = db.batch();
    let ops = 0;
    for (const doc of pinSnap.docs) {
      batch.delete(doc.ref);
      ops += 1;
      pinsDeleted += 1;
      if (ops >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  }

  const memberSnap = await db.collection('members').get();
  let membersUpdated = 0;
  if (!memberSnap.empty) {
    let batch = db.batch();
    let ops = 0;
    for (const doc of memberSnap.docs) {
      const data = doc.data();
      const update = {
        hasPin: false,
        pinResetRequired: false,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (data.pinHash) {
        update.pinHash = FieldValue.delete();
      }
      batch.update(doc.ref, update);
      ops += 1;
      membersUpdated += 1;
      if (ops >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  }

  return { pinsDeleted, membersUpdated };
}

async function main() {
  const token = await getAccessToken();
  let result;

  if (token) {
    try {
      result = await clearViaRest(token);
    } catch (err) {
      console.warn(`REST clear failed (${err.message}). Trying firebase-admin...`);
      result = await clearViaAdmin();
    }
  } else {
    result = await clearViaAdmin();
  }

  console.log('');
  console.log('PIN clear complete.');
  console.log(`  memberPins deleted: ${result.pinsDeleted}`);
  console.log(`  members updated:  ${result.membersUpdated}`);
  console.log('  All accounts are set for first-time Create PIN flow.');
}

main().catch((err) => {
  console.error('Clear failed:', err.message);
  process.exit(1);
});
