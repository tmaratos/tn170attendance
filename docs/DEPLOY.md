# TN-170 Attendance Tracker — Firebase Deployment

## Free tier (Spark vs Blaze)

This project is designed to stay **$0/month** for typical squadron kiosk usage (~40 members, one meeting per week).

| Service | Spark (free) | Blaze (pay-as-you-go) | TN-170 usage |
|---------|--------------|------------------------|--------------|
| **Firestore** | Yes — 50K reads / 20K writes / 20K deletes per day | Same free daily quotas, then per-operation pricing | Roster search + live attendance display; well within free limits |
| **Hosting** | Yes — 10 GB storage, 360 MB/day transfer | Same free quotas, then usage pricing | Static SPA; negligible for one squadron |
| **Cloud Functions** | **Not available** | Required to deploy; includes generous **always-free monthly quotas** | PIN verify, check-in/out, admin actions (~hundreds of calls/meeting) |
| **Firebase Storage** | Not used | Not used | Reports export as CSV/JSON in-browser — no file uploads |

### Cloud Functions and Blaze

Callable Functions (`createPin`, `verifyPinAndCheckIn`, etc.) **require upgrading to Blaze**. Blaze is pay-as-you-go but includes free monthly quotas that cover this app:

- **2M** function invocations
- **400K GB-seconds** compute
- **200K GHz-seconds** CPU

A squadron kiosk (dozens of check-ins per meeting, ~4 meetings/month) should remain **$0** if usage stays within these quotas.

**Without Blaze:** Firestore + Hosting work on Spark, but PIN/check-in flows that call Cloud Functions will fail until Functions are deployed. The app automatically falls back to **mock/localStorage mode** when `attendance-tracker/.env` is missing or placeholder values are used — useful for free local UI development.

### Billing safety

1. In [Google Cloud Console → Billing → Budgets](https://console.cloud.google.com/billing/budgets), create a budget for project `tn170-attendance`.
2. Set alert thresholds at **$0**, **$1**, and **$5**.
3. Optionally cap daily spend (Functions/Firestore overages are extremely unlikely at squadron scale).

### What we deliberately avoid

- No Firebase Storage, Cloud Vision, Maps, SMS, or third-party paid APIs
- No Firebase Auth (PIN auth runs in Cloud Functions + Firestore rules block client writes)
- No paid Google Cloud APIs beyond Firebase essentials (Firestore, Functions, Hosting)

## Prerequisites

1. [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
2. Firebase project (default alias: `tn170-attendance` in `.firebaserc`)
3. Node.js 20+

## One-Time Firebase Console Setup

1. Create a Firebase project (or use existing `tn170-attendance`).
2. Enable **Cloud Firestore** (Standard edition, production mode; rules deployed from repo). Works on **Spark**.
3. Register a **Web app** and copy config values into `attendance-tracker/.env` (see `.env.example`).
4. Enable **Firebase Hosting** (Spark).
5. **Cloud Functions:** upgrade to **Blaze** when ready to deploy PIN/check-in backend (see [Free tier](#free-tier-spark-vs-blaze) above). Do not upgrade until you accept pay-as-you-go billing; set a $1 budget alert first.

## Local Configuration

```powershell
cd C:\tn170attendance\attendance-tracker
Copy-Item .env.example .env
# Edit .env with your Firebase web app config
```

Optional emulator mode (free local dev, no cloud billing):

```
VITE_FIREBASE_EMULATOR=true
```

Run emulators: `firebase emulators:start` (Firestore + Functions locally).

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

**Spark-only (Hosting + Firestore rules, no Functions):**

```powershell
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

**Full deploy (requires Blaze for Functions):**

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

Functions use bounded resources (`timeoutSeconds: 30`, `maxInstances: 10`, `256MiB` memory) to limit cost exposure.

## Without Firebase

If `.env` is not configured (or still has placeholder values), the app falls back to **localStorage + mock data** for full UI development — no cloud account or billing required.
