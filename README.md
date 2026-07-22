# TN-170 Attendance Kiosk

Civil Air Patrol TN-170 Oak Ridge Composite Squadron attendance tracker.

**Live site:** [https://tmaratos.github.io/tn170attendance/](https://tmaratos.github.io/tn170attendance/)

## Hosting

| Layer | Service | Role |
| --- | --- | --- |
| **App (kiosk UI)** | [GitHub Pages](https://pages.github.com/) | Serves the static React app from the repo root (`npm run build:pages`, then commit and push) |
| **Backend (source of truth)** | [Firebase Spark](https://firebase.google.com/pricing) (Firestore only) | Roster **and** meetings, attendance, guests, activity, PIN hashes — synced across all devices in real time; rules/indexes deployed with `npm run deploy` |
| **Automation** | GitHub Actions | Tue **9:30 PM ET** server-side force checkout; Tue **10:30 PM ET** Discord attendance report |
| **Email DNS** | Cloudflare (`tncap.us`) | SPF/DKIM for **optional** outbound email only — **not** the kiosk website or Firebase |

There is **no Firebase Authentication** — admin access is a 4-digit PIN checked
against a hash in Firestore. See [docs/SECURITY.md](docs/SECURITY.md).

Do **not** point GoDaddy or `tncap.us` at the kiosk unless you add a [custom GitHub Pages domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site) later.

## Free forever (Spark)

This project runs on **Firebase Spark ($0/month)** for Firestore — no Blaze, no billing card. See [docs/DEPLOY.md](docs/DEPLOY.md) for setup and [docs/AUDIT_2026-07.md](docs/AUDIT_2026-07.md) for the July 2026 audit & repair report.

**Production on Spark:** Firestore is the authoritative store for the roster **and**
all operational data (meetings, attendance, guests, activity, PIN hashes), synced
across every device via real-time listeners. LocalStorage is only a clearly-labeled
offline cache. Cloud Functions code is kept for a possible future Blaze upgrade but
is not deployed.

## Quick start

```powershell
cd attendance-tracker
npm install
Copy-Item .env.example .env   # add Firebase web config
npm run dev
```

Without `.env`, the app runs in mock mode with sample data.
