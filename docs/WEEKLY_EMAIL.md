# Weekly attendance email (Tuesday 10 PM)

Automated attendance CSV emails run via **GitHub Actions** — no Firebase Cloud Functions or Blaze billing required.

## Schedule

- **When:** Every **Tuesday at 10:00 PM** in `America/New_York` (Oak Ridge, TN — Eastern Time)
- **What:** Fetches tonight's meeting from Firestore, builds a CSV (same columns as in-app export), and emails it to configured recipients
- **Workflow:** `.github/workflows/weekly-attendance-email.yml`
- **Script:** `scripts/weekly-attendance-email.js`

GitHub Actions cron uses UTC. The workflow runs at several UTC times on Wednesday morning and the script only sends when local time is Tuesday hour 22 in `SCHEDULE_TIMEZONE`.

Override timezone or hour with repository **Variables** (optional):

| Variable | Default | Purpose |
| --- | --- | --- |
| `SCHEDULE_TIMEZONE` | `America/New_York` | IANA timezone for send window |
| `MEETING_DAY` | `Tuesday` | Weekday name for gate check |
| `SEND_HOUR` | `22` | Hour (24h) to send |

## GitHub Secrets to configure

Open **GitHub → repo → Settings → Secrets and variables → Actions → New repository secret**.

### Required

| Secret | Description |
| --- | --- |
| `EMAIL_RECIPIENTS` | Comma-separated recipient addresses (you can add these later) |
| `EMAIL_FROM` | Verified sender address (e.g. `attendance@yourdomain.com`) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full JSON for a Firebase service account with Firestore read access |

### Email transport — use SMTP **or** Resend

**Option A — SMTP (Gmail app password, Mailgun, etc.)**

| Secret | Description |
| --- | --- |
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | e.g. `587` |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password or app password |
| `SMTP_SECURE` | Optional: `true` for port 465 |

**Option B — Resend**

| Secret | Description |
| --- | --- |
| `RESEND_API_KEY` | API key from [resend.com](https://resend.com) |

If `RESEND_API_KEY` is set, Resend is used; otherwise SMTP is used.

## Firebase service account

1. Firebase console → Project settings → Service accounts → **Generate new private key**
2. Copy the entire JSON file contents into the `FIREBASE_SERVICE_ACCOUNT_JSON` secret
3. Do **not** commit the key file to the repo

Local runs (after `firebase login` / ADC):

```powershell
$env:FIREBASE_PROJECT_ID = "tn170-attendance"
$env:EMAIL_RECIPIENTS = "you@example.com"
$env:EMAIL_FROM = "attendance@yourdomain.com"
$env:SMTP_HOST = "smtp.example.com"
$env:SMTP_USER = "..."
$env:SMTP_PASS = "..."
$env:FORCE_SEND = "true"
npm run email:weekly
```

## Manual test from GitHub

1. Actions → **Weekly attendance email** → **Run workflow**
2. Set **force_send** to `true` to bypass the Tuesday 10 PM gate
3. Check workflow logs and recipient inboxes

## Empty meeting nights

If no `meetings` document exists for that date, the email still sends with CSV headers and a summary showing zero records.
