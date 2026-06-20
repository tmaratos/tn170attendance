# GitHub Actions automation (Tuesday meeting nights)

Server-side jobs run on **GitHub Actions** — no Firebase Cloud Functions or Blaze billing required.

| Time (America/New_York) | Workflow | What happens |
| --- | --- | --- |
| **9:30 PM Tuesday** | [System force checkout](../.github/workflows/system-force-checkout.yml) | Force-checks-out all open member and guest attendance in Firestore |
| **10:00 PM Tuesday** | [Weekly attendance email](../.github/workflows/weekly-attendance-email.yml) | Emails CSV report of that night's attendance |

The kiosk app also runs client-side force checkout when a tab is open at 9:30 PM. The GitHub Action is the **server-side backup** so everyone is checked out even if no kiosk is running.

---

## System force checkout (9:30 PM)

- **Script:** `scripts/system-force-checkout.js`
- **Workflow:** `.github/workflows/system-force-checkout.yml`
- Reads `settings/squadron.meetingEnd` from Firestore (default `21:30`)
- Finds tonight's `meetings` document by `meetingDate`
- Sets `status: checked_out` on open `attendanceRecords` and `guestAttendanceRecords`
- Marks `meetings.systemForceCompletedDate` so client and server do not double-run

### Manual test

1. Actions → **System force checkout** → **Run workflow**
2. Set **force_run** to `true`
3. Check workflow logs and Firestore records

Local test (requires service account or ADC):

```powershell
$env:FIREBASE_PROJECT_ID = "tn170-attendance"
$env:FIREBASE_SERVICE_ACCOUNT_JSON = '<paste JSON>'
$env:FORCE_RUN = "true"
npm run force:checkout
```

---

## Weekly attendance email (10 PM)

See [WEEKLY_EMAIL.md](./WEEKLY_EMAIL.md) for full email setup, recipients, and Cloudflare notes.

---

## GitHub Secrets (both workflows)

| Secret | Required by | Description |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Force checkout + Email | Full JSON for a Firebase service account with Firestore read/write |

Email workflow additionally needs transport secrets — see [WEEKLY_EMAIL.md](./WEEKLY_EMAIL.md).

### Service account permissions

The service account needs Firestore access to read/write:

- `settings/squadron`
- `meetings`
- `attendanceRecords`
- `guestAttendanceRecords`
- `activityLog`

Generate in Firebase console → Project settings → Service accounts → **Generate new private key**. Paste the entire JSON into the GitHub secret. Do **not** commit the key file.
