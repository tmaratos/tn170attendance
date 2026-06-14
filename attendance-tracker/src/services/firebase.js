import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
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

/** Spark / free tier: Firestore roster + local kiosk attendance (no Cloud Functions). */
export function isSparkKioskMode() {
  if (!isFirebaseConfigured()) return false;
  if (import.meta.env.VITE_FIREBASE_EMULATOR === 'true') return false;
  return import.meta.env.VITE_FIREBASE_FREE_MODE === 'true';
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
