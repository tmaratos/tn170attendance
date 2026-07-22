# TN-170 Attendance — Firestore Security Assessment & Migration Plan

**Model:** public, **unauthenticated** kiosk. There is **no Firebase
Authentication**. "Admin login" is a client-side 4-digit **PIN** check against a
hash in Firestore. Because there is no Auth, Firestore rules can validate the
*shape* of a write but cannot verify *who* is writing. The Firebase Web API key is
public by design — that alone is fine — but **do not** conclude the system is
secure because of it. It is not, and the reasons are below.

## What an unauthenticated user can currently do

**Read (all readable — the kiosk needs these and rules are all-or-nothing per doc):**

- `members` — full roster (names, grades, CAPIDs, permission flags).
- `memberPins` — **PIN hashes**. These are salted with a *constant* salt + memberId
  and cover a **4-digit** PIN (10,000 possibilities). Whether `fnv1a` (32-bit) or
  `sha256`, they are **trivially crackable offline** once read. This is the most
  serious exposure.
- `attendanceRecords`, `guestAttendanceRecords` — attendance plus **guest email and
  phone** (PII).
- `activityLog`, `meetings`, `settings`, `reportExports`, `automationRuns`.

**Write (shape-validated, but identity cannot be checked):**

- `members` **create** — allowed if the document matches the roster schema. Hardened
  so permission flags must match the grade (a cadet grade cannot be given admin
  flags), but an attacker can still create a *senior-grade* member and thereby be
  treated as admin client-side. Inherent to no-Auth.
- `memberPins` create/update — only for an existing active member, and only when no
  valid PIN exists or a reset is required.
- `attendanceRecords` / `guestAttendanceRecords` create/update — shape-validated
  check-in/out for active members / guests.
- `activityLog` create — append-only, `activityType` ≤ 64 chars.
- `meetings` create/update — `in_progress` only; **`systemForceCompletedDate` is no
  longer client-writable** (server-only).
- `automationRuns`, `settings`, `reportExports` — **read-only** to clients (server
  writes via Admin SDK, which bypasses rules).

So yes: an attacker can read PIN hashes and crack them, read guest contact info,
create roster/attendance/activity records, and (via a senior-grade create + PIN)
act as an admin. **This cannot be closed by rules alone under a no-Auth kiosk.**

## Hardening applied now (safe, does not break the kiosk)

- Member create/update **permission flags must equal (grade is senior)** — blocks
  privilege escalation by setting `isAdmin`/`canManageMembers` on a cadet.
- Clients can no longer write `systemForceCompletedDate` (prevents tampering with
  force-checkout state).
- `automationRuns` is client-read-only (audit/idempotency integrity).
- `activityLog.activityType` length-bounded.
- All reads remain open **only because the kiosk requires them** — documented here.

## Recommended migration (choose one; A is the pragmatic next step)

### A. Firebase App Check + reCAPTCHA v3 — **recommended, free, Spark-compatible**

Blocks off-domain scripted access to your Firestore, so an attacker can't just point
a script at the public API to scrape roster/PIN hashes.

- **Cost:** $0 (App Check + reCAPTCHA v3 web are free).
- **Complexity:** low. Code is already scaffolded: set `VITE_RECAPTCHA_SITE_KEY` at
  build time (the app calls `initializeAppCheck` automatically), then in the console:
  1. https://console.firebase.google.com → **tn170-attendance** → **App Check**.
  2. Register the Web app with the **reCAPTCHA v3** provider (create a site key at
     google.com/recaptcha, add `tmaratos.github.io` to allowed domains).
  3. Put the **site key** in the `VITE_RECAPTCHA_SITE_KEY` build env, rebuild Pages.
  4. In **App Check → APIs → Cloud Firestore**, switch to **Enforce** (do this only
     after the enforced build is live, and watch the App Check metrics first).
- **Operational impact:** legitimate kiosk traffic from the Pages domain passes
  transparently; scripted/off-domain access is rejected. Does not fix the fact that a
  determined user *on the kiosk page* can still read what the page reads.

### B. Server-side PIN verification (full fix for the PIN-hash exposure)

Move PIN verification behind a trusted API so hashes are **never** sent to the
browser, and lock `memberPins` reads to `if false`.

- **Option B1 — Cloudflare Worker** (free tier): a Worker holds a Firebase Admin
  credential (or uses the REST API with a service account) and exposes
  `POST /verify-pin`, `POST /create-member`, etc. The kiosk calls the Worker; rules
  deny direct client writes/reads of sensitive collections. Cost $0 on the free tier;
  moderate complexity (deploy a Worker, store a secret, add routes). Keeps Firebase on
  Spark.
- **Option B2 — Firebase Cloud Functions**: cleanest integration, but Functions
  require the **Blaze** plan (has a free tier but needs a billing card) — currently
  out of scope by policy. The repo already contains callable-function code in
  `functions/` for a future Blaze upgrade.

### C. Firebase Authentication (anonymous or email) + rules requiring `request.auth`

Raises the bar (rules can require `auth != null`), but anonymous auth still lets
anyone obtain a token, so it is weaker than App Check for scraping and does not by
itself hide PIN hashes. Best combined with A and B.

## Recommendation

Prefer the **simplest secure-and-reliable** path:

1. **Now:** keep the hardened rules (deployed via `npm run deploy`); enable **App
   Check (A)** — free, low effort, real containment against off-domain scraping.
2. **Next:** implement **server-side PIN verification (B1, Cloudflare Worker)** and
   set `memberPins` read to `if false`, eliminating the crackable-hash exposure.
3. Consider shifting from a 4-digit PIN to a longer PIN once verification is
   server-side (a 4-digit secret is weak regardless of hashing).

Do **not** introduce Cloudflare into the kiosk/Firebase request path unless you adopt
B1; App Check (A) needs no Cloudflare.
