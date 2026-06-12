/*
  Firebase placeholder for TN-170 Attendance Kiosk
  ------------------------------------------------------------
  1. Create a Firebase project.
  2. Enable Firestore.
  3. Enable Authentication when ready for admin accounts.
  4. Copy this file to firebase.js.
  5. Replace the placeholder values with your Firebase config.

  Important:
  - Store member data in Firestore collections.
  - Keep PIN validation rules server-side with Firebase Cloud Functions
    before live use. Do not trust browser-only validation for production.
  - Do not expose admin-only functions to cadets/guests.
*/

export const firebaseConfig = {
  apiKey: 'YOUR_FIREBASE_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

export const firestoreCollections = {
  members: 'members',
  meetings: 'meetings',
  attendance: 'attendance',
  guests: 'guests',
  guestAttendance: 'guestAttendance',
  reportLogs: 'reportLogs',
};
