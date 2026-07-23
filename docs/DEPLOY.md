# TN-170 Attendance Tracker — Deployment

## Live site

The kiosk runs on **GitHub Pages**:

**https://tmaratos.github.io/tn170attendance/**

Firebase is the **Firestore backend only** (roster, rules, indexes). It is **not** the website host.

**Do not** point GoDaddy or `tncap.us` DNS at the kiosk app. Cloudflare on `tncap.us` is for **email DNS only** (see [WEEKLY_EMAIL.md](./WEEKLY_EMAIL.md)). If you want a custom domain on the kiosk later, configure it as a [GitHub Pages custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site) — not Firebase Hosting or GoDaddy web forwarding.

## Permanent Free Policy

This project must stay on the Firebase Spark plan: $0/month and no billing card. Do not upgrade to Blaze.

| Service | Spark support | TN-170 usage |
| --- | --- | --- |
| Firestore | Yes | Read-only member roster from clients |
| GitHub Pages | Yes (free) | **Primary** static app host |
| Firebase Hosting | Not used | App is on GitHub Pages, not Firebase Hosting |
| Cloud Functions | No | Code remains in the repo only; it is blocked from deploy |
| Firebase Storage | Not used | Avoided to keep the project simple and free |
| Firebase Auth | Not used | PIN flow is handled by the kiosk app |

The repo is configured so `npm run deploy` deploys **Firestore rules and indexes only**. Functions are intentionally not listed in `firebase.json`, and `npm run deploy:functions` exits with a billing warning. `npm run deploy:hosting` is blocked — use `npm run build:pages` instead.

## Deploy the frontend (GitHub Pages)

From the repo root:

```powershell
npm run build:pages
```

This builds the Vite app and copies `attendance-tracker/dist` to the repo root (`index.html`, `404.html`, `assets/`, etc.) via `scripts/sync-github-pages.js`.

Then commit and push to `main`. GitHub Pages serves the root of the repository.

Verify locally before pushing:

```powershell
cd attendance-tracker
npm run build
npm run preview
```

The kiosk should show the local clock, kiosk mode, roster search, PIN flow, guest flow, and admin routes without any paid Firebase services.

## Deploy Firestore rules and indexes

From the repo root:

```powershell
npm run deploy
```

That command is equivalent to:

```powershell
npm run deploy:spark
```

Which runs:

```powershell
firebase deploy --only firestore:rules,firestore:indexes
```

If Firebase CLI auth expires, reauthenticate:

```powershell
firebase login --reauth
```

Then rerun:

```powershell
npm run deploy
```

Rules-only deploy (no indexes change):

```powershell
npm run deploy:rules
```

## Native Browser Setup (Firebase console)

Use the Firebase console for the free Firestore project setup:

1. Confirm the project is on Spark: Project overview → Billing/Usage should show Spark or no-cost.
2. Create/enable Cloud Firestore in production mode.
3. Open Firestore and add/import the roster data.

You do **not** need Firebase Hosting for this project. Skip Hosting setup in the console unless you are exploring unrelated options.

Do not click Upgrade, Blaze, enable billing, or deploy Functions.

## Spark Kiosk Architecture

When Firebase web config is present, the app runs in free kiosk mode by default.
**Firestore is the source of truth and syncs across every device in real time:**

1. Member roster: Firestore (`members`).
2. Meetings: Firestore (`meetings`), keyed by a **deterministic Eastern-date
   document ID** (e.g. `meetings/2026-07-21`) so every device resolves the same
   meeting.
3. Attendance, guests, activity: Firestore (`attendanceRecords`,
   `guestAttendanceRecords`, `activityLog`), streamed via real-time listeners.
4. PIN hashes: Firestore (`memberPins`), hashed in the browser before upload.
5. Admin session: per-device in `sessionStorage` (kept device-specific for security).

LocalStorage is used **only** as a clearly-labeled offline cache — never as an
independent attendance database. When a device is offline, the app shows an
**Offline/Reconnecting** banner and the last successful sync time; when connectivity
returns it re-fetches the authoritative meeting from Firestore. Global force checkout
is performed **only** by the server-side GitHub Action (Tue 9:30 PM ET), never by the
browser. See [AUDIT_2026-07.md](./AUDIT_2026-07.md) and [SECURITY.md](./SECURITY.md).

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

## Commands to Avoid

Do not run:

```powershell
firebase deploy --only functions
npm run deploy:hosting
```

Do not run a bare Firebase deploy from an older checkout that still includes Functions or Hosting:

```powershell
firebase deploy
```

In this repo version, `firebase.json` no longer includes Functions or Hosting, but the safest habit is still to use `npm run deploy` for Firestore backend changes and `npm run build:pages` for frontend changes.
