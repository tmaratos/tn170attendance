# TN-170 Attendance Tracker - Firebase Deployment

## Permanent Free Policy

This project must stay on the Firebase Spark plan: $0/month and no billing card. Do not upgrade to Blaze.

| Service | Spark support | TN-170 usage |
| --- | --- | --- |
| Firestore | Yes | Read-only member roster from clients |
| Hosting | Yes | Static website hosting |
| Cloud Functions | No | Code remains in the repo only; it is blocked from deploy |
| Firebase Storage | Not used | Avoided to keep the project simple and free |
| Firebase Auth | Not used | PIN flow is handled by the kiosk app |

The repo is configured so `npm run deploy` uses the Spark-only deploy path. Functions are intentionally not listed in `firebase.json`, and `npm run deploy:functions` exits with a billing warning.

## Native Browser Setup

The Firebase console can be used for the free project setup:

1. Confirm the project is on Spark: Project overview -> Billing/Usage should show Spark or no-cost.
2. Create/enable Cloud Firestore in production mode.
3. Open Firestore and add/import the roster data.
4. Open Hosting and click Get started.

Firebase Hosting does not upload a built website directly from the browser. The Hosting setup screen gives Firebase CLI commands. That is normal and still free as long as only Hosting and Firestore rules/indexes are deployed.

Do not click Upgrade, Blaze, enable billing, or deploy Functions.

## Spark Kiosk Architecture

When Firebase web config is present, the app runs in free kiosk mode by default:

1. Member roster: read from Firestore.
2. Attendance, guests, activity, and PIN hashes: stored locally in browser localStorage on each kiosk device.
3. Admin PIN/settings: stored locally on the kiosk device.

This keeps the live site free. The tradeoff is that attendance data is per device, not shared between multiple iPads.

`attendance-tracker/.env.example` sets:

```text
VITE_FIREBASE_FREE_MODE=true
```

Only set `VITE_FIREBASE_FREE_MODE=false` if the project is intentionally upgraded to Blaze and Cloud Functions are deployed. That is not the TN-170 free setup.

## Firestore Roster Setup

Use the existing roster file:

```powershell
node scripts/generate-import-json.js
```

This writes:

```text
data/firestore-import.json
```

The JSON contains:

- `members`: 52 roster records
- `settings`: squadron display settings

Firestore rules keep client writes blocked for shared cloud collections. Roster changes should be made by an admin import/seed step, not by the public kiosk UI.

## Free Deploy Command

From the repo root:

```powershell
npm run deploy
```

That command is equivalent to:

```powershell
npm run deploy:spark
```

Which builds the app and deploys only:

```powershell
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

If Firebase CLI auth expires, reauthenticate:

```powershell
firebase login --reauth
```

Then rerun:

```powershell
npm run deploy
```

## Commands to Avoid

Do not run:

```powershell
firebase deploy --only functions
```

Do not run a bare Firebase deploy from an older checkout that still includes Functions:

```powershell
firebase deploy
```

In this repo version, `firebase.json` no longer includes Functions, but the safest habit is still to use `npm run deploy`.

## Verify Locally

```powershell
cd C:\tn170attendance\attendance-tracker
npm run build
npm run preview
```

The kiosk should show the local clock, kiosk mode, roster search, PIN flow, guest flow, and admin routes without any paid Firebase services.
