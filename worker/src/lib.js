/**
 * TN-170 Attendance API — helpers.
 * Runs in a Cloudflare Worker (Web Crypto, fetch). No Node/admin SDK, no paid services.
 */

// ---------- base64 / base64url ----------
export function b64urlFromBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlFromString(str) {
  return b64urlFromBytes(new TextEncoder().encode(str));
}
function pemToPkcs8Bytes(pem) {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---------- service account + RS256 ----------
export function getServiceAccount(env) {
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON secret is not set.');
  const sa = JSON.parse(raw);
  if (!sa.client_email || !sa.private_key) throw new Error('Service account JSON missing fields.');
  return sa;
}
let cachedKey = null;
async function importPrivateKey(pem) {
  if (cachedKey) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8Bytes(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return cachedKey;
}
async function signJwt(sa, claim) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const unsigned = `${b64urlFromString(JSON.stringify(header))}.${b64urlFromString(JSON.stringify(claim))}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64urlFromBytes(new Uint8Array(sig))}`;
}

// ---------- Google OAuth access token (for Firestore REST) ----------
let cachedToken = null; // { token, exp }
export async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const sa = getServiceAccount(env);
  const assertion = await signJwt(sa, {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
  });
  if (!res.ok) throw new Error(`Google token error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  cachedToken = { token: json.access_token, exp: now + (json.expires_in || 3600) };
  return cachedToken.token;
}

// ---------- Firebase custom token (senior admin login) ----------
export async function mintCustomToken(env, uid, claims) {
  const sa = getServiceAccount(env);
  const now = Math.floor(Date.now() / 1000);
  return signJwt(sa, {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    uid: String(uid),
    iat: now,
    exp: now + 3600,
    claims: claims || {},
  });
}

// ---------- Firestore REST value <-> JS ----------
export function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFsFields(v) } };
  return { stringValue: String(v) };
}
export function fromFsValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return fromFsFields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFsValue);
  return null;
}
export function toFsFields(obj) {
  const fields = {};
  for (const [k, val] of Object.entries(obj)) fields[k] = toFsValue(val);
  return fields;
}
export function fromFsFields(fields) {
  const obj = {};
  for (const [k, v] of Object.entries(fields || {})) obj[k] = fromFsValue(v);
  return obj;
}

// ---------- Firestore REST calls ----------
function fsBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents`;
}
async function fsFetch(env, url, init = {}) {
  const token = await getAccessToken(env);
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  return res;
}
/** Get one document by "collection/id" path. Returns {id, ...fields} or null. */
export async function fsGet(env, path) {
  const res = await fsFetch(env, `${fsBase(env)}/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore get ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const doc = await res.json();
  return { id: docId(doc.name), ...fromFsFields(doc.fields) };
}
/** Upsert a document at "collection/id" with the given fields (full replace). */
export async function fsSet(env, path, data) {
  const res = await fsFetch(env, `${fsBase(env)}/${path}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: toFsFields(data) }),
  });
  if (!res.ok) throw new Error(`Firestore set ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return fromFsFields((await res.json()).fields);
}
/** Merge specific fields into "collection/id" (updateMask). */
export async function fsUpdate(env, path, data) {
  const keys = Object.keys(data);
  const mask = keys.map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const res = await fsFetch(env, `${fsBase(env)}/${path}?${mask}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: toFsFields(data) }),
  });
  if (!res.ok) throw new Error(`Firestore update ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return fromFsFields((await res.json()).fields);
}
/** Create a document with an auto-generated id in a collection. Returns {id,...}. */
export async function fsCreate(env, collection, data) {
  const res = await fsFetch(env, `${fsBase(env)}/${collection}`, {
    method: 'POST',
    body: JSON.stringify({ fields: toFsFields(data) }),
  });
  if (!res.ok) throw new Error(`Firestore create ${collection} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const doc = await res.json();
  return { id: docId(doc.name), ...fromFsFields(doc.fields) };
}
/** Query a collection by equality filters {field: value}. Returns array of {id,...}. */
export async function fsQuery(env, collection, filters = {}, limit = 200) {
  const where = Object.entries(filters).map(([field, value]) => ({
    fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: toFsValue(value) },
  }));
  const structuredQuery = {
    from: [{ collectionId: collection }],
    limit,
    ...(where.length
      ? { where: where.length === 1 ? where[0] : { compositeFilter: { op: 'AND', filters: where } } }
      : {}),
  };
  const res = await fsFetch(env, `${fsBase(env)}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) throw new Error(`Firestore query ${collection} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  return rows.filter((r) => r.document).map((r) => ({ id: docId(r.document.name), ...fromFsFields(r.document.fields) }));
}
function docId(name) {
  return name ? name.split('/').pop() : null;
}

// ---------- PIN hashing (matches attendance-tracker/src/services/kioskPin.js) ----------
export async function hashPin(pin, memberId, salt) {
  const data = new TextEncoder().encode(`${memberId}:${pin}:${salt}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}
export async function verifyPinHash(pin, memberId, storedHash, salt) {
  if (!storedHash || !/^\d{4}$/.test(pin)) return false;
  if (storedHash.startsWith('sha256:')) return (await hashPin(pin, memberId, salt)) === storedHash;
  // Legacy fnv1a hashes are treated as needing reset (return false → prompt re-create).
  return false;
}

// ---------- KV rate limit (free) ----------
export async function rateLimit(env, key, max, windowSeconds) {
  if (!env.RATELIMIT) return { ok: true, remaining: max }; // KV not bound → fail open (dev)
  const raw = await env.RATELIMIT.get(key);
  const count = raw ? Number(raw) : 0;
  if (count >= max) return { ok: false, remaining: 0 };
  await env.RATELIMIT.put(key, String(count + 1), { expirationTtl: windowSeconds });
  return { ok: true, remaining: max - count - 1 };
}
export async function rateLimitReset(env, key) {
  if (env.RATELIMIT) await env.RATELIMIT.delete(key);
}
