import { useCallback, useMemo, useRef, useState } from 'react';
import useBadgeScanner from '../../hooks/useBadgeScanner';
import { extractCapid } from '../../utils/scanner';
import { getCallableError } from '../../services/errors';
import '../../styles/kiosk-frontdesk.css';

const IDLE = { tone: 'idle', title: 'Scanner ready', detail: 'Scan a badge to check in or out.' };

// Front-desk mode. An operator signs in once at the start of the meeting; from
// then on the kiosk listens for badge scans continuously and toggles each
// member in or out with no taps. Badges that are not on the roster fall through
// to a walk-in form so the operator can add the person on the spot.
export default function KioskFrontDesk({ attendance }) {
  const {
    members,
    seniorSession,
    authenticateSenior,
    forceCheckInMember,
    forceCheckOutMember,
    createMember,
    clearSeniorSession,
  } = attendance;

  const [capid, setCapid] = useState('');
  const [pin, setPin] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState('');
  const [status, setStatus] = useState(IDLE);
  const [busy, setBusy] = useState(false);
  const [walkIn, setWalkIn] = useState(null);
  const [manualCapid, setManualCapid] = useState('');

  // The operator PIN authorises every force action, so it is held for the
  // session in a ref only — never in state that renders, never persisted.
  const operatorPin = useRef('');
  const busyRef = useRef(false);
  const membersRef = useRef(members);
  membersRef.current = members;

  // Only the cloud/kiosk backends expose the admin-authorised force actions this
  // panel depends on. The local mock backend does not, so the panel hides itself
  // rather than offering a control that cannot work.
  const supported = typeof forceCheckInMember === 'function'
    && typeof forceCheckOutMember === 'function'
    && typeof authenticateSenior === 'function';
  const active = Boolean(seniorSession) && Boolean(operatorPin.current);

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
      setStatus(IDLE);
    } catch (error) {
      setSignInError(getCallableError(error) || error.message || 'Sign-in failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const endShift = () => {
    operatorPin.current = '';
    setWalkIn(null);
    setStatus(IDLE);
    setCapid('');
    clearSeniorSession?.();
  };

  const toggleMember = useCallback(async (member, scannedCapid) => {
    const checkingIn = member.status !== 'checked-in';
    setBusy(true);
    busyRef.current = true;
    try {
      const note = 'Badge scan at front desk';
      if (checkingIn) await forceCheckInMember(member.id, operatorPin.current, note);
      else await forceCheckOutMember(member.id, operatorPin.current, note);
      setStatus({
        tone: 'success',
        title: `${member.name} checked ${checkingIn ? 'in' : 'out'}`,
        detail: `CAPID ${scannedCapid} • Ready for the next badge`,
      });
    } catch (error) {
      setStatus({
        tone: 'error',
        title: 'Scan could not be completed',
        detail: getCallableError(error) || error.message || 'Try again or use Manual Corrections.',
      });
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }, [forceCheckInMember, forceCheckOutMember]);

  const handleCapid = useCallback((scannedCapid, raw) => {
    if (!scannedCapid) {
      setStatus({ tone: 'error', title: 'Badge not recognized', detail: `Expected a 6–8 digit CAPID${raw ? ` (read "${raw}")` : ''}.` });
      return;
    }
    const member = membersRef.current.find(
      (item) => String(item.capid || item.memberId || item.id) === scannedCapid
    );
    if (!member) {
      const canAdd = typeof createMember === 'function';
      if (canAdd) setWalkIn({ capid: scannedCapid, name: '', grade: '', saving: false, error: '' });
      setStatus({
        tone: 'warn',
        title: `CAPID ${scannedCapid} is not on the roster`,
        detail: canAdd
          ? 'Add them as a walk-in below, or scan the next badge.'
          : 'Add them from the Roster page, then scan again.',
      });
      return;
    }
    setWalkIn(null);
    toggleMember(member, scannedCapid);
  }, [toggleMember, createMember]);

  const onScan = useCallback(({ capid: scanned, raw }) => {
    if (busyRef.current) return;
    handleCapid(scanned, raw);
  }, [handleCapid]);

  useBadgeScanner({ enabled: active && !busy, onScan });

  const submitManual = (event) => {
    event.preventDefault();
    const parsed = extractCapid(manualCapid);
    setManualCapid('');
    handleCapid(parsed, manualCapid);
  };

  const saveWalkIn = async (event) => {
    event.preventDefault();
    if (!walkIn?.name.trim()) return;
    setWalkIn((prev) => ({ ...prev, saving: true, error: '' }));
    try {
      const created = await createMember(
        {
          capid: walkIn.capid,
          memberId: walkIn.capid,
          fullName: walkIn.name.trim(),
          displayName: walkIn.name.trim(),
          grade: walkIn.grade.trim() || null,
        },
        operatorPin.current
      );
      const newId = created?.memberId || created?.id || walkIn.capid;
      await forceCheckInMember(newId, operatorPin.current, 'Walk-in added at front desk');
      setStatus({ tone: 'success', title: `${walkIn.name.trim()} added and checked in`, detail: `CAPID ${walkIn.capid} • Ready for the next badge` });
      setWalkIn(null);
    } catch (error) {
      setWalkIn((prev) => ({
        ...prev,
        saving: false,
        error: getCallableError(error) || error.message || 'Could not add this member.',
      }));
    }
  };

  const operatorName = useMemo(
    () => seniorSession?.displayName || seniorSession?.capid || 'Operator',
    [seniorSession]
  );

  if (!supported) return null;

  if (!active) {
    return (
      <section className="k-frontdesk" aria-labelledby="frontdesk-title">
        <div className="k-frontdesk-head">
          <div>
            <span className="k-eyebrow">Front desk</span>
            <h2 id="frontdesk-title">Turn on badge scanning</h2>
            <p>Sign in once and the kiosk will scan members in and out for the rest of the meeting.</p>
          </div>
          <span className="k-frontdesk-state">Off</span>
        </div>
        <form className="k-frontdesk-signin" onSubmit={signIn}>
          <label htmlFor="fd-capid">Your CAPID</label>
          <input
            id="fd-capid"
            inputMode="numeric"
            autoComplete="off"
            value={capid}
            onChange={(event) => setCapid(event.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="123456"
          />
          <label htmlFor="fd-pin">Your 4-digit PIN</label>
          <input
            id="fd-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength="4"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="••••"
          />
          <button type="submit" disabled={signingIn || capid.length < 6 || pin.length !== 4}>
            {signingIn ? 'Signing in…' : 'Start scanning'}
          </button>
        </form>
        {signInError && <p className="k-frontdesk-error" role="alert">{signInError}</p>}
        <p className="k-frontdesk-note">
          Your PIN is held in memory for this browser session only and is never saved.
          Members can still check themselves in with the buttons above.
        </p>
      </section>
    );
  }

  return (
    <section className={`k-frontdesk live ${busy ? 'busy' : ''}`} aria-labelledby="frontdesk-title">
      <div className="k-frontdesk-head">
        <div>
          <span className="k-eyebrow">Front desk • {operatorName}</span>
          <h2 id="frontdesk-title">Badge scanning is on</h2>
          <p>Scan any member badge. Nothing needs to be selected or tapped first.</p>
        </div>
        <span className="k-frontdesk-state live"><span className="k-frontdesk-dot" />Listening</span>
      </div>

      <div className={`k-frontdesk-status ${status.tone}`} aria-live="polite">
        {busy ? (
          <><strong>Processing badge…</strong><span>Please wait before scanning the next person.</span></>
        ) : (
          <><strong>{status.title}</strong><span>{status.detail}</span></>
        )}
      </div>

      {walkIn && (
        <form className="k-frontdesk-walkin" onSubmit={saveWalkIn}>
          <h3>Add walk-in for CAPID {walkIn.capid}</h3>
          <label htmlFor="fd-name">Full name</label>
          <input
            id="fd-name"
            autoComplete="off"
            value={walkIn.name}
            onChange={(event) => setWalkIn((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Last, First"
          />
          <label htmlFor="fd-grade">Grade or role (optional)</label>
          <input
            id="fd-grade"
            autoComplete="off"
            value={walkIn.grade}
            onChange={(event) => setWalkIn((prev) => ({ ...prev, grade: event.target.value }))}
            placeholder="C/2d Lt"
          />
          {walkIn.error && <p className="k-frontdesk-error" role="alert">{walkIn.error}</p>}
          <div className="k-frontdesk-walkin-actions">
            <button type="submit" disabled={walkIn.saving || !walkIn.name.trim()}>
              {walkIn.saving ? 'Adding…' : 'Add and check in'}
            </button>
            <button type="button" className="ghost" onClick={() => setWalkIn(null)}>Cancel</button>
          </div>
        </form>
      )}

      <form className="k-frontdesk-manual" onSubmit={submitManual}>
        <label htmlFor="fd-manual">No badge? Type a CAPID</label>
        <div>
          <input
            id="fd-manual"
            inputMode="numeric"
            autoComplete="off"
            value={manualCapid}
            onChange={(event) => setManualCapid(event.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="123456"
          />
          <button type="submit" disabled={busy || manualCapid.length < 6}>Go</button>
        </div>
      </form>

      <button type="button" className="k-frontdesk-end" onClick={endShift}>
        Stop scanning and sign out
      </button>
    </section>
  );
}
