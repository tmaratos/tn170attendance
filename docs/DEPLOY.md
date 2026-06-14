# TN-170 Attendance Tracker — Firebase Deployment

## Prerequisites

1. [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
2. Firebase project (default alias: `tn170-attendance` in `.firebaserc`)
3. Node.js 20+

## One-Time Firebase Console Setup

1. Create a Firebase project (or use existing `tn170-attendance`).
2. Enable **Cloud Firestore** (production mode; rules deployed from repo).
3. Enable **Cloud Functions** (Blaze/pay-as-you-go required for Functions).
4. Enable **Firebase Hosting**.
5. Register a **Web app** and copy config values into `attendance-tracker/.env` (see `.env.example`).

## Local Configuration

```powershell
cd C:\tn170attendance\attendance-tracker
Copy-Item .env.example .env
# Edit .env with your Firebase web app config
```

Optional emulator mode:

```
VITE_FIREBASE_EMULATOR=true
```

## Install Dependencies

```powershell
cd C:\tn170attendance
npm install
cd attendance-tracker; npm install
cd ..\functions; npm install
```

## Seed Member Roster

Requires authenticated ADC:

```powershell
firebase login
gcloud auth application-default login
$env:FIREBASE_PROJECT_ID="tn170-attendance"
npm run seed:members
```

Optional: place roster at `data/roster.txt` or `docs/roster.txt` (one line per member: `CAPID Grade First ... Last`).

The seed script:

- Merges roster without deleting existing members
- Preserves PIN hashes (`memberPins`), attendance, and custom permissions
- Sets admin permissions for designated senior members

## Build & Deploy

```powershell
cd C:\tn170attendance\attendance-tracker
npm run build

cd C:\tn170attendance
firebase deploy
```

Deploy subsets:

```powershell
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
firebase deploy --only hosting
```

## Verify

```powershell
# Functions syntax check
cd C:\tn170attendance\functions; node -c index.js

# Hosting preview (after build)
cd C:\tn170attendance\attendance-tracker; npm run preview
```

## Architecture Summary

| Layer | Responsibility |
|-------|----------------|
| **Firestore** | Read-only from clients (roster search, live attendance display) |
| **Cloud Functions** | PIN, check-in/out, force actions, guests, reports, member admin |
| **Hosting** | SPA from `attendance-tracker/dist` |

### Collections

- `members` — roster (CAPID or `TEMP-YYYYMMDD-####` for pending)
- `memberPins` — bcrypt PIN hashes (never client-readable)
- `meetings` — nightly meeting records
- `attendanceRecords` — member check-in/out
- `guests` / `guestAttendanceRecords` — guest tracking
- `activityLog` — audit trail
- `reportExports` — export audit log
- `settings/squadron` — squadron metadata

### Callable Functions

`createPin`, `verifyPinAndCheckIn`, `verifyPinAndCheckOut`, `forceCheckIn`, `forceCheckOut`, `resetMemberPin`, `guestCheckIn`, `guestCheckOut`, `createPendingMember`, `updatePendingMemberCapid`, `deactivateMember`, `reactivateMember`, `exportReport`, `startMeeting`, `closeMeeting`, `verifySeniorAccess`

## Without Firebase

If `.env` is not configured, the app falls back to localStorage + mock data for UI development.
