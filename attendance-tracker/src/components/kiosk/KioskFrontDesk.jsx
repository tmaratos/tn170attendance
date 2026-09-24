import { useCallback, useEffect, useRef, useState } from 'react';
import useBadgeScanner from '../../hooks/useBadgeScanner';
import useScannerPresence from '../../hooks/useScannerPresence';
import { parseAamvaName } from '../../utils/aamva';
import { routeScan, routeLicenceName } from '../../services/scanRouting';
import { getCallableError } from '../../services/errors';
import '../../styles/kiosk-frontdesk.css';

const READY = { tone: 'idle', title: 'Ready to scan', detail: 'Scan your CAP ID to check in or out.' };
const CONFIRM_MS = 3200;

const timeLabel = (value) =>
  new Date(value || Date.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const roleLabel = (member) =>
  member?.role || (member?.isCadet ? 'Cadet' : 'Senior Member');

// Front desk scanning for the home page. One scanner, three kinds of arrival:
// a member with a CAP badge, a member with a driver's licence, and a guest with
// a driver's licence. Nobody tells the kiosk which they are — the payload does.
//
// Licence payloads are parsed in this component and reduced to a first and last
// name immediately. The raw payload is never put in state, never rendered,
// never logged, and never sent anywhere.
export default function KioskFrontDesk({ attendance }) {
  const {
    members,
    guests,
    badgeScanMember,
    badgeScanName,
    checkInOpenHouseGuest,
    checkOutGuest,
  } = attendance;

  const [status, setStatus] = useState(READY);
  const [confirmation, setConfirmation] = useState(null);
  const [choice, setChoice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sawScanBurst, setSawScanBurst] = useState(false);

  const busyRef = useRef(false);
  const stateRef = useRef({ members, guests });
  stateRef.current = { members, guests };
  const scanner = useScannerPresence();
  const resetTimer = useRef(null);

  const supported = typeof badgeScanMember === 'function';

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const backToReady = useCallback(() => {
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setConfirmation(null);
      setStatus(READY);
    }, CONFIRM_MS);
  }, []);

  const confirm = useCallback((action, name, kind) => {
    setConfirmation({ action, name, kind, at: new Date().toISOString() });
    setStatus(READY);
    backToReady();
  }, [backToReady]);

  const fail = useCallback((title, detail) => {
    clearTimeout(resetTimer.current);
    setConfirmation(null);
    setStatus({ tone: 'error', title, detail });
    backToReady();
  }, [backToReady]);

  const toggleMember = useCallback(async (member) => {
    const { action, name } = await badgeScanMember(member.capid || member.memberId || member.id);
    confirm(action === 'check-in' ? 'in' : 'out', name, roleLabel(member));
  }, [badgeScanMember, confirm]);

  const checkGuestIn = useCallback(async (firstName, lastName) => {
    const name = `${firstName} ${lastName}`.trim();
    // Only the guest's name leaves the browser — no licence data of any kind.
    await checkInOpenHouseGuest({ name });
    confirm('in', name, 'Guest');
  }, [checkInOpenHouseGuest, confirm]);

  const checkGuestOut = useCallback(async (visit) => {
    await checkOutGuest(visit.id);
    confirm('out', visit.name || visit.guestName || 'Guest', 'Guest');
  }, [checkOutGuest, confirm]);

  const applyDecision = useCallback(async (decision) => {
    switch (decision.kind) {
      case 'cap-id': {
        const { action, name } = await badgeScanMember(decision.capid);
        confirm(action === 'check-in' ? 'in' : 'out', name, 'Member');
        return;
      }
      case 'licence': {
        const { firstName, lastName } = decision;
        // The roster lives on the Worker, so ask it before assuming a guest.
        const result = await badgeScanName(firstName, lastName);

        if (result.match === 'member') {
          confirm(result.action === 'check-in' ? 'in' : 'out', result.name, 'Member');
          return;
        }
        if (result.match === 'ambiguous') {
          setChoice({
            kind: 'member',
            title: `More than one ${firstName} ${lastName} on the roster`,
            options: result.candidates.map((c) => ({
              id: c.memberId,
              label: c.displayName || `${firstName} ${lastName}`,
              hint: c.grade || 'Member',
              capid: c.memberId,
            })),
          });
          return;
        }

        // Not a member: guest check-in, or check-out if a visit is open.
        const guestDecision = routeLicenceName({ firstName, lastName }, {
          members: [],
          guests: stateRef.current.guests,
        });
        if (guestDecision.kind === 'guest-check-out') {
          await checkGuestOut(guestDecision.visit);
        } else if (guestDecision.kind === 'guest-ambiguous') {
          setChoice({
            kind: 'guest',
            title: `More than one ${firstName} ${lastName} is signed in`,
            options: guestDecision.visits.map((visit) => ({
              id: visit.id,
              label: visit.name || visit.guestName || 'Guest',
              hint: `Checked in ${timeLabel(visit.checkInTime)}`,
              visit,
            })),
          });
        } else {
          await checkGuestIn(firstName, lastName);
        }
        return;
      }
      default:
        fail('Barcode not recognized', 'Please scan again, or see the front desk.');
    }
  }, [badgeScanMember, badgeScanName, checkGuestIn, checkGuestOut, confirm, fail]);

  const runDecision = useCallback(async (decision) => {
    setBusy(true);
    busyRef.current = true;
    try {
      await applyDecision(decision);
    } catch (error) {
      fail('Scan could not be completed', getCallableError(error) || error.message || 'Please try again.');
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }, [applyDecision, fail]);

  const handleScan = useCallback((scan) => {
    setSawScanBurst(true);
    if (busyRef.current || choice) return;
    clearTimeout(resetTimer.current);
    setConfirmation(null);

    if (scan.type === 'drivers-license') {
      setStatus({ tone: 'idle', title: 'Reading…', detail: 'One moment.' });
      // Reduce the payload to two fields here and keep no reference to it.
      const name = parseAamvaName(scan.raw);
      if (!name) {
        fail('Could not read that scan', 'Please scan again, or see the front desk.');
        return;
      }
      runDecision({ kind: 'licence', ...name });
      return;
    }
    runDecision(routeScan(scan, stateRef.current));
  }, [runDecision, fail, choice]);

  useBadgeScanner({ enabled: supported && !busy && !choice, onScan: handleScan });

  if (!supported) return null;

  const scannerPresent = scanner.connected || sawScanBurst;
  const scannerLabel = !scanner.checked
    ? 'Checking for scanner…'
    : scannerPresent
      ? `Scanner connected${scanner.scannerName ? ` — ${scanner.scannerName}` : ''}`
      : scanner.supported
        ? 'No scanner detected'
        : 'Scanner detection unavailable in this browser';

  const deviceRow = (
    <div className={`k-frontdesk-device ${scannerPresent ? 'on' : ''}`}>
      <span className="k-frontdesk-device-dot" />
      <span>{scannerLabel}</span>
      {scanner.supported && !scannerPresent && scanner.checked && (
        <button type="button" className="link" onClick={scanner.grantAccess}>Detect scanner</button>
      )}
    </div>
  );

  return (
    <section className={`k-frontdesk live ${busy ? 'busy' : ''}`} aria-labelledby="frontdesk-title">
      <div className="k-frontdesk-head">
        <div>
          <span className="k-eyebrow">Scanner active</span>
          <h2 id="frontdesk-title">Scan to check in or out</h2>
          <p>Hold your CAP ID up to the scanner. Nothing needs to be tapped first.</p>
        </div>
        <span className="k-frontdesk-state live"><span className="k-frontdesk-dot" />Listening</span>
      </div>

      {deviceRow}

      {choice ? (
        <div className="k-frontdesk-choice">
          <h3>{choice.title}</h3>
          <p>Select the correct person to continue.</p>
          <ul>
            {choice.options.map((option) => (
              <li key={option.id}>
                <button type="button" onClick={() => {
                  setChoice(null);
                  runDecision(choice.kind === 'member'
                    ? { kind: 'cap-id', capid: option.capid }
                    : { kind: 'guest-check-out', visit: option.visit });
                }}>
                  <strong>{option.label}</strong><span>{option.hint}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="ghost" onClick={() => { setChoice(null); setStatus(READY); }}>
            Cancel
          </button>
        </div>
      ) : confirmation ? (
        <div className={`k-frontdesk-confirm ${confirmation.action}`} aria-live="polite">
          <strong>{confirmation.action === 'in' ? 'CHECKED IN ✓' : 'CHECKED OUT ✓'}</strong>
          <span className="k-frontdesk-confirm-name">{confirmation.name}</span>
          <span className="k-frontdesk-confirm-meta">
            {confirmation.kind} • {timeLabel(confirmation.at)}
          </span>
        </div>
      ) : (
        <div className={`k-frontdesk-status ${status.tone}`} aria-live="polite">
          {busy ? (
            <><strong>Working…</strong><span>Please wait before the next scan.</span></>
          ) : (
            <><strong>{status.title}</strong><span>{status.detail}</span></>
          )}
        </div>
      )}

      <p className="k-frontdesk-note">
        Scans only. Anyone without a badge uses <strong>Check in / Check out</strong>,
        which verifies their own PIN.
      </p>
    </section>
  );
}
