import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PinPad from './PinPad';
import { formatDateTime, formatDuration, formatTime, getInitials } from '../data/mockData';
import { getCallableError } from '../services/errors';
import { useLocalTime } from '../hooks/useLocalTime';

function StepBar({ step, pinSetup }) {
  const labels = ['Search', pinSetup ? 'Create PIN' : 'PIN', 'Confirm', 'Success'];

  return (
    <div className="public-flow-steps">
      {labels.map((label, index) => (
        <div
          key={label}
          className={`public-flow-step ${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`}
        >
          <span>{index + 1}</span>
          {label}
        </div>
      ))}
    </div>
  );
}

function MemberResult({ member, onSelect }) {
  return (
    <button type="button" className="public-member-result" onClick={() => onSelect(member)}>
      <span className="public-member-avatar">{getInitials(member.name)}</span>
      <span>
        <strong>{member.name}</strong>
        <small>{member.grade} - CAPID {member.capid} - {member.role}</small>
      </span>
    </button>
  );
}

export default function PublicMemberFlow({
  mode,
  members,
  searchMembers,
  verifyPin,
  onCheckIn,
  onCheckOut,
  isFirebase,
  memberHasPin,
  needsPinSetup,
  createMemberPin,
}) {
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successTime, setSuccessTime] = useState(null);
  const searchRef = useRef(null);
  const { now, dateStr, shortTimeStr } = useLocalTime();

  const isCheckIn = mode === 'check-in';
  const actionLabel = isCheckIn ? 'CHECK IN' : 'CHECK OUT';
  const successLabel = isCheckIn ? 'CHECKED IN' : 'CHECKED OUT';
  const actionClass = isCheckIn ? 'check-in' : 'check-out';

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return searchMembers(query).slice(0, 8);
  }, [query, searchMembers]);

  const pinSetupRequired = selected
    ? Boolean(needsPinSetup?.(selected.id))
    : false;

  const reset = () => {
    setStep(0);
    setQuery('');
    setSelected(null);
    setPin('');
    setConfirmPin('');
    setError('');
    setLoading(false);
    setSuccessTime(null);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  };

  const selectMember = (member) => {
    setSelected(member);
    setPin('');
    setConfirmPin('');
    setError('');
    setStep(1);
  };

  const verifyOrCreatePin = async () => {
    if (!selected || pin.length !== 4) return;
    setLoading(true);
    setError('');

    try {
      if (pinSetupRequired) {
        if (confirmPin.length !== 4) {
          setError('Confirm your new 4-digit PIN.');
          return;
        }
        if (pin !== confirmPin) {
          setPin('');
          setConfirmPin('');
          setError('PINs do not match.');
          return;
        }
        await createMemberPin?.(selected.id, pin, confirmPin);
        setStep(2);
        return;
      }

      if (verifyPin && !(await verifyPin(selected.id, pin))) {
        setPin('');
        setError('Incorrect PIN. Try again.');
        return;
      }

      setStep(2);
    } catch (err) {
      setPin('');
      setConfirmPin('');
      setError(getCallableError(err) || 'PIN could not be verified.');
    } finally {
      setLoading(false);
    }
  };

  const confirmAction = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');

    try {
      let result;
      if (isFirebase) {
        result = isCheckIn
          ? await onCheckIn(selected.id, pin)
          : await onCheckOut(selected.id, pin);
      } else if (isCheckIn) {
        onCheckIn(selected.id);
      } else {
        onCheckOut(selected.id);
      }

      setSuccessTime(result?.checkInTime || result?.checkOutTime || new Date().toISOString());
      setStep(3);
      window.setTimeout(() => {
        window.location.reload();
      }, 1800);
    } catch (err) {
      setPin('');
      setStep(1);
      setError(getCallableError(err) || `${actionLabel} failed.`);
    } finally {
      setLoading(false);
    }
  };

  const addPinDigit = (setter) => (digit) => {
    setError('');
    setter((current) => (current.length < 4 ? `${current}${digit}` : current));
  };

  const handleFlowEnter = (event) => {
    if (event.key !== 'Enter') return;
    if (event.target.closest?.('button,a')) return;
    event.preventDefault();

    if (step === 0 && results.length === 1) {
      selectMember(results[0]);
      return;
    }

    if (
      step === 1 &&
      !loading &&
      pin.length === 4 &&
      (!pinSetupRequired || confirmPin.length === 4)
    ) {
      verifyOrCreatePin();
      return;
    }

    if (step === 2 && !loading) {
      confirmAction();
    }
  };

  return (
    <div className={`public-flow-page ${actionClass}`} onKeyDown={handleFlowEnter}>
      <div className="public-flow-body">
      <div className="public-flow-shell">
        <div className="public-flow-header">
          <Link to="/" className="public-back-link">Home</Link>
          <div>
            <p>{dateStr}</p>
            <strong>{shortTimeStr}</strong>
          </div>
        </div>

        <section className="public-flow-card">
          <div className="public-flow-title">
            <span>{actionLabel}</span>
            <h1>{isCheckIn ? 'Find your record' : 'Find your record to check out'}</h1>
          </div>

          <StepBar step={step} pinSetup={pinSetupRequired} />

          {step === 0 && (
            <div className="public-flow-section">
              <p className="pin-setup-hint kiosk-pin-help">
                New or forgot PIN? Select your name — you&apos;ll be prompted to create one if none
                exists yet. Your PIN is stored securely in Firebase and works on any kiosk device.
              </p>
              <label htmlFor={`${mode}-search`}>Search by name or CAPID</label>
              <input
                id={`${mode}-search`}
                ref={searchRef}
                className="public-flow-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
                inputMode="search"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="Start typing..."
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && results.length > 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    selectMember(results[0]);
                  }
                }}
              />
              <div className="public-member-results">
                {query.trim() && results.length === 0 && (
                  <div className="public-flow-empty">No matching member found.</div>
                )}
                {results.map((member) => (
                  <MemberResult key={member.id} member={member} onSelect={selectMember} />
                ))}
              </div>
            </div>
          )}

          {step === 1 && selected && (
            <div className="public-flow-section pin-section">
              <div className="public-selected-member">
                <strong>{selected.name}</strong>
                <span>{selected.grade} - CAPID {selected.capid} - {selected.role}</span>
              </div>

              <h2>{pinSetupRequired ? 'Create your PIN' : 'Enter your 4-digit PIN'}</h2>
              <p className="pin-setup-hint">
                {pinSetupRequired
                  ? 'First time or after a reset? Create your 4-digit PIN.'
                  : 'Enter your squadron PIN.'}
              </p>
              {pinSetupRequired && (
                <p className="pin-setup-subhint">
                  You&apos;ll use this same PIN for check-in, check-out, and admin login.
                </p>
              )}
              {error && <div className="public-flow-error">{error}</div>}
              <PinPad
                pin={pin}
                onDigit={addPinDigit(setPin)}
                onBackspace={() => setPin((current) => current.slice(0, -1))}
                onClear={() => setPin('')}
                autoFocus={pin.length < 4}
              />

              {pinSetupRequired && pin.length === 4 && (
                <>
                  <h2>Confirm your PIN</h2>
                  <PinPad
                    pin={confirmPin}
                    onDigit={addPinDigit(setConfirmPin)}
                    onBackspace={() => setConfirmPin((current) => current.slice(0, -1))}
                    onClear={() => setConfirmPin('')}
                    autoFocus
                  />
                </>
              )}

              <div className="public-flow-actions">
                <button type="button" className="btn btn-outline" onClick={() => setStep(0)}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-blue"
                  onClick={verifyOrCreatePin}
                  disabled={loading || pin.length !== 4 || (pinSetupRequired && confirmPin.length !== 4)}
                >
                  {loading ? 'Checking...' : 'Continue'}
                </button>
              </div>
            </div>
          )}

          {step === 2 && selected && (
            <div className="public-flow-section">
              <div className="public-confirm-card">
                <span className="public-member-avatar large">{getInitials(selected.name)}</span>
                <h2>{selected.name}</h2>
                <p>{selected.grade} - CAPID {selected.capid}</p>
                <dl>
                  {isCheckIn ? null : (
                    <>
                      <dt>Check-in time</dt>
                      <dd>{formatTime(selected.checkInTime)}</dd>
                    </>
                  )}
                  <dt>Date</dt>
                  <dd>{now.toLocaleDateString('en-US')}</dd>
                  <dt>Time</dt>
                  <dd>{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</dd>
                  {!isCheckIn && selected.checkInTime && (
                    <>
                      <dt>Duration</dt>
                      <dd>{formatDuration(selected.checkInTime, now.toISOString())}</dd>
                    </>
                  )}
                </dl>
              </div>
              {error && <div className="public-flow-error">{error}</div>}
              <button
                type="button"
                className={`public-confirm-button ${actionClass}`}
                onClick={confirmAction}
                disabled={loading}
              >
                {loading ? 'Processing...' : `CONFIRM ${actionLabel}`}
              </button>
              <button type="button" className="public-cancel-button" onClick={reset}>
                Cancel
              </button>
            </div>
          )}

          {step === 3 && selected && (
            <div className="public-success-screen">
              <div className={`public-success-icon ${actionClass}`}>
                <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </div>
              <h2>{successLabel}</h2>
              <strong>{selected.name}</strong>
              <span>{successTime ? formatDateTime(successTime) : formatDateTime(new Date().toISOString())}</span>
              {!isCheckIn && selected.checkInTime && successTime && (
                <span>Duration: {formatDuration(selected.checkInTime, successTime)}</span>
              )}
              <Link to="/" className="btn btn-blue btn-lg">Return Home</Link>
            </div>
          )}
        </section>
      </div>
      </div>
    </div>
  );
}
