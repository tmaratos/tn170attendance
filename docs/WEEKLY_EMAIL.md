# Weekly attendance email (Tuesday 10 PM)

Automated attendance CSV emails run via **GitHub Actions** — no Firebase Cloud Functions or Blaze billing required.

See also [GITHUB_AUTOMATION.md](./GITHUB_AUTOMATION.md) for the 9:30 PM force-checkout job.

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

## Default recipients

Set the `EMAIL_RECIPIENTS` GitHub secret to these comma-separated addresses:

```
249023@tncap.us,margaretadurgin@yahoo.com,Steven.Mellard@gmail.com,1tonyaosborne@gmail.com
```

## GitHub Secrets to configure

Open **GitHub → [tn170attendance](https://github.com/tmaratos/tn170attendance) → Settings → Secrets and variables → Actions → New repository secret**.

### Required

| Secret | Example / value | Description |
| --- | --- | --- |
| `EMAIL_RECIPIENTS` | See default list above | Comma-separated recipient addresses |
| `EMAIL_FROM` | `attendance@tncap.us` or `onboarding@resend.dev` for testing | Verified sender address |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | *(paste full JSON)* | Firebase service account with Firestore read access |

### Email transport — use SMTP **or** Resend

**Option A — Resend (recommended for GitHub Actions)**

1. Create account at [resend.com](https://resend.com)
2. Add and verify domain `tncap.us` (DNS records go in Cloudflare — see below)
3. Set secrets:

| Secret | Description |
| --- | --- |
| `RESEND_API_KEY` | API key from Resend dashboard |
| `EMAIL_FROM` | e.g. `TN-170 Attendance <attendance@tncap.us>` |

If `RESEND_API_KEY` is set, Resend is used; otherwise SMTP is used.

**Option B — SMTP (Gmail app password, Mailgun, etc.)**

| Secret | Description |
| --- | --- |
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | e.g. `587` |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password or app password |
| `SMTP_SECURE` | Optional: `true` for port 465 |

---

## Cloudflare and tncap.us email

### Receiving mail at 249023@tncap.us

**Cloudflare Email Routing** handles **inbound** mail only. If `249023@tncap.us` should forward to a personal inbox, configure that in Cloudflare → Email → Routing. This is **not** required for the GitHub Actions outbound report — recipients can receive at any address listed in `EMAIL_RECIPIENTS`.

### Sending mail **from** @tncap.us (EMAIL_FROM)

GitHub Actions does **not** send through Cloudflare Email Routing or Email Workers. Outbound mail uses **Resend** or **SMTP** with a verified domain.

**Recommended path (Resend + Cloudflare DNS):**

1. In [Resend](https://resend.com) → Domains → Add `tncap.us`
2. Resend shows DNS records (SPF, DKIM, optional DMARC)
3. In **Cloudflare** → DNS for `tncap.us` → add those records as instructed
4. Wait for Resend to show domain as verified
5. Set GitHub secrets: `RESEND_API_KEY`, `EMAIL_FROM=TN-170 Attendance <attendance@tncap.us>`

**Cloudflare Email Workers** are not needed for this setup. They are useful for custom inbound routing or programmatic replies, not for a scheduled CSV attachment from GitHub Actions.

**Alternative:** Use a personal Gmail with an [app password](https://support.google.com/accounts/answer/185833) and set `EMAIL_FROM` to that Gmail address (no Cloudflare DNS changes). Recipients still get the report; the From line will be Gmail, not `@tncap.us`.

---

## Firebase service account

1. Firebase console → Project settings → Service accounts → **Generate new private key**
2. Copy the entire JSON file contents into the `FIREBASE_SERVICE_ACCOUNT_JSON` secret
3. Do **not** commit the key file to the repo

Local runs (after `firebase login` / ADC):

```powershell
$env:FIREBASE_PROJECT_ID = "tn170-attendance"
$env:EMAIL_RECIPIENTS = "249023@tncap.us,margaretadurgin@yahoo.com,Steven.Mellard@gmail.com,1tonyaosborne@gmail.com"
$env:EMAIL_FROM = "attendance@tncap.us"
$env:RESEND_API_KEY = "re_..."
$env:FORCE_SEND = "true"
npm run email:weekly
```

## Manual test from GitHub

1. Actions → **Weekly attendance email** → **Run workflow**
2. Set **force_send** to `true` to bypass the Tuesday 10 PM gate
3. Check workflow logs and recipient inboxes

## CSV contents

The attachment includes **member and guest** rows for the meeting date:

| Column | Member | Guest |
| --- | --- | --- |
| Type | Member | Guest |
| Name | memberName | guestName |
| CAPID/Pending CAPID | capid or temporaryId | — |
| Role | role | — |
| Hosted By | — | hostName |
| Check-In / Check-Out / Duration | yes | yes |
| Status | Checked In / Checked Out | Present / Signed Out |
| Force Action Note | system or admin force notes | same |

## Empty meeting nights

If no `meetings` document exists for that date, the email still sends with CSV headers and a summary showing zero records.
