import { useEffect, useRef, useState } from 'react';
import { KioskShell, KioskFlowTopBar } from './kiosk/KioskChrome';
import KioskPinPad from './kiosk/KioskPinPad';
import {
  KioskStepHeader,
  KioskMemberResultCard,
  KioskStateMessage,
  KioskSuccessScreen,
} from './kiosk/KioskFlow';
import Icon from './kiosk/icons';
import { formatDuration, formatTime, getInitials } from '../data/mockData';
import { getCallableError } from '../services/errors';
import { formatEastern } from '../hooks/useEasternClock';

/**
 * Member / cadet self-service wizard, shared by Check In and Check Out.
 *   check-in:  Find you → PIN (or Create PIN) → Confirm → Done  (4 steps)
 *   check-out: Find you → Confirm → Done                       (3 steps)
 * Success is only ever shown after the write actually resolves.
 */
export default function PublicMemberFlow({
  mode,
  attendance,
  searchMembers,
  verifyPin,
  onCheckIn,
  onCheckOut,
  isFirebase,
  needsPinSetup,
  createMemberPin,
}) {
  const isCheckIn = mode === 'check-in';
  const actionLabel = isCheckIn ? 'Check in' : 'Check out';

  const [step, setStep] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successTime, setSuccessTime] = useState(null);
  const searchRef = useRef(null);

  const confirmStep = isCheckIn ? 2 : 1;
  const successStep = isCheckIn ? 3 : 2;

  const pinSetupRequired = selected
    ? (selected.needsPinSetup ?? Boolean(needsPinSetup?.(selected.id)))
    : false;

  const steps = isCheckIn
    ? ['Find you', pinSetupRequired ? 'Create PIN' : 'Enter PIN', 'Confirm', 'Done']
    : ['Find you', 'Confirm', 'Done'];

  useEffect(() => {
    let active = true;
    if (!query.trim()) {
      setResults([]);
      return undefined;
    }
    Promise.resolve(searchMembers(query))
      .then((list) => {
        if (active) setResults((list || []).slice(0, 8));
      })
      .catch(() => {
        if (active) setResults([]);
      });
    return () => {
      active = false;
    };
  }, [query, searchMembers]);

  const selectMember = (member) => {
    setSelected(member);
    setPin('');
    setConfirmPin('');
    setError('');
    setStep(1);
  };

  const backToSearch = () => {
    setStep(0);
    setPin('');
    setConfirmPin('');
    setError('');
    window.setTimeout(() => searchRef.current?.focus(), 0);
  };

  const verifyOrCreatePin = async () => {
    if (!selected || pin.length !== 4 || loading) return;
    setLoading(true);
    setError('');
    try {
      if (pinSetupRequired) {
        if (confirmPin.length !== 4) {
          setError('Re-enter your new 4-digit PIN to confirm it.');
          return;
        }
        if (pin !== confirmPin) {
          setPin('');
          setConfirmPin('');
          setError('Those PINs did not match. Try again.');
          return;
        }
        await createMemberPin?.(selected.id, pin, confirmPin);
        setStep(confirmStep);
        return;
      }
      if (verifyPin && !(await verifyPin(selected.id, pin))) {
        setPin('');
        setError('That PIN was not correct. Please try again.');
        return;
      }
      setStep(confirmStep);
    } catch (err) {
      setPin('');
      setConfirmPin('');
      setError(getCallableError(err) || 'Your PIN could not be verified.');
    } finally {
      setLoading(false);
    }
  };

  const confirmAction = async () => {
    if (!selected || loading) return;
    setLoading(true);
    setError('');
    try {
      let result;
      if (isFirebase) {
        result = isCheckIn
          ? await onCheckIn(selected.id, pin)
          : await onCheckOut(selected.id);
      } else if (isCheckIn) {
        onCheckIn(selected.id);
      } else {
        onCheckOut(selected.id);
      }
      // Only reached if the write above resolved without throwing.
      setSuccessTime(result?.checkInTime || result?.checkOutTime || new Date().toISOString());
      setStep(successStep);
    } catch (err) {
      setStep(isCheckIn ? 1 : confirmStep);
      setPin('');
      setError(getCallableError(err) || `${actionLabel} could not be completed. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  const handleFlowEnter = (event) => {
    if (event.key !== 'Enter') return;
    if (event.target.closest?.('button,a')) return;
    event.preventDefault();
    if (step === 0 && results.length === 1) {
      selectMember(results[0]);
      return;
    }
    if (isCheckIn && step === 1 && !loading && pin.length === 4 && (!pinSetupRequired || confirmPin.length === 4)) {
      verifyOrCreatePin();
      return;
    }
    if (step === confirmStep && !loading) {
      confirmAction();
    }
  };

  const { settings, syncState } = attendance;

  return (
    <KioskShell settings={settings} syncState={syncState || 'connected'} header={false}>
      <div className="k-flow" onKeyDown={handleFlowEnter}>
        <KioskFlowTopBar />
        <section className="k-flow-card">
          <span className="k-flow-eyebrow">Member or Cadet</span>
          <h1 className="k-flow-title">
            {isCheckIn ? 'Check in for tonight' : 'Check out before you leave'}
          </h1>

          {step !== successStep && <KioskStepHeader steps={steps} current={step} />}

          {/* Step 0 — search */}
          {step === 0 && (
            <div>
              <label className="k-label" htmlFor={`${mode}-search`}>
                Find your name
              </label>
              <p className="k-hint">Search by name or CAPID, then tap your record.</p>
              <input
                id={`${mode}-search`}
                ref={searchRef}
                className="k-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
                inputMode="search"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                placeholder="Start typing…"
                aria-describedby={`${mode}-search-hint`}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && results.length > 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    selectMember(results[0]);
                  }
                }}
              />
              {isCheckIn && (
                <p id={`${mode}-search-hint`} className="k-hint" style={{ marginTop: '0.75rem' }}>
                  New here or forgot your PIN? Pick your name — you can create one on the next step.
                </p>
              )}
              <div className="k-results">
                {query.trim() && results.length === 0 && (
                  <KioskStateMessage type="info">
                    No matching member found. Check the spelling or try your CAPID.
                  </KioskStateMessage>
                )}
                {results.map((member) => (
                  <KioskMemberResultCard
                    key={member.id}
                    title={member.name}
                    subtitle={`${member.grade} · CAPID ${member.capid}`}
                    initials={getInitials(member.name)}
                    onSelect={() => selectMember(member)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Step 1 (check-in only) — PIN */}
          {isCheckIn && step === 1 && selected && (
            <div>
              <div className="k-result selected" style={{ cursor: 'default', marginBottom: '1.25rem' }}>
                <span className="k-avatar" aria-hidden="true">{getInitials(selected.name)}</span>
                <span className="k-result-body">
                  <strong>{selected.name}</strong>
                  <small>{selected.grade} · CAPID {selected.capid}</small>
                </span>
              </div>

              <h2 className="k-label" style={{ fontSize: '1.15rem', textAlign: 'center' }}>
                {pinSetupRequired ? 'Create your 4-digit PIN' : 'Enter your 4-digit PIN'}
              </h2>
              <p className="k-hint" style={{ textAlign: 'center' }}>
                {pinSetupRequired
                  ? 'You’ll use this same PIN for check-in, check-out, and admin login.'
                  : 'Your PIN keeps your attendance record secure.'}
              </p>

              {error && <KioskStateMessage type="error">{error}</KioskStateMessage>}

              <KioskPinPad
                value={pin}
                onChange={(next) => { setError(''); setPin(next); }}
                disabled={loading}
                label={pinSetupRequired ? 'New PIN' : 'PIN'}
              />

              {pinSetupRequired && pin.length === 4 && (
                <>
                  <h2 className="k-label" style={{ fontSize: '1.15rem', textAlign: 'center', marginTop: '1.5rem' }}>
                    Confirm your PIN
                  </h2>
                  <KioskPinPad
                    value={confirmPin}
                    onChange={(next) => { setError(''); setConfirmPin(next); }}
                    disabled={loading}
                    label="Confirm PIN"
                  />
                </>
              )}

              <div className="k-btn-row">
                <button type="button" className="k-btn k-btn-outline" onClick={backToSearch} disabled={loading}>
                  Back
                </button>
                <button
                  type="button"
                  className="k-btn k-btn-primary"
                  onClick={verifyOrCreatePin}
                  disabled={loading || pin.length !== 4 || (pinSetupRequired && confirmPin.length !== 4)}
                >
                  {loading ? <><span className="k-spin" /> Checking…</> : 'Continue'}
                </button>
              </div>
            </div>
          )}

          {/* Confirm step */}
          {step === confirmStep && selected && (
            <div className="k-confirm">
              <span className="k-avatar lg" aria-hidden="true">{getInitials(selected.name)}</span>
              <h2>{selected.name}</h2>
              <p>{selected.grade} · CAPID {selected.capid}</p>
              <dl className="k-dl">
                {!isCheckIn && selected.checkInTime && (
                  <>
                    <dt>Checked in</dt>
                    <dd>{formatTime(selected.checkInTime)}</dd>
                  </>
                )}
                <dt>Action</dt>
                <dd>{isCheckIn ? 'Check in' : 'Check out'}</dd>
              </dl>

              {error && <KioskStateMessage type="error">{error}</KioskStateMessage>}

              <div className="k-btn-row">
                <button type="button" className="k-btn k-btn-outline" onClick={backToSearch} disabled={loading}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={`k-btn ${isCheckIn ? 'k-btn-primary' : 'k-btn-navy'}`}
                  onClick={confirmAction}
                  disabled={loading}
                >
                  {loading
                    ? <><span className="k-spin" /> Saving…</>
                    : <><Icon name="check" size={20} /> Confirm {isCheckIn ? 'check-in' : 'check-out'}</>}
                </button>
              </div>
            </div>
          )}

          {/* Success */}
          {step === successStep && selected && (
            <KioskSuccessScreen
              title={isCheckIn ? 'You’re checked in!' : 'You’re checked out!'}
              name={selected.name}
              meta={
                !isCheckIn && selected.checkInTime && successTime
                  ? `${formatEastern(successTime)} · ${formatDuration(selected.checkInTime, successTime)} on site`
                  : formatEastern(successTime || new Date().toISOString())
              }
            />
          )}
        </section>
      </div>
    </KioskShell>
  );
}
