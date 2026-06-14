import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import {
  productionFirebaseConfig,
  productionSparkKioskMode,
} from '../config/firebaseConfig.js';

const PLACEHOLDER_VALUES = new Set([
  'your_api_key',
  'YOUR_FIREBASE_API_KEY',
  'your-project-id',
  'YOUR_PROJECT_ID',
]);

function configValue(envValue, fallback) {
  if (envValue && !PLACEHOLDER_VALUES.has(envValue)) return envValue;
  return fallback;
}

const firebaseConfig = {
  apiKey: configValue(import.meta.env.VITE_FIREBASE_API_KEY, productionFirebaseConfig.apiKey),
  authDomain: configValue(
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    productionFirebaseConfig.authDomain
  ),
  projectId: configValue(
    import.meta.env.VITE_FIREBASE_PROJECT_ID,
    productionFirebaseConfig.projectId
  ),
  storageBucket: configValue(
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    productionFirebaseConfig.storageBucket
  ),
  messagingSenderId: configValue(
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    productionFirebaseConfig.messagingSenderId
  ),
  appId: configValue(import.meta.env.VITE_FIREBASE_APP_ID, productionFirebaseConfig.appId),
};

export function isFirebaseConfigured() {
  const key = firebaseConfig.apiKey;
  const projectId = firebaseConfig.projectId;
  return Boolean(
    key &&
    projectId &&
    key !== 'your_api_key' &&
    key !== 'YOUR_FIREBASE_API_KEY' &&
    projectId !== 'your-project-id' &&
    projectId !== 'YOUR_PROJECT_ID'
  );
}

/** Spark / free tier: Firestore roster + local kiosk attendance (no Cloud Functions). Defaults on unless explicitly disabled. */
export function isSparkKioskMode() {
  if (!isFirebaseConfigured()) return false;
  if (import.meta.env.VITE_FIREBASE_EMULATOR === 'true') return false;
  const freeMode = import.meta.env.VITE_FIREBASE_FREE_MODE;
  if (freeMode === 'false') return false;
  if (freeMode === 'true') return true;
  return productionSparkKioskMode;
}

export function isCloudBackendMode() {
  return isFirebaseConfigured() && !isSparkKioskMode();
}

let app = null;
let db = null;
let functions = null;
let storage = null;

export function getFirebaseApp() {
  if (!isFirebaseConfigured()) return null;
  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  return app;
}

export function getDb() {
  if (!isFirebaseConfigured()) return null;
  if (!db) {
    db = getFirestore(getFirebaseApp());
    if (import.meta.env.VITE_FIREBASE_EMULATOR === 'true') {
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
    }
  }
  return db;
}

export function getFirebaseFunctions() {
  if (!isFirebaseConfigured()) return null;
  if (!functions) {
    functions = getFunctions(getFirebaseApp());
    if (import.meta.env.VITE_FIREBASE_EMULATOR === 'true') {
      connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    }
  }
  return functions;
}

export function getFirebaseStorage() {
  if (!isFirebaseConfigured()) return null;
  if (!storage) {
    storage = getStorage(getFirebaseApp());
    if (import.meta.env.VITE_FIREBASE_EMULATOR === 'true') {
      connectStorageEmulator(storage, '127.0.0.1', 9199);
    }
  }
  return storage;
}

export function callFunction(name) {
  const fn = getFirebaseFunctions();
  if (!fn) throw new Error('Firebase is not configured.');
  return httpsCallable(fn, name);
}

export { firebaseConfig };
