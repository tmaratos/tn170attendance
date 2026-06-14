import { useEffect, useMemo, useRef, useState } from 'react';
import SearchMember from './SearchMember';
import PinPad from './PinPad';
import { getInitials, formatTime } from '../data/mockData';
import { getCallableError } from '../services/errors';

const STEPS = [
  { num: 1, label: 'Search Member' },
  { num: 2, label: 'Select Member' },
  { num: 3, label: 'Enter PIN' },
  { num: 4, label: 'Confirm Action' },
  { num: 5, label: 'Success' },
];

export default function CheckInWizard({
  members,
  searchMembers,
  verifyPin,
  onCheckIn,
  onCheckOut,
  mode = 'check-in',
  compact = false,
  isFirebase = false,
  memberHasPin,
  needsPinSetup,
  createMemberPin,
  refreshOnSuccess = false,
}) {
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinMode, setPinMode] = useState('verify');
  const [pinError, setPinError] = useState('');
  const [loading, setLoading] = useState(false);
  const [timestamp, setTimestamp] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const searchInputRef = useRef(null);
  const successTimerRef = useRef(null);

  const results = useMemo(() => searchMembers(query), [query, searchMembers]);
  const popularSearches = useMemo(() => {
    if (compact) return ['My Name', 'My CAPID'];
    return members.slice(0, 4).map((m) => m.name.split(' ')[0]);
  }, [compact, members]);

  const previewMember = selected || results[0] || members[0];
  const actionLabel = mode === 'check-in' ? 'CHECK IN' : 'CHECK OUT';
  const actionVerb = mode === 'check-in' ? 'checked in' : 'checked out';
  const successLabel = mode === 'check-in' ? 'CHECKED IN!' : 'CHECKED OUT!';
  const btnClass = mode === 'check-in' ? 'btn-green' : 'btn-red';

  useEffect(() => {
    if (!compact) {
      searchInputRef.current?.focus();
    }

    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, [compact]);

  const reset = () => {
    setStep(0);
    setQuery('');
    setSelected(null);
    setPin('');
    setConfirmPin('');
    setPinMode('verify');
    setPinError('');
    setLoading(false);
    setTimestamp(null);
  };

  const resetForNextPerson = (message) => {
    setSuccessMessage(message);
    setQuery('');
    setSelected(null);
    setPin('');
    setConfirmPin('');
    setPinMode('verify');
    setPinError('');
    setLoading(false);
    setTimestamp(null);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = window.setTimeout(() => {
      if (refreshOnSuccess) {
        window.location.reload();
        return;
      }
      setSuccessMessage('');
    }, refreshOnSuccess ? 1500 : 2600);
  };

  const resolvePinMode = (member = selected) => {
    if (!member) return 'verify';
    if (needsPinSetup?.(member.id)) return 'create';
    if (memberHasPin?.(member.id)) return 'verify';
    return 'create';
  };

  const handleSelect = (member) => {
    setSelected(member);
    setStep(1);
  };

  const handleKioskSelect = (member) => {
    setSelected(member);
    setPin('');
    setConfirmPin('');
    setPinError('');
    setSuccessMessage('');
    setPinMode(resolvePinMode(member));
  };

  const handlePinDigit = (digit) => {
    setPinError('');
    setPin((p) => p + digit);
  };

  const handleConfirmPinDigit = (digit) => {
    setPinError('');
    setConfirmPin((p) => p + digit);
  };

  const goToPin = () => {
    if (!selected) return;
    setPinMode(resolvePinMode(selected));
    setPin('');
    setConfirmPin('');
    setPinError('');
    setStep(2);
  };

  const handlePinStepContinue = async () => {
    if (pin.length !== 4) return;

    if (pinMode === 'create') {
      if (confirmPin.length !== 4) {
        setPinError('Please confirm your 4-digit PIN.');
        return;
      }
      if (pin !== confirmPin) {
        setPinError('PINs do not match.');
        setPin('');
        setConfirmPin('');
        return;
      }
      setPinError('');
      if (isFirebase && createMemberPin) {
        setLoading(true);
        try {
          await createMemberPin(selected.id, pin, confirmPin);
          setStep(3);
        } catch (err) {
          setPinError(getCallableError(err) || 'Could not create PIN.');
          setPin('');
          setConfirmPin('');
        } finally {
          setLoading(false);
        }
        return;
      }
      setStep(3);
      return;
    }

    if (isFirebase) {
      setStep(3);
      return;
    }

    if (verifyPin(selected.id, pin)) {
      setStep(3);
    } else {
      setPinError('Incorrect PIN.');
      setPin('');
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    setPinError('');
    try {
      let result;
      if (isFirebase) {
        result = mode === 'check-in'
          ? await onCheckIn(selected.id, pin)
          : await onCheckOut(selected.id, pin);
        setTimestamp(result?.checkInTime || result?.checkOutTime || new Date().toISOString());
      } else {
        const now = new Date().toISOString();
        setTimestamp(now);
        if (mode === 'check-in') {
          onCheckIn(selected.id);
        } else {
          onCheckOut(selected.id);
        }
      }
      setStep(4);
    } catch (err) {
      setPinError(getCallableError(err) || 'Action failed.');
      setStep(2);
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const submitKioskPin = async (pinToSubmit) => {
    if (!selected || loading) return;

    const member = selected;
    setLoading(true);
    setPinError('');

    if (pinMode === 'create') {
      if (confirmPin.length !== 4) {
        setPin(`${pinToSubmit}`);
        setPinError('Confirm your new 4-digit PIN below.');
        setLoading(false);
        return;
      }
      if (pinToSubmit !== confirmPin) {
        setPin('');
        setConfirmPin('');
        setPinError('PINs do not match. Try again.');
        setLoading(false);
        return;
      }
      try {
        await createMemberPin(member.id, pinToSubmit, confirmPin);
        if (mode === 'check-in') {
          await onCheckIn(member.id, pinToSubmit);
        } else {
          await onCheckOut(member.id, pinToSubmit);
        }
        resetForNextPerson(`${member.name} ${actionVerb}.`);
      } catch (err) {
        setPin('');
        setConfirmPin('');
        setPinError(getCallableError(err) || 'Could not create PIN.');
        setLoading(false);
      }
      return;
    }

    try {
      if (isFirebase) {
        if (mode === 'check-in') {
          await onCheckIn(member.id, pinToSubmit);
        } else {
          await onCheckOut(member.id, pinToSubmit);
        }
      } else {
        if (!verifyPin(member.id, pinToSubmit)) {
          setPin('');
          setPinError('Incorrect PIN. Try again.');
          setLoading(false);
          return;
        }
        if (mode === 'check-in') {
          onCheckIn(member.id);
        } else {
          onCheckOut(member.id);
        }
      }

      resetForNextPerson(`${member.name} ${actionVerb}.`);
    } catch (err) {
      setPin('');
      setPinError(getCallableError(err) || 'Incorrect PIN. Try again.');
      setLoading(false);
    }
  };

  const handleKioskDigit = (digit) => {
    if (loading) return;
    if (pinMode === 'create' && pin.length >= 4 && confirmPin.length >= 4) return;

    if (pinMode === 'create' && pin.length >= 4) {
      const nextConfirm = `${confirmPin}${digit}`.slice(0, 4);
      setConfirmPin(nextConfirm);
      setPinError('');
      if (nextConfirm.length === 4) {
        submitKioskPin(pin);
      }
      return;
    }

    if (pin.length >= 4) return;
    const nextPin = `${pin}${digit}`;
    setPin(nextPin);
    setPinError('');
    if (nextPin.length === 4 && pinMode !== 'create') {
      submitKioskPin(nextPin);
    }
  };

  const closeKioskModal = () => {
    setSelected(null);
    setPin('');
    setConfirmPin('');
    setPinError('');
    setLoading(false);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const handleKioskEnter = (event) => {
    if (event.key !== 'Enter') return;
    if (event.target.closest?.('button,a')) return;
    event.preventDefault();

    if (selected) {
      if (pinMode === 'create' && pin.length === 4 && confirmPin.length === 4) {
        submitKioskPin(pin);
      }
      return;
    }

    if (query.trim() && kioskResults.length > 0) {
      handleKioskSelect(kioskResults[0]);
    }
  };

  const getPanelClass = (index) => {
    if (index === step) return 'active';
    if (index < step) return 'done';
    return 'upcoming';
  };

  const MemberMini = ({ member }) => (
    <div className="member-result selected preview-member">
      <div className="avatar">{getInitials(member.name)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="member-result-name">{member.name}</div>
        <div className="member-result-meta">
          {member.grade} <span aria-hidden="true">&bull;</span> CAPID: {member.capid}
        </div>
      </div>
      <span className="member-result-check" aria-hidden="true">OK</span>
    </div>
  );

  if (compact) {
    const displayResults = results.slice(0, 3);

    return (
      <div className="kiosk-panel compact">
        <h2 className="kiosk-title">Check In / Out Process</h2>

        <div className="wizard-horizontal">
          <div className={`wizard-step-panel ${getPanelClass(0)}`}>
            <div className="wizard-step-label">
              <span className="wizard-step-num">1</span>
              Search Member
            </div>
            <div className="wizard-step-content">
              <SearchMember
                query={query}
                onQueryChange={setQuery}
                results={results}
                onSelect={handleSelect}
                selectedId={selected?.id}
                popularSearches={popularSearches}
                hideResults
                compact
              />
            </div>
          </div>

          <div className={`wizard-step-panel ${getPanelClass(1)}`}>
            <div className="wizard-step-label">
              <span className="wizard-step-num">2</span>
              Select Member
            </div>
            <div className="wizard-step-content">
              <div className="member-results member-results-compact">
                {displayResults.map((member) => (
                  <div
                    key={member.id}
                    className={`member-result ${selected?.id === member.id || (!selected && member.id === previewMember?.id) ? 'selected' : ''}`}
                    onClick={() => handleSelect(member)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSelect(member)}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="member-result-radio" />
                    <div className="avatar">{getInitials(member.name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="member-result-name">{member.name}</div>
                      <div className="member-result-meta">
                        {member.grade} <span aria-hidden="true">&bull;</span> CAPID: {member.capid}
                      </div>
                    </div>
                    {(selected?.id === member.id || (!selected && member.id === previewMember?.id)) && (
                      <span className="member-result-check" aria-hidden="true">OK</span>
                    )}
                  </div>
                ))}
              </div>
              {selected && step === 1 && (
                <button type="button" className="btn btn-blue pin-continue-btn" onClick={goToPin}>
                  Continue <span aria-hidden="true">&rarr;</span>
                </button>
              )}
              <button type="button" className="cant-find-btn">
                Can't Find Member?
              </button>
            </div>
          </div>

          <div className={`wizard-step-panel ${getPanelClass(2)}`}>
            <div className="wizard-step-label">
              <span className="wizard-step-num">3</span>
              Enter PIN
            </div>
            <div className="wizard-step-content">
              <p className="wizard-mini-copy">Enter your 4-digit PIN</p>
              {pinError && <div className="pin-error">{pinError}</div>}
              <PinPad
                pin={pin}
                onDigit={handlePinDigit}
                onBackspace={() => setPin((p) => p.slice(0, -1))}
                onClear={() => { setPin(''); setPinError(''); }}
                compact
              />
              {pinMode === 'create' && pin.length === 4 && (
                <>
                  <p className="wizard-mini-copy">Confirm PIN</p>
                  <PinPad
                    pin={confirmPin}
                    onDigit={handleConfirmPinDigit}
                    onBackspace={() => setConfirmPin((p) => p.slice(0, -1))}
                    onClear={() => setConfirmPin('')}
                    compact
                  />
                </>
              )}
              {step === 2 && (
                <button
                  type="button"
                  className="btn btn-blue pin-continue-btn"
                  onClick={handlePinStepContinue}
                  disabled={
                    loading ||
                    pin.length !== 4 ||
                    (pinMode === 'create' && confirmPin.length !== 4)
                  }
                >
                  {loading ? 'Wait...' : 'Continue'} <span aria-hidden="true">&rarr;</span>
                </button>
              )}
            </div>
          </div>

          <div className={`wizard-step-panel ${getPanelClass(3)}`}>
            <div className="wizard-step-label">
              <span className="wizard-step-num">4</span>
              Confirm Action
            </div>
            <div className="wizard-step-content">
              <p className="wizard-mini-copy">You are checking in:</p>
              {previewMember && <MemberMini member={previewMember} />}
              {pinError && <div className="pin-error">{pinError}</div>}
              <div className="confirm-actions">
                <button
                  type="button"
                  className={`btn ${btnClass}`}
                  onClick={handleConfirm}
                  disabled={loading || step !== 3 || !selected}
                >
                  {loading ? 'Processing...' : actionLabel}
                </button>
                <button type="button" className="btn btn-outline" onClick={reset}>
                  Cancel
                </button>
              </div>
            </div>
          </div>

          <div className={`wizard-step-panel ${getPanelClass(4)}`}>
            <div className="wizard-step-label">
              <span className="wizard-step-num">5</span>
              Success
            </div>
            <div className="wizard-step-content">
              <div className="success-screen success-screen-compact">
                <div className={`success-icon ${mode === 'check-in' ? 'in' : 'out'}`}>
                  <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </div>
                <div className={`success-title ${mode === 'check-in' ? 'in' : 'out'}`}>
                  {successLabel}
                </div>
                <div className="success-time-box">
                  <span>Check In Time</span>
                  <strong>{timestamp ? formatTime(timestamp) : '7:15 PM'}</strong>
                </div>
                <button type="button" className="btn btn-blue" onClick={reset}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const kioskResults = query.trim() ? results.slice(0, 8) : [];

  return (
    <div className="kiosk-panel kiosk-touch-panel" onKeyDown={handleKioskEnter}>
      <div className="kiosk-touch-header">
        <div>
          <p className="kiosk-touch-kicker">{mode === 'check-in' ? 'Member Check In' : 'Member Check Out'}</p>
          <h2>{mode === 'check-in' ? 'Search and tap your name' : 'Search and tap your name to check out'}</h2>
        </div>
        <span className={`kiosk-touch-status ${mode === 'check-in' ? 'in' : 'out'}`}>
          {mode === 'check-in' ? 'Check In' : 'Check Out'}
        </span>
      </div>

      <div className="kiosk-search-shell">
        <p className="pin-setup-hint kiosk-pin-help">
          New or forgot PIN? Select your name — you&apos;ll be prompted to create one if none exists
          on this device. Each tablet or browser stores PINs locally; set yours once per device.
        </p>
        <label className="kiosk-search-label" htmlFor={`${mode}-member-search`}>
          Name or CAPID
        </label>
        <input
          id={`${mode}-member-search`}
          ref={searchInputRef}
          className="kiosk-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          inputMode="search"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck="false"
          placeholder="Start typing a name or CAPID"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && kioskResults.length > 0) {
              event.preventDefault();
              event.stopPropagation();
              handleKioskSelect(kioskResults[0]);
            }
          }}
        />
      </div>

      {successMessage && (
        <div className="kiosk-success-message" role="status">
          {successMessage}
        </div>
      )}

      <div className="kiosk-results" aria-live="polite">
        {!query.trim() && (
          <div className="kiosk-empty-state">
            Use the search box to find your name or CAPID.
          </div>
        )}

        {query.trim() && kioskResults.length === 0 && (
          <div className="kiosk-empty-state">
            No matching members found.
          </div>
        )}

        {kioskResults.map((member) => (
          <button
            key={member.id}
            type="button"
            className="kiosk-member-button"
            onClick={() => handleKioskSelect(member)}
          >
            <span className="kiosk-member-avatar">{getInitials(member.name)}</span>
            <span className="kiosk-member-copy">
              <strong>{member.name}</strong>
              <small>{member.grade} <span aria-hidden="true">&bull;</span> CAPID: {member.capid}</small>
            </span>
            <span className="kiosk-member-action">Tap</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="pin-modal-backdrop" role="presentation">
          <div
            className="pin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pin-modal-title"
          >
            <div className="pin-modal-header">
              <div>
                <p>{actionLabel}</p>
                <h3 id="pin-modal-title">{selected.name}</h3>
                <span>{selected.grade} <span aria-hidden="true">&bull;</span> CAPID: {selected.capid}</span>
                <p className="pin-modal-mode-label">
                  {pinMode === 'create' ? 'Create your PIN' : 'Enter your PIN'}
                </p>
                <p className="pin-setup-hint pin-modal-hint">
                  {pinMode === 'create'
                    ? 'First time on this device? Create your 4-digit PIN. You\'ll use it for check-in, check-out, and admin login.'
                    : 'Enter the PIN you created on this device.'}
                </p>
              </div>
              <button
                type="button"
                className="pin-modal-cancel-top"
                onClick={closeKioskModal}
                aria-label="Cancel PIN entry"
              >
                Cancel
              </button>
            </div>

            <div className="pin-entry-display" aria-label={`${pin.length} of 4 PIN digits entered`}>
              {Array.from({ length: 4 }).map((_, index) => (
                <span key={index} className={index < pin.length ? 'filled' : ''} />
              ))}
            </div>

            {pinError && (
              <div className="pin-modal-error" role="alert">
                {pinError}
              </div>
            )}

            {pinMode === 'create' && pin.length === 4 && (
              <p className="wizard-mini-copy" style={{ textAlign: 'center', marginBottom: 8 }}>
                Confirm your new PIN
              </p>
            )}

            {pinMode === 'create' && pin.length === 4 && (
              <div className="pin-entry-display" aria-label={`${confirmPin.length} of 4 confirm digits entered`}>
                {Array.from({ length: 4 }).map((_, index) => (
                  <span key={`confirm-${index}`} className={index < confirmPin.length ? 'filled' : ''} />
                ))}
              </div>
            )}

            {loading && (
              <div className="pin-modal-working" role="status">
                Checking PIN...
              </div>
            )}

            <div className="pin-modal-pad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  className="pin-modal-key"
                  onClick={() => handleKioskDigit(digit)}
                  disabled={loading}
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                className="pin-modal-key secondary"
                onClick={() => {
                  setPin('');
                  setPinError('');
                }}
                disabled={loading || pin.length === 0}
              >
                Clear
              </button>
              <button
                type="button"
                className="pin-modal-key"
                onClick={() => handleKioskDigit('0')}
                disabled={loading}
              >
                0
              </button>
              <button
                type="button"
                className="pin-modal-key secondary"
                onClick={() => {
                  setPin((current) => current.slice(0, -1));
                  setPinError('');
                }}
                disabled={loading || pin.length === 0}
              >
                Back
              </button>
            </div>

            <button
              type="button"
              className="pin-modal-cancel"
              onClick={closeKioskModal}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
