# TN-170 Attendance — Secure Architecture (free, protects everyone's data)

This is the migration that takes the **entire roster, all PIN hashes, and all guest
PII off the public internet** — for every member, not only cadets — while keeping
the kiosk working and staying **100% free (no billing card)**.

## Why this is needed
The kiosk currently talks to Firestore directly with a public key, so anyone can
read the roster, guest email/phone, and the (crackable 4-digit) PIN hashes. Rules
alone can't fix that. The fix is to put a small trusted API in front of Firestore
and lock the database.

## The design
```
Public kiosk (GitHub Pages)
   │  reads ONLY: settings/squadron + publicPresence/current (sanitized, no PII)
   │  all actions (check-in/out, guest, PIN) → API call
   ▼
Cloudflare Worker  "tn170-attendance-api"   (free plan)
   │  holds the service account; verifies PINs (rate-limited via free KV);
   │  writes attendance/guests; maintains the sanitized publicPresence doc;
   │  mints a Firebase custom token so seniors log in with their PIN
   ▼
Firestore (Spark)  — rules DENY all public access to roster/PINs/PII;
   authenticated seniors (custom token) may READ for the admin dashboard.
```

## Everything stays free (no billing card)
| Component | Free tier | Notes |
| --- | --- | --- |
| GitHub Pages | free | kiosk hosting (unchanged) |
| Firebase Spark — Firestore | free, no card | Worker reads/writes count here; usage is tiny |
| Firebase Auth (custom tokens) | free | senior admin login; no email/passwords needed |
| Cloudflare Workers | free (100k req/day) | the API |
| Cloudflare KV | free | PIN rate-limit counters only |
| `*.workers.dev` or `api.faithbasedpilot.com` | free | your call |

**Never enable:** Firebase Blaze / Cloud Functions, Cloudflare Durable Objects, or
Cloudflare's paid Rate-Limiting product. None are used here.

---

## Deploy runbook (run these in YOUR logged-in environment)

> You need: a free Cloudflare account, Node.js, and the Firebase **service-account
> JSON** (the same one already in your GitHub secret `FIREBASE_SERVICE_ACCOUNT_JSON`).

### 1. Get the Worker code
```bash
cd worker
npm install          # installs wrangler locally
npx wrangler login   # opens your browser (you're already signed in) to authorize
```

### 2. Create the free KV namespace (rate-limit counters)
```bash
npx wrangler kv namespace create RATELIMIT
```
Copy the printed `id` into `worker/wrangler.toml` under `[[kv_namespaces]]` (replace
`REPLACE_WITH_KV_NAMESPACE_ID`).

### 3. Store the service account as a secret (never in code)
```bash
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
# paste the full JSON when prompted, press Enter
```

### 4. Confirm config in `wrangler.toml`
- `PROJECT_ID = "tn170-attendance"`
- `ALLOWED_ORIGINS = "https://tmaratos.github.io"` (add others if you test locally,
  comma-separated, e.g. `,http://localhost:5173`)
- `PIN_SALT = "tn170-kiosk-v1"` (must match the app; don't change)

### 5. Deploy the Worker
```bash
npx wrangler deploy
```
Note the URL it prints, e.g. `https://tn170-attendance-api.<subdomain>.workers.dev`.

### 6. Verify it works against your Firebase
```bash
curl https://tn170-attendance-api.<subdomain>.workers.dev/health
#   → {"ok":true,"service":"tn170-attendance-api"}
curl https://tn170-attendance-api.<subdomain>.workers.dev/selftest
#   → {"ok":true,"firestore":"reachable"}   (proves the service account + REST work)
```
If `/selftest` returns an error, the service-account secret or `PROJECT_ID` is wrong.

### 7. Point the app at the Worker (done in the next code change)
The kiosk build will read the API URL from `VITE_ATTENDANCE_API` at build time.
Set it in `attendance-tracker/.env` (and the Pages build) to your Worker URL, then
rebuild Pages. *(This step lands with the client-rewiring commit — see task list.)*

### 8. LAST: lock down Firestore
Only after steps 5–7 are live and the kiosk is confirmed working through the Worker:
```bash
cp security/firestore.rules.locked firestore.rules
firebase deploy --only firestore:rules
```
Now the roster, PIN hashes, and guest PII are no longer publicly readable.

---

## Test checklist (with your logins)
1. `/health` and `/selftest` return ok.
2. From the kiosk: search a name → only matches come back (no CAPID in the network response).
3. Check in with a correct PIN → succeeds; wrong PIN 5× → locked out (429) for 15 min.
4. The public "present" board shows "First L." only — open dev-tools Network and
   confirm **no CAPID, email, phone, or PIN hash** appears in any response.
5. Senior admin login (CAPID + PIN) → admin dashboard loads (custom-token auth).
6. In an incognito window (not logged in), try to read Firestore directly — denied.

## Rollback
If anything misbehaves after step 8, restore open reads instantly:
```bash
git checkout <pre-lockdown-sha> -- firestore.rules   # e.g. the committed firestore.rules
firebase deploy --only firestore:rules
```
The Worker can stay deployed; it does no harm even if rules are open.

## Optional hardening (still free)
- **Firebase App Check (reCAPTCHA v3)** on the kiosk for the two public reads.
- Add an `X-Api-Key`/App-Check header check in the Worker to further limit direct abuse.
- Move from 4-digit PINs to 6-digit once verification is server-side (trivial now).

## What still needs building (tracked)
- Client rewiring: kiosk calls the Worker; admin uses `signInWithCustomToken`; the
  kiosk reads only `settings` + `publicPresence`. (Task in progress.)
