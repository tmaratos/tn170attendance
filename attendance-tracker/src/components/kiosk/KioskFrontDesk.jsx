import { useCallback, useEffect, useRef, useState } from 'react';
import useBadgeScanner from '../../hooks/useBadgeScanner';
import useScannerPresence from '../../hooks/useScannerPresence';
import { parseAamvaName } from '../../utils/aamva';
import { routeScan } from '../../services/scanRouting';
import { getCallableError } from '../../services/errors';
import '../../styles/kiosk-frontdesk.css';

const READY = { tone: 'idle', title: 'Ready to scan', detail: "Scan a CAP ID or driver's license." };
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
    seniorSession,
    authenticateSenior,
    forceCheckInMember,
    forceCheckOutMember,
    checkInGuest,
    checkOutGuest,
    clearSeniorSession,
  } = attendance;

  const [capid, setCapid] = useState('');
  const [pin, setPin] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState('');
  const [status, setStatus] = useState(READY);
  const [confirmation, setConfirmation] = useState(null);
  const [choice, setChoice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sawScanBurst, setSawScanBurst] = useState(false);

  // The operator PIN authorises every write. Held in a ref for the session
  // only: never in rendered state, never persisted.
  const operatorPin = useRef('');
  const busyRef = useRef(false);
  const stateRef = useRef({ members, guests });
  stateRef.current = { members, guests };
  const scanner = useScannerPresence();
  const resetTimer = useRef(null);

  const supported =
    typeof forceCheckInMember === 'function' && typeof authenticateSenior === 'function';
  const active = Boolean(seniorSession) && Boolean(operatorPin.current);

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
    const checkingIn = member.status !== 'checked-in';
    const note = 'Front desk scan';
    if (checkingIn) await forceCheckInMember(member.id, operatorPin.current, note);
    else await forceCheckOutMember(member.id, operatorPin.current, note);
    confirm(checkingIn ? 'in' : 'out', member.name, roleLabel(member));
  }, [forceCheckInMember, forceCheckOutMember, confirm]);

  const checkGuestIn = useCallback(async (firstName, lastName) => {
    const name = `${firstName} ${lastName}`.trim();
    const hostId = seniorSession?.memberId || seniorSession?.capid;
    // Only the guest's name leaves the browser — no licence data of any kind.
    await checkInGuest({
      name,
      hostId,
      hostCapid: hostId,
      hostPin: operatorPin.current,
      hostName: seniorSession?.displayName || '',
    });
    confirm('in', name, 'Guest');
  }, [checkInGuest, seniorSession, confirm]);

  const checkGuestOut = useCallback(async (visit) => {
    await checkOutGuest(visit.id);
    confirm('out', visit.name || visit.guestName || 'Guest', 'Guest');
  }, [checkOutGuest, confirm]);

  const applyDecision = useCallback(async (decision) => {
    switch (decision.kind) {
      case 'cap-id': {
        const member = stateRef.current.members.find(
          (item) => String(item.capid || item.memberId || item.id) === decision.capid
        );
        if (!member) {
          fail(`CAP ID ${decision.capid} not found`, 'Check the roster, or use Guest options.');
          return;
        }
        await toggleMember(member);
        return;
      }
      case 'member':
        await toggleMember(decision.member);
        return;
      case 'member-ambiguous':
        setChoice({
          kind: 'member',
          title: `More than one ${decision.firstName} ${decision.lastName} on the roster`,
          options: decision.matches.map((member) => ({
            id: member.id,
            label: member.name,
            hint: `${roleLabel(member)} • ${member.status === 'checked-in' ? 'Checked in' : 'Not checked in'}`,
            member,
          })),
        });
        return;
      case 'guest-check-in':
        await checkGuestIn(decision.firstName, decision.lastName);
        return;
      case 'guest-check-out':
        await checkGuestOut(decision.visit);
        return;
      case 'guest-ambiguous':
        setChoice({
          kind: 'guest',
          title: `More than one ${decision.firstName} ${decision.lastName} is signed in`,
          options: decision.visits.map((visit) => ({
            id: visit.id,
            label: visit.name || visit.guestName || 'Guest',
            hint: `Checked in ${timeLabel(visit.checkInTime)}`,
            visit,
          })),
        });
        return;
      default:
        fail('Barcode not recognized', "Please scan a CAP ID or driver's license.");
    }
  }, [toggleMember, checkGuestIn, checkGuestOut, fail]);

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
      setStatus({ tone: 'idle', title: 'Reading license…', detail: 'One moment.' });
      // Reduce the payload to two fields here and keep no reference to it.
      const name = parseAamvaName(scan.raw);
      if (!name) {
        fail('License could not be read', "Please scan again or enter the guest's name manually.");
        return;
      }
      runDecision(routeScan({ type: 'drivers-license', name }, stateRef.current));
      return;
    }
    runDecision(routeScan(scan, stateRef.current));
  }, [runDecision, fail, choice]);

  useBadgeScanner({ enabled: active && !busy && !choice, onScan: handleScan });

  const signIn = async (event) => {
    event.preventDefault();
    if (capid.trim().length < 6 || pin.length !== 4) return;
    setSigningIn(true);
    setSignInError('');
    try {
      const session = await authenticateSenior(capid.trim(), pin);
      if (!session) throw new Error('That CAPID and PIN did not match a senior member.');
      operatorPin.current = pin;
      setPin('');
      setStatus(READY);
    } catch (error) {
      setSignInError(getCallableError(error) || error.message || 'Sign-in failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const endShift = () => {
    operatorPin.current = '';
    clearTimeout(resetTimer.current);
    setChoice(null);
    setConfirmation(null);
    setStatus(READY);
    setCapid('');
    clearSeniorSession?.();
  };

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

  if (!active) {
    return (
      <section className="k-frontdesk" aria-labelledby="frontdesk-title">
        <div className="k-frontdesk-head">
          <div>
            <span className="k-eyebrow">Front desk</span>
            <h2 id="frontdesk-title">Badge scanning</h2>
            <p>Unlock once and the kiosk will scan CAP IDs and driver’s licenses all meeting.</p>
          </div>
          <span className="k-frontdesk-state">Locked</span>
        </div>
        {deviceRow}
        <form className="k-frontdesk-signin" onSubmit={signIn}>
          <label htmlFor="fd-capid">Your CAPID</label>
          <input id="fd-capid" inputMode="numeric" autoComplete="off" value={capid}
            onChange={(e) => setCapid(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="123456" />
          <label htmlFor="fd-pin">Your 4-digit PIN</label>
          <input id="fd-pin" type="password" inputMode="numeric" autoComplete="off" maxLength="4" value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" />
          <button type="submit" disabled={signingIn || capid.length < 6 || pin.length !== 4}>
            {signingIn ? 'Unlocking…' : 'Start scanning'}
          </button>
        </form>
        {signInError && <p className="k-frontdesk-error" role="alert">{signInError}</p>}
        <p className="k-frontdesk-note">
          Your PIN is held in memory for this browser session only and is never saved.
          Members and guests can still use the buttons above.
        </p>
      </section>
    );
  }

  return (
    <section className={`k-frontdesk live ${busy ? 'busy' : ''}`} aria-labelledby="frontdesk-title">
      <div className="k-frontdesk-head">
        <div>
          <span className="k-eyebrow">Scanner active</span>
          <h2 id="frontdesk-title">Scan CAP ID or driver’s license</h2>
          <p>Members and cadets: CAP ID or driver’s license. Guests: driver’s license.</p>
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
                    ? { kind: 'member', member: option.member }
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
        Scans only. Anyone without a badge or license uses <strong>Check in / Check out</strong>,
        which verifies their own PIN.
      </p>

      <button type="button" className="k-frontdesk-end" onClick={endShift}>
        Stop scanning and sign out
      </button>
    </section>
  );
}
