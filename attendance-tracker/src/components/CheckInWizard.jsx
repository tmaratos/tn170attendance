import { useState, useMemo } from 'react';
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

  const results = useMemo(() => searchMembers(query), [query, searchMembers]);
  const popularSearches = useMemo(() => {
    if (compact) return ['My Name', 'My CAPID'];
    return members.slice(0, 4).map((m) => m.name.split(' ')[0]);
  }, [compact, members]);

  const previewMember = selected || results[0] || members[0];

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

  const handleSelect = (member) => {
    setSelected(member);
    setStep(1);
  };

  const handlePinDigit = (digit) => {
    setPinError('');
    setPin((p) => p + digit);
  };

  const handleConfirmPinDigit = (digit) => {
    setPinError('');
    setConfirmPin((p) => p + digit);
  };

  const resolvePinMode = () => {
    if (!selected) return 'verify';
    if (needsPinSetup?.(selected.id)) return 'create';
    if (memberHasPin?.(selected.id)) return 'verify';
    if (selected.hasPin === false || selected.pinResetRequired) return 'create';
    return selected.pin ? 'verify' : 'create';
  };

  const goToPin = () => {
    if (!selected) return;
    const nextMode = isFirebase ? resolvePinMode() : (selected.pin ? 'verify' : 'create');
    setPinMode(nextMode);
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

  const actionLabel = mode === 'check-in' ? 'CHECK IN' : 'CHECK OUT';
  const successLabel = mode === 'check-in' ? 'CHECKED IN!' : 'CHECKED OUT!';
  const btnClass = mode === 'check-in' ? 'btn-green' : 'btn-red';

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

  return (
    <div className="kiosk-panel">
      <h2 className="kiosk-title">Check In / Out Process</h2>
      <p className="kiosk-subtitle">
        {mode === 'check-in'
          ? "Search for your name to check in to tonight's meeting"
          : 'Search for your name to check out'}
      </p>

      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <div
            key={s.label}
            className={`wizard-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
          >
            <span className="wizard-step-num">{s.num}</span>
            {s.label}
          </div>
        ))}
      </div>

      <div className="wizard-content">
        {step === 0 && (
          <SearchMember
            query={query}
            onQueryChange={setQuery}
            results={results}
            onSelect={handleSelect}
            selectedId={selected?.id}
            popularSearches={popularSearches}
          />
        )}

        {step === 1 && selected && (
          <div>
            <MemberMini member={selected} />
            <div className="wizard-nav">
              <button type="button" className="btn btn-outline" onClick={() => setStep(0)}>
                Back
              </button>
              <button type="button" className="btn btn-blue" onClick={goToPin}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 2 && selected && (
          <div>
            <p className="kiosk-subtitle">
              {pinMode === 'create'
                ? `Create your 4-digit PIN, ${selected.name.split(' ')[0]}`
                : `Enter your 4-digit PIN for ${selected.name}`}
            </p>
            {pinError && <div className="pin-error">{pinError}</div>}
            <PinPad
              pin={pin}
              onDigit={handlePinDigit}
              onBackspace={() => setPin((p) => p.slice(0, -1))}
              onClear={() => { setPin(''); setPinError(''); }}
            />
            {pinMode === 'create' && pin.length === 4 && (
              <>
                <p className="kiosk-subtitle">Confirm your PIN</p>
                <PinPad
                  pin={confirmPin}
                  onDigit={handleConfirmPinDigit}
                  onBackspace={() => setConfirmPin((p) => p.slice(0, -1))}
                  onClear={() => setConfirmPin('')}
                />
              </>
            )}
            <div className="wizard-nav">
              <button type="button" className="btn btn-outline" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                type="button"
                className="btn btn-blue"
                onClick={handlePinStepContinue}
                disabled={
                  loading ||
                  pin.length !== 4 ||
                  (pinMode === 'create' && confirmPin.length !== 4)
                }
              >
                {loading ? 'Please wait...' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && selected && (
          <div>
            <div className="confirm-member">
              <div className="confirm-avatar">{getInitials(selected.name)}</div>
              <div className="confirm-name">{selected.name}</div>
              <div className="confirm-meta">
                {selected.grade} <span aria-hidden="true">&bull;</span> CAPID: {selected.capid}
              </div>
            </div>
            {pinError && <div className="pin-error">{pinError}</div>}
            <div className="confirm-actions">
              <button
                type="button"
                className={`btn btn-lg btn-block ${btnClass}`}
                onClick={handleConfirm}
                disabled={loading}
              >
                {loading ? 'Processing...' : actionLabel}
              </button>
              <button type="button" className="btn btn-outline btn-block" onClick={reset}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="success-screen">
            <div className={`success-icon ${mode === 'check-in' ? 'in' : 'out'}`}>
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m5 12 4 4L19 6" />
              </svg>
            </div>
            <div className={`success-title ${mode === 'check-in' ? 'in' : 'out'}`}>
              {successLabel}
            </div>
            <div className="success-time">
              {timestamp && formatTime(timestamp)}
            </div>
            <button type="button" className="btn btn-blue btn-lg" onClick={reset}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
