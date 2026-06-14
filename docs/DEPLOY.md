# TN-170 Attendance Tracker — Firebase Deployment

## Permanent free policy (Spark only)

This project **must stay on the Firebase Spark plan ($0/month, no billing card)**. Do **not** upgrade to Blaze.

| Service | Spark | TN-170 usage |
|---------|-------|--------------|
| **Firestore** | Yes — 50K reads / 20K writes / day | Read-only member roster from clients; seeded via Admin SDK or console |
| **Hosting** | Yes — 10 GB storage, 360 MB/day transfer | Static SPA |
| **Cloud Functions** | **Not available** | Code kept in repo for a future Blaze upgrade only — **never deploy on Spark** |
| **Firebase Storage / Auth** | Not used | Not used |

### Production architecture on Spark (kiosk mode)

When Firebase web config is present, the app runs in **kiosk mode** by default:

1. **Member roster** — read from Firestore (seed once with `npm run seed:members` or console import).
2. **Attendance, guests, activity** — stored in **localStorage on each kiosk device** (per-device, not shared across tablets).
3. **PINs** — hashed in the browser (FNV-1a / Web Crypto) and stored locally on the device. Less secure than server-side bcrypt via Cloud Functions, but required without Blaze.
4. **Admin tools** — shared 4-digit admin PIN configured in Settings (stored locally on the device).

The kiosk UI shows a **“Kiosk mode”** banner when this path is active.

Set `VITE_FIREBASE_FREE_MODE=false` only if you intentionally upgrade to Blaze and deploy Cloud Functions. Use `VITE_FIREBASE_EMULATOR=true` for full-stack local testing with emulators (free, no cloud billing).

### What Cloud Functions would add (Blaze only — not used today)

Callable Functions (`createPin`, `verifyPinAndCheckIn`, etc.) require Blaze. The `functions/` directory is maintained for a possible future upgrade but is **not deployed** on Spark.

### What we deliberately avoid

- No Blaze upgrade, no billing card, no paid Google Cloud APIs
- No Firebase Storage, Cloud Vision, Maps, SMS, or third-party paid services
- No Firebase Auth (PIN auth is local on Spark; server-side on Blaze)
- No Cloud Functions deploy on Spark

## Prerequisites

1. [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
2. Firebase project `tn170-attendance` (Spark plan)
3. Node.js 20+

## One-Time Firebase Console Setup

1. Create or use project `tn170-attendance` — stay on **Spark**.
2. Enable **Cloud Firestore** (production mode; deploy rules from repo).
3. Register a **Web app** and copy config into `attendance-tracker/.env` (see `.env.example`).
4. Enable **Firebase Hosting**.
5. Do **not** enable Storage, Auth, or upgrade to Blaze.

## Local Configuration

```powershell
cd C:\tn170attendance\attendance-tracker
Copy-Item .env.example .env
# Edit .env with your Firebase web app config
# VITE_FIREBASE_FREE_MODE=true is the default for Spark (kiosk mode)
```

Optional emulator mode (full PIN/check-in stack locally, no cloud billing):

```
VITE_FIREBASE_EMULATOR=true
VITE_FIREBASE_FREE_MODE=false
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

Requires authenticated CLI (free — no Blaze):

```powershell
firebase login
# If seed fails with auth errors:
firebase login --reauth
gcloud auth application-default login
$env:FIREBASE_PROJECT_ID="tn170-attendance"
npm run seed:members
```

Optional: place roster at `data/roster.txt` or `docs/roster.txt` (one line per member: `CAPID Grade First ... Last`).

The seed script merges roster without deleting existing members and preserves PIN hashes server-side for a future Blaze migration.

## Build & Deploy (Spark)

```powershell
cd C:\tn170attendance\attendance-tracker
npm run build

cd C:\tn170attendance
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

Or from repo root:

```powershell
npm run deploy:spark
```

**Do not run** `firebase deploy --only functions` on Spark — Functions will not run.

## Verify

```powershell
cd C:\tn170attendance\functions; node -c index.js
cd C:\tn170attendance\attendance-tracker; npm run preview
```

## Architecture Summary

| Layer | Spark (production) | Blaze (future, optional) |
|-------|-------------------|--------------------------|
| **Firestore** | Read-only roster for clients | Roster + attendance records |
| **Hosting** | Static SPA | Static SPA |
| **Cloud Functions** | Not deployed | PIN verify, check-in/out, admin |
| **localStorage** | Attendance, PINs, guests per device | Not used |

### Collections (Firestore)

- `members` — roster (CAPID or `TEMP-YYYYMMDD-####` for pending)
- `memberPins` — bcrypt hashes (seed/functions only; never client-readable)
- Other collections exist for Blaze mode but are unused on Spark kiosk

## Without Firebase

If `.env` is missing or has placeholder values, the app uses **mock/localStorage mode** with bundled sample data — useful for offline UI development with no cloud account.
