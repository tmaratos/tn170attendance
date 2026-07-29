# GitHub Actions automation (Tuesday meeting nights)

Server-side jobs run on **GitHub Actions** — no Firebase Cloud Functions or Blaze
billing required. These jobs are the **authoritative** automation; the kiosk browser
no longer performs any global force checkout.

| Time (America/New_York) | Workflow | What happens |
| --- | --- | --- |
| **9:30 PM Tuesday** | [System force checkout](../.github/workflows/system-force-checkout.yml) | Force-checks-out all open member + guest attendance for that Eastern meeting date, exactly once |
| **10:00 PM Tuesday target** | [Weekly attendance report](../.github/workflows/weekly-attendance-email.yml) | Attempts at 10:00 and every five minutes through 10:30, posting the attendance ZIP exactly once to Discord channel `1517911401224736971`; optionally emails it |

> **Why the crons look "wrong":** GitHub delivers scheduled runs in **UTC** and can
> be **hours late**. Both scripts validate `America/New_York` wall-clock time, target
> a specific Tuesday meeting date, and are **idempotent**, so a run that starts late
> (even Wednesday morning) still processes the correct meeting **once**. Crons:
> force `30 1,2 * * 3` + `0 10 * * 3`; report `30 2,3 * * 3` + `0 11 * * 3`
> (the second entry of each is a Wednesday-morning safety net).

---

## System force checkout (9:30 PM ET)

- **Script:** `scripts/system-force-checkout.js` · **Workflow:** `system-force-checkout.yml`
- Reads `settings/squadron.meetingEnd` (default `21:30`).
- Resolves the meeting by **deterministic Eastern-date ID** (`meetings/<date>`),
  with a legacy `meetingDate`-query fallback.
- Atomically **claims** the run in `automationRuns/force-<date>` (transaction), so
  duplicate/late runs cannot double-process.
- Checks out open `attendanceRecords` + `guestAttendanceRecords`, stamping the
  **true 9:30 PM ET meeting-end instant** (accurate durations even if the job runs late).
- Writes an audit record (member/guest counts, UTC + ET execution time, run id).

### Manual inputs (Actions → Run workflow)

| Input | Purpose |
| --- | --- |
| `dry_run` | Report what would happen; write nothing |
| `meeting_date` | Process a specific Eastern date `YYYY-MM-DD` |
| `force_run` / `skip_schedule_gate` | Skip the 9:30 PM gate |

Local test: `FIREBASE_SERVICE_ACCOUNT_JSON='<json>' FORCE_RUN=true DRY_RUN=true npm run force:checkout`

---

## Weekly attendance report (10:00 PM ET)

GitHub Actions does not guarantee an exact cron start time. The workflow therefore
has retry opportunities every five minutes from 10:00 through 10:30 PM Eastern.
The server-side time gate rejects early DST-hour runs, and the Firestore delivery
marker ensures only the first successful attempt posts to Discord. An 11:00 UTC
Wednesday run remains as a morning recovery path.

- **Script:** `scripts/weekly-attendance-email.js` · **Workflow:** `weekly-attendance-email.yml`
- **Discord is required and independent of email** — missing/failed email never
  blocks Discord.
- Posts an embed + downloadable **ZIP** (containing the CSV) to the webhook.
- Explicit HTTP handling: 200/204 success; 401/403/404 permanent; 429 honors
  `retry_after`; 5xx exponential backoff.
- **Idempotent** via `automationRuns/report-<date>` (posts once; `force_resend`
  overrides).
- On a required-Discord failure the workflow **fails visibly** and uploads the report
  ZIP as the **`tn170-attendance-report` artifact**.

### Manual inputs

| Input | Purpose |
| --- | --- |
| `dry_run` | Report what would happen; deliver nothing |
| `meeting_date` | Report a specific Eastern date |
| `delivery_mode` | `full` (default), `discord_only`, or `email_only` |
| `force_send` / `skip_schedule_gate` | Skip the 10:00 PM gate |
| `force_resend` | Re-post even if already delivered |

See [WEEKLY_EMAIL.md](./WEEKLY_EMAIL.md) for email options and
[AUDIT_2026-07.md](./AUDIT_2026-07.md) §8 for Discord failure recovery.

---

## GitHub Secrets

| Secret | Required by | Required? |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Both jobs | **Required** — Firestore read/write service account |
| `DISCORD_WEBHOOK_URL` | Report | **Required** — webhook created in channel `1517911401224736971` |
| `EMAIL_RECIPIENTS`, `EMAIL_FROM`, `RESEND_API_KEY` | Report (email) | Optional |
| `SMTP_HOST/PORT/USER/PASS/SECURE` | Report (email) | Optional (mutually exclusive with Resend) |

Service account: Firebase console → Project settings → Service accounts →
**Generate new private key**; paste the entire JSON into the secret. Never commit it.
It needs Firestore read/write for `settings`, `meetings`, `attendanceRecords`,
`guestAttendanceRecords`, `activityLog`, and `automationRuns`.
