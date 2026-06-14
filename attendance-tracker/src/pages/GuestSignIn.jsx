import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PinPad from '../components/PinPad';
import { formatDateTime } from '../data/mockData';
import { getCallableError } from '../services/errors';
import { useLocalTime } from '../hooks/useLocalTime';

const STEPS = ['Guest', 'Host', 'PIN', 'Confirm', 'Success'];

export default function GuestSignIn({ attendance }) {
  const {
    members,
    recurringGuests,
    checkInGuest,
    verifyPin,
    isFirebase,
  } = attendance;
  const [step, setStep] = useState(0);
  const [guestName, setGuestName] = useState('');
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [selectedHost, setSelectedHost] = useState(null);
  const [hostQuery, setHostQuery] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successTime, setSuccessTime] = useState(null);
  const { dateStr, shortTimeStr } = useLocalTime();

  const matchingGuests = useMemo(() => {
    if (!guestName.trim()) return [];
    const query = guestName.toLowerCase();
    return recurringGuests.filter((guest) => guest.name.toLowerCase().includes(query)).slice(0, 6);
  }, [guestName, recurringGuests]);

  const seniorMembers = useMemo(() => {
    const query = hostQuery.toLowerCase().trim();
    return members
      .filter((member) => member.role === 'Senior Member')
      .filter((member) => !query || member.name.toLowerCase().includes(query) || String(member.capid).includes(query))
      .slice(0, 10);
  }, [members, hostQuery]);

  const reset = () => {
    setStep(0);
    setGuestName('');
    setSelectedGuest(null);
    setSelectedHost(null);
    setHostQuery('');
    setPin('');
    setError('');
    setLoading(false);
    setSuccessTime(null);
  };

  const verifyHostPin = () => {
    if (!selectedHost || pin.length !== 4) return;
    if (!isFirebase && !verifyPin(selectedHost.id, pin)) {
      setPin('');
      setError('Incorrect host PIN. Try again.');
      return;
    }
    setError('');
    setStep(3);
  };

  const confirmGuestSignIn = async () => {
    if (!guestName.trim() || !selectedHost) return;
    setLoading(true);
    setError('');

    try {
      await checkInGuest({
        name: guestName.trim(),
        hostId: selectedHost.id,
        hostCapid: selectedHost.capidRaw || selectedHost.id,
        hostName: selectedHost.name,
        hostPin: pin,
        guestId: selectedGuest?.guestId || selectedGuest?.id || null,
      });
      setSuccessTime(new Date().toISOString());
      setStep(4);
    } catch (err) {
      setPin('');
      setStep(2);
      setError(getCallableError(err) || 'Guest sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="public-flow-page guest-flow">
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
            <span>GUEST SIGN IN</span>
            <h1>Register a visitor</h1>
          </div>

          <div className="public-flow-steps">
            {STEPS.map((label, index) => (
              <div
                key={label}
                className={`public-flow-step ${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`}
              >
                <span>{index + 1}</span>
                {label}
              </div>
            ))}
          </div>

          {step === 0 && (
            <div className="public-flow-section">
              <label htmlFor="guest-name">Guest name</label>
              <input
                id="guest-name"
                className="public-flow-search"
                value={guestName}
                onChange={(event) => {
                  setGuestName(event.target.value);
                  setSelectedGuest(null);
                }}
                autoFocus
                placeholder="Search existing guest or enter new name"
              />
              <div className="public-member-results">
                {matchingGuests.map((guest) => (
                  <button
                    type="button"
                    key={guest.id}
                    className={`public-member-result ${selectedGuest?.id === guest.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedGuest(guest);
                      setGuestName(guest.name);
                    }}
                  >
                    <span className="public-member-avatar">{guest.name.slice(0, 1).toUpperCase()}</span>
                    <span>
                      <strong>{guest.name}</strong>
                      <small>Hosted by {guest.hostName || 'Senior Member'} - {guest.totalVisits || 0} visits</small>
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="public-confirm-button guest"
                onClick={() => setStep(1)}
                disabled={!guestName.trim()}
              >
                Continue
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="public-flow-section">
              <label htmlFor="host-search">Select host Senior Member</label>
              <input
                id="host-search"
                className="public-flow-search"
                value={hostQuery}
                onChange={(event) => setHostQuery(event.target.value)}
                placeholder="Search host name or CAPID"
              />
              <div className="public-member-results">
                {seniorMembers.map((member) => (
                  <button
                    type="button"
                    key={member.id}
                    className={`public-member-result ${selectedHost?.id === member.id ? 'selected' : ''}`}
                    onClick={() => setSelectedHost(member)}
                  >
                    <span className="public-member-avatar">{member.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
                    <span>
                      <strong>{member.name}</strong>
                      <small>{member.grade} - CAPID {member.capid}</small>
                    </span>
                  </button>
                ))}
              </div>
              <div className="public-flow-actions">
                <button type="button" className="btn btn-outline" onClick={() => setStep(0)}>Back</button>
                <button type="button" className="btn btn-blue" onClick={() => setStep(2)} disabled={!selectedHost}>Continue</button>
              </div>
            </div>
          )}

          {step === 2 && selectedHost && (
            <div className="public-flow-section pin-section">
              <div className="public-selected-member">
                <strong>{selectedHost.name}</strong>
                <span>Host authorization PIN</span>
              </div>
              {error && <div className="public-flow-error">{error}</div>}
              <PinPad
                pin={pin}
                onDigit={(digit) => {
                  setError('');
                  setPin((current) => (current.length < 4 ? `${current}${digit}` : current));
                }}
                onBackspace={() => setPin((current) => current.slice(0, -1))}
                onClear={() => setPin('')}
              />
              <div className="public-flow-actions">
                <button type="button" className="btn btn-outline" onClick={() => setStep(1)}>Back</button>
                <button type="button" className="btn btn-blue" onClick={verifyHostPin} disabled={pin.length !== 4}>Continue</button>
              </div>
            </div>
          )}

          {step === 3 && selectedHost && (
            <div className="public-flow-section">
              <div className="public-confirm-card">
                <span className="public-member-avatar large">{guestName.slice(0, 1).toUpperCase()}</span>
                <h2>{guestName}</h2>
                <p>Hosted by {selectedHost.name}</p>
                <dl>
                  <dt>Date</dt>
                  <dd>{new Date().toLocaleDateString('en-US')}</dd>
                  <dt>Time</dt>
                  <dd>{new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</dd>
                </dl>
              </div>
              {error && <div className="public-flow-error">{error}</div>}
              <button
                type="button"
                className="public-confirm-button guest"
                onClick={confirmGuestSignIn}
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'CONFIRM GUEST SIGN IN'}
              </button>
              <button type="button" className="public-cancel-button" onClick={reset}>
                Cancel
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="public-success-screen">
              <div className="public-success-icon guest">
                <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </div>
              <h2>GUEST SIGNED IN</h2>
              <strong>{guestName}</strong>
              <span>{successTime ? formatDateTime(successTime) : formatDateTime(new Date().toISOString())}</span>
              <Link to="/" className="btn btn-blue btn-lg">Return Home</Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
