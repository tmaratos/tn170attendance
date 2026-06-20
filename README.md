# TN-170 Attendance Kiosk

Civil Air Patrol TN-170 Oak Ridge Composite Squadron attendance tracker.

**Live site:** [https://tmaratos.github.io/tn170attendance/](https://tmaratos.github.io/tn170attendance/)

## Hosting

| Layer | Service | Role |
| --- | --- | --- |
| **App (kiosk UI)** | [GitHub Pages](https://pages.github.com/) | Serves the static React app from the repo root (`npm run build:pages`, then commit and push) |
| **Backend** | [Firebase Spark](https://firebase.google.com/pricing) (Firestore only) | Read-only member roster; rules and indexes deployed with `npm run deploy` |
| **Email DNS** | Cloudflare (`tncap.us`) | SPF/DKIM for outbound weekly reports only — **not** the kiosk website |

Do **not** point GoDaddy or `tncap.us` at the kiosk unless you add a [custom GitHub Pages domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site) later.

## Free forever (Spark)

This project runs on **Firebase Spark ($0/month)** for Firestore — no Blaze, no billing card. See [docs/DEPLOY.md](docs/DEPLOY.md) for setup and deployment.

**Production on Spark:** member roster in Firestore (read-only from the app), attendance and PINs on each kiosk device (localStorage). Cloud Functions code is kept for a possible future Blaze upgrade but is not deployed.

## Quick start

```powershell
cd attendance-tracker
npm install
Copy-Item .env.example .env   # add Firebase web config
npm run dev
```

Without `.env`, the app runs in mock mode with sample data.
