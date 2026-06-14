# TN-170 Attendance Kiosk

Civil Air Patrol TN-170 Oak Ridge Composite Squadron attendance tracker.

## Free forever (Spark)

This project runs on **Firebase Spark ($0/month)** — no Blaze, no billing card. See [docs/DEPLOY.md](docs/DEPLOY.md) for setup and deployment.

**Production on Spark:** member roster in Firestore (read-only from the app), attendance and PINs on each kiosk device (localStorage). Cloud Functions code is kept for a possible future Blaze upgrade but is not deployed.

## Quick start

```powershell
cd attendance-tracker
npm install
Copy-Item .env.example .env   # add Firebase web config
npm run dev
```

Without `.env`, the app runs in mock mode with sample data.
