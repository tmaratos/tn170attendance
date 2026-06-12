import { useState, useMemo } from 'react';
import SearchMember from './SearchMember';
import PinPad from './PinPad';
import { getInitials, formatTime } from '../data/mockData';

const STEPS = ['Search', 'Select', 'PIN', 'Confirm', 'Done'];

export default function CheckInWizard({
  members,
  searchMembers,
  verifyPin,
  onCheckIn,
  onCheckOut,
  mode = 'check-in',
  compact = false,
}) {
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
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
    setPinError('');
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

  const handlePinComplete = () => {
    if (pin.length === 4) {
      if (verifyPin(selected.id, pin)) {
        setStep(3);
      } else {
        setPinError('Incorrect PIN. Please try again.');
        setPin('');
      }
    }
  };

  const handleConfirm = () => {
    const now = new Date().toISOString();
    setTimestamp(now);
    if (mode === 'check-in') {
      onCheckIn(selected.id);
    } else {
      onCheckOut(selected.id);
    }
    setStep(4);
  };

  const goToPin = () => {
    if (selected) setStep(2);
  };

  const title = mode === 'check-in' ? 'Check In' : 'Check Out';
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
            <div
              className={`member-result selected`}
              style={{ marginBottom: 24 }}
            >
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
              Enter your 4-digit PIN for {selected.name}
            </p>
            {pinError && <div className="pin-error">{pinError}</div>}
            <PinPad
              pin={pin}
              onDigit={handlePinDigit}
              onBackspace={() => setPin((p) => p.slice(0, -1))}
              onClear={() => { setPin(''); setPinError(''); }}
            />
            <div className="wizard-nav">
              <button className="btn btn-outline" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                className="btn btn-blue"
                onClick={handlePinComplete}
                disabled={pin.length !== 4}
              >
                Continue
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
            <div className="confirm-actions">
              <button className={`btn btn-lg btn-block ${btnClass}`} onClick={handleConfirm}>
                {actionLabel}
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
