/**
 * Production Firebase web config for tn170-attendance (Spark / kiosk mode).
 * These are public client keys; restrict by domain in the Firebase console.
 * Local dev can override via attendance-tracker/.env (gitignored).
 */
export const productionFirebaseConfig = {
  apiKey: 'AIzaSyC5PktELxzQ93EdJhJOXIQlgZSSUI-tX64',
  authDomain: 'tn170-attendance.firebaseapp.com',
  projectId: 'tn170-attendance',
  storageBucket: 'tn170-attendance.firebasestorage.app',
  messagingSenderId: '1074396120068',
  appId: '1:1074396120068:web:f01637a7f6a6b8766ba151',
};

/** Spark kiosk mode default when env is not set at build time. */
export const productionSparkKioskMode = true;
