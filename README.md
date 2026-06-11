# TN-170 Attendance Kiosk

Civil Air Patrol TN-170 Oak Ridge Composite Squadron attendance tracker.

## Current status

This is the first website starter for the attendance tracker. It includes:

- Member check-in / check-out UI
- First-time PIN setup UI
- Guest sign-in under a host member
- Currently checked-in panel
- CSV export
- Print/PDF report path
- Firebase-ready data layer placeholder
- Squadron logo in `public/squadron-logo.jpeg`

## Architecture target

- Frontend: GitHub Pages-friendly static app
- Database: Firebase Firestore
- Secure logic later: Firebase Cloud Functions

The current `src/store.js` uses local browser storage only so the app can be viewed and tested before Firebase is connected.

## Firebase insertion point

Replace the demo adapter in `src/store.js` with Firestore calls. Use `src/firebase.example.js` and `docs/FIREBASE_SCHEMA.md` as the integration guide.

## Security note

For live squadron use, PIN validation should move to Firebase Cloud Functions so users cannot bypass validation from browser developer tools.

## Local preview

Open `index.html` in a browser, or serve the folder using any static server.

## GitHub Pages

This app is static and can be hosted from GitHub Pages once pushed to a repository.
