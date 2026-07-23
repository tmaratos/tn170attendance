/**
 * Firebase Admin initialization for TN-170 automation scripts.
 * Reads the service account from FIREBASE_SERVICE_ACCOUNT_JSON (GitHub secret),
 * a key file at GOOGLE_APPLICATION_CREDENTIALS, or application-default creds.
 */
import { initializeApp, cert, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';

export const DEFAULT_PROJECT_ID = 'tn170-attendance';

function env(name, fallback = '') {
  return process.env[name]?.trim() || fallback;
}

/** Returns { ok, mode, error } describing how Firebase would authenticate. */
export function describeFirebaseCredential() {
  if (env('FIREBASE_SERVICE_ACCOUNT_JSON')) {
    try {
      const parsed = JSON.parse(env('FIREBASE_SERVICE_ACCOUNT_JSON'));
      if (!parsed.project_id || !parsed.private_key) {
        return { ok: false, mode: 'service-account-json', error: 'JSON missing project_id/private_key' };
      }
      return { ok: true, mode: 'service-account-json', projectId: parsed.project_id };
    } catch (err) {
      return { ok: false, mode: 'service-account-json', error: `invalid JSON: ${err.message}` };
    }
  }
  const keyPath = env('GOOGLE_APPLICATION_CREDENTIALS');
  if (keyPath && existsSync(keyPath)) {
    return { ok: true, mode: 'key-file' };
  }
  return { ok: false, mode: 'application-default', error: 'no explicit credential provided' };
}

export function initFirebaseAdmin() {
  if (getApps().length) return getFirestore();

  const projectId = env('FIREBASE_PROJECT_ID', DEFAULT_PROJECT_ID);
  const json = env('FIREBASE_SERVICE_ACCOUNT_JSON');
  const keyPath = env('GOOGLE_APPLICATION_CREDENTIALS');

  if (json) {
    initializeApp({ credential: cert(JSON.parse(json)), projectId });
  } else if (keyPath && existsSync(keyPath)) {
    initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))), projectId });
  } else {
    initializeApp({ credential: applicationDefault(), projectId });
  }
  return getFirestore();
}
