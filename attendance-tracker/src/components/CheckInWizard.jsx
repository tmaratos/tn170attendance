import { useState, useMemo } from 'react';
import SearchMember from './SearchMember';
import PinPad from './PinPad';
import { getInitials, formatTime } from '../data/mockData';
import { getCallableError } from '../services/errors';

const STEPS = ['Search', 'Select', 'PIN', 'Confirm', 'Done'];

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
    const names = members.slice(0, 4).map((m) => m.name.split(' ')[0]);
    return names;
  }, [members]);

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
        setPinError('PINs do not match. Please try again.');
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
          setPinError(getCallableError(err) || 'Could not create PIN. Please try again.');
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
      setPinError('Incorrect PIN. Please try again.');
      setPin('');
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    setPinError('');
    try {
      let result;
      if (isFirebase) {
        if (mode === 'check-in') {
          result = await onCheckIn(selected.id, pin);
        } else {
          result = await onCheckOut(selected.id, pin);
        }
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
      setPinError(getCallableError(err) || 'Action failed. Please try again.');
      setStep(2);
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const actionLabel = mode === 'check-in' ? 'CHECK IN' : 'CHECK OUT';
  const successLabel = mode === 'check-in' ? 'CHECKED IN!' : 'CHECKED OUT!';
  const btnClass = mode === 'check-in' ? 'btn-green' : 'btn-red';

  return (
    <div className={compact ? '' : 'kiosk-panel'}>
      {!compact && (
        <>
          <h2 className="kiosk-title">Check In / Out Process</h2>
          <p className="kiosk-subtitle">
            {mode === 'check-in'
              ? 'Search for your name to check in to tonight\'s meeting'
              : 'Search for your name to check out'}
          </p>
        </>
      )}

      <div className="wizard-steps">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`wizard-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
          >
            <span className="wizard-step-num">{i + 1}</span>
            {label}
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
            <div className="member-result selected" style={{ marginBottom: 24 }}>
              <div className="avatar">{getInitials(selected.name)}</div>
              <div>
                <div className="member-result-name">{selected.name}</div>
                <div className="member-result-meta">
                  {selected.grade} • CAPID {selected.capid}
                </div>
              </div>
              <span>✓</span>
            </div>
            <div className="wizard-nav">
              <button className="btn btn-outline" onClick={() => setStep(0)}>
                Back
              </button>
              <button className="btn btn-blue" onClick={goToPin}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 2 && selected && (
          <div>
            <p style={{ textAlign: 'center', marginBottom: 16, color: 'rgba(255,255,255,0.7)' }}>
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
                <p style={{ textAlign: 'center', margin: '16px 0 8px', color: 'rgba(255,255,255,0.7)' }}>
                  Confirm your PIN
                </p>
                <PinPad
                  pin={confirmPin}
                  onDigit={handleConfirmPinDigit}
                  onBackspace={() => setConfirmPin((p) => p.slice(0, -1))}
                  onClear={() => setConfirmPin('')}
                />
              </>
            )}
            <div className="wizard-nav">
              <button className="btn btn-outline" onClick={() => setStep(1)}>
                Back
              </button>
              <button
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
                {selected.grade} • CAPID {selected.capid}
              </div>
            </div>
            {pinError && <div className="pin-error">{pinError}</div>}
            <div className="confirm-actions">
              <button
                className={`btn btn-lg btn-block ${btnClass}`}
                onClick={handleConfirm}
                disabled={loading}
              >
                {loading ? 'Processing...' : actionLabel}
              </button>
              <button className="btn btn-outline btn-block" onClick={reset}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="success-screen">
            <div className={`success-icon ${mode === 'check-in' ? 'in' : 'out'}`}>
              {mode === 'check-in' ? '✓' : '✗'}
            </div>
            <div className={`success-title ${mode === 'check-in' ? 'in' : 'out'}`}>
              {successLabel}
            </div>
            <div className="success-time">
              {timestamp && formatTime(timestamp)}
            </div>
            <button className="btn btn-blue btn-lg" onClick={reset}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
