# Front desk scanning — CAP IDs and driver's licenses

One USB scanner serves three kinds of arrival at the kiosk home page. Nobody
tells the kiosk who they are; the payload decides.

| Who | Scans | Result |
| --- | --- | --- |
| Member or cadet | CAP ID badge | Member attendance, checked in or out |
| Member or cadet | Driver's license | Name matched to roster → member attendance |
| Guest or visitor | Driver's license | No roster match → guest visit |

## Authorization

There is none. The scanner panel is live whenever the home page is open: no
sign-in, no operator PIN, no button. A scan is the credential.

This is a deliberate squadron decision, taken so the front desk runs unattended.
Two things follow from it, and both are worth knowing:

- Scans write through the no-Auth kiosk path that `firestore.rules` already
  documents for `attendanceRecords`, not the Worker's `/member/check-in`, which
  verifies the member's own PIN. That rule predates this feature.
- Holding someone's badge or licence is enough to check them in or out. There
  is no second factor.

What limits the exposure is that **the panel acts only on what is physically
scanned**. Manual CAPID entry was deliberately removed from it, so attendance
cannot be recorded from a keyboard alone. Anyone without a badge or licence
uses *Check in / Check out*, which still verifies their own PIN.

## Scanner hardware assumptions

These are assumptions, not measurements — the scanner is attached to the
squadron laptop, not to any machine this code was built on. Verify each one
against the hardware before relying on it.

| Assumption | Value | Notes |
| --- | --- | --- |
| Interface | USB HID keyboard | No WebUSB, driver, or helper service is used or required. |
| Suffix | Enter preferred | Recommended. See tolerance below. |
| Line ending | CR, LF, or CR+LF | All three are treated as a newline. |
| PDF417 | Must be enabled | Required for driver's licenses; many scanners ship with it off. |
| Prefix | None assumed | A prefix is tolerated: CAPID extraction scans for an embedded 6–8 digit run, and license detection keys on `ANSI`/`DAC`/`DCS` rather than position. |
| Keyboard layout | US QWERTY | The payload is read from `KeyboardEvent.key`, so any layout that types the characters correctly will work. |

### Recommended scanner configuration

1. Enable **PDF417** symbology — without it a license will not scan at all.
2. Program an **Enter (CR) suffix**. The software tolerates its absence, but an
   explicit suffix makes CAP badge scans finish instantly rather than waiting
   out the idle timer.
3. Leave the scanner in **HID keyboard** mode. Do not put it in serial/OPOS mode.

## How a scan is recognised

A scanner is not identifiable from the page by itself — in HID keyboard mode it
is indistinguishable from a keyboard. Two independent signals are used:

- **WebHID presence.** `navigator.hid.getDevices()` reports already-permitted
  devices with no prompt, and `connect`/`disconnect` events keep the status
  live. The device is never opened, so it keeps emulating a keyboard. Chrome
  hides plain-keyboard collections from WebHID, so this may report nothing.
- **Input cadence plus content.** A scanner delivers its whole payload in a
  tight burst. Cadence alone is not treated as proof: the completed payload is
  then classified by content (`detectScanType`) before anything acts on it.

Keystrokes aimed at a form control are ignored entirely, so staff typing in
the manual fields is never captured.

## How scan boundaries are determined

CAP badges and licenses end differently, which is why there are two rules:

- A **CAP badge** is short and ends at its Enter.
- A **driver's license** payload contains embedded newlines as element
  separators. Terminating on the first Enter would truncate every license to
  `@`. So while the buffer looks like a license in progress (`@`, `ANSI`, or a
  `DL` element marker), Enter is folded into the payload and the scan is closed
  by an idle gap instead (`SCANNER_IDLE_FLUSH_MS`, 350 ms).

## What is retained

From a driver's license, exactly two fields:

- `DAC` → first name
- `DCS` → last name

plus the check-in and check-out timestamps the attendance record already keeps.

Everything else in the barcode — DL number, date of birth, address, ZIP, sex,
height, eye colour, issue and expiry dates, restrictions, endorsements,
document discriminator, inventory number, organ donor status, and any
jurisdiction-specific block such as Tennessee's `ZT` — is never read, never
stored, and never transmitted.

## How the raw payload is kept out of storage and logs

The privacy boundary is the browser. Parsing happens client-side, and only a
name crosses to the backend.

- The payload lives in a scan buffer and a local variable long enough to parse.
- It is never written to component state, so it cannot be rendered.
- The buffer is cleared on every completion, successful or failed.
- Nothing logs it. A parse failure surfaces as the fixed message
  `License could not be read.` — the payload is not included.
- It is never written to `localStorage`, `sessionStorage`, or IndexedDB.
- The backend receives `{ name }` for a guest, or a member id for a member.

Automated tests assert each of these rather than relying on inspection; see
`test/aamva.test.js` and `test/scanRouting.test.js`.

## Architecture

```
Home page (KioskFrontDesk)
        ↓
useBadgeScanner ── createScanBuffer   (collection, terminator, idle flush, reset)
        ↓
detectScanType                        cap-id | drivers-license | unknown
        ↓                ↓
extractCapid       parseAamvaName     (AAMVA only; returns first + last name)
        ↓                ↓
        routeScan / routeLicenceName  (pure decision, no payload)
        ↓
attendance actions                    member check in/out, guest check in/out
```

`scanRouting` receives a parsed name, never a payload, so license data cannot
reach the decision layer. The guest path has no knowledge that a name came
from a license.

## Ambiguity

A first and last name does not uniquely identify a person, so duplicates are
never guessed:

- Two roster members with the same normalised name → staff pick from a list.
- Two open guest visits with the same name → staff pick, showing check-in times.

License details are deliberately not retained, so they cannot be offered as a
tiebreaker.
