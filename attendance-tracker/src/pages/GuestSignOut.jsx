import { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDateTime, formatTime } from '../data/mockData';
import { getCallableError } from '../services/errors';
import { useLocalTime } from '../hooks/useLocalTime';

const STEPS = ['Guest', 'Confirm', 'Success'];

export default function GuestSignOut({ attendance }) {
  const { guests, recurringGuests, checkOutGuest } = attendance;
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [guestQuery, setGuestQuery] = useState('');
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successTime, setSuccessTime] = useState(null);
  const { dateStr, shortTimeStr } = useLocalTime();

  const presentGuests = useMemo(
    () => guests.filter((g) => g.status === 'checked-in'),
    [guests]
  );

  const matchingPresent = useMemo(() => {
    if (!guestQuery.trim()) return presentGuests;
    const query = guestQuery.toLowerCase();
    return presentGuests.filter((g) => g.name.toLowerCase().includes(query));
  }, [guestQuery, presentGuests]);

  const matchingRecurring = useMemo(() => {
    if (!guestQuery.trim()) return [];
    const query = guestQuery.toLowerCase();
    return recurringGuests
      .filter((g) => g.name.toLowerCase().includes(query))
      .filter((g) => !presentGuests.some((p) => p.name.toLowerCase() === g.name.toLowerCase()))
      .slice(0, 4);
  }, [guestQuery, recurringGuests, presentGuests]);

  useEffect(() => {
    const guestId = searchParams.get('guestId');
    if (!guestId) return;
    const guest = presentGuests.find((g) => g.id === guestId);
    if (guest) {
      setSelectedGuest(guest);
      setGuestQuery(guest.name);
      setStep(1);
    }
  }, [searchParams, presentGuests]);

  const selectGuest = (guest) => {
    setSelectedGuest(guest);
    setGuestQuery(guest.name);
    setError('');
    setStep(1);
  };

  const continueFromGuest = () => {
    if (!selectedGuest) {
      setError('Select a guest who is currently signed in.');
      return;
    }
    setError('');
    setStep(1);
  };

  const confirmGuestSignOut = async () => {
    if (!selectedGuest) return;
    setLoading(true);
    setError('');

    try {
      await checkOutGuest(selectedGuest.id);
      setSuccessTime(new Date().toISOString());
      setStep(2);
    } catch (err) {
      setError(getCallableError(err) || err.message || 'Guest sign-out failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleFlowEnter = (event) => {
    if (event.key !== 'Enter') return;
    if (event.target.closest?.('button,a')) return;
    event.preventDefault();

    if (step === 0) {
      continueFromGuest();
      return;
    }
    if (step === 1 && !loading) {
      confirmGuestSignOut();
    }
  };

  return (
    <div className="public-flow-page guest-flow guest-out-flow" onKeyDown={handleFlowEnter}>
      <div className="public-flow-body">
        <div className="public-flow-shell">
          <div className="public-flow-header">
            <Link to="/" className="public-back-link">
              Home
            </Link>
            <div>
              <p>{dateStr}</p>
              <strong>{shortTimeStr}</strong>
            </div>
          </div>

          <section className="public-flow-card">
            <div className="public-flow-title">
              <span>GUEST SIGN OUT</span>
              <h1>Sign out a visitor</h1>
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
                <label htmlFor="guest-search">Find guest to sign out</label>
                <input
                  id="guest-search"
                  className="public-flow-search"
                  value={guestQuery}
                  onChange={(event) => {
                    setGuestQuery(event.target.value);
                    setSelectedGuest(null);
                    setError('');
                  }}
                  autoFocus
                  placeholder="Search signed-in guests"
                />
                {error && <div className="public-flow-error">{error}</div>}
                <div className="public-member-results">
                  {matchingPresent.map((guest) => (
                    <button
                      type="button"
                      key={guest.id}
                      className={`public-member-result ${selectedGuest?.id === guest.id ? 'selected' : ''}`}
                      onClick={() => selectGuest(guest)}
                    >
                      <span className="public-member-avatar">{guest.name.slice(0, 1).toUpperCase()}</span>
                      <span>
                        <strong>{guest.name}</strong>
                        <small>
                          Host: {guest.hostName} — in since {formatTime(guest.checkInTime)}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
                {matchingPresent.length === 0 && !guestQuery.trim() && (
                  <div className="public-flow-empty">No guests are currently signed in.</div>
                )}
                {matchingPresent.length === 0 && guestQuery.trim() && matchingRecurring.length === 0 && (
                  <div className="public-flow-empty">No signed-in guest matches that name.</div>
                )}
                {matchingRecurring.length > 0 && (
                  <>
                    <p className="public-flow-hint">Not signed in tonight:</p>
                    {matchingRecurring.map((guest) => (
                      <div key={guest.id} className="public-member-result disabled">
                        <span className="public-member-avatar">{guest.name.slice(0, 1).toUpperCase()}</span>
                        <span>
                          <strong>{guest.name}</strong>
                          <small>Not checked in — use Guest Sign In first</small>
                        </span>
                      </div>
                    ))}
                  </>
                )}
                <p className="public-flow-alt-link">
                  Need to sign someone in?{' '}
                  <Link to="/guest-sign-in">Go to Guest Sign In</Link>
                </p>
              </div>
            )}

            {step === 1 && selectedGuest && (
              <div className="public-flow-section">
                <div className="public-confirm-card guest-out">
                  <span className="public-member-avatar large">{selectedGuest.name.slice(0, 1).toUpperCase()}</span>
                  <h2>{selectedGuest.name}</h2>
                  <p>Sign out this guest?</p>
                  <dl>
                    <dt>Host</dt>
                    <dd>{selectedGuest.hostName}</dd>
                    <dt>Signed in</dt>
                    <dd>{formatTime(selectedGuest.checkInTime)}</dd>
                  </dl>
                </div>
                {error && <div className="public-flow-error">{error}</div>}
                <button
                  type="button"
                  className="public-confirm-button guest-out"
                  onClick={confirmGuestSignOut}
                  disabled={loading}
                >
                  {loading ? 'Signing out...' : 'CONFIRM GUEST SIGN OUT'}
                </button>
                <button type="button" className="public-cancel-button" onClick={() => setStep(0)}>
                  Back
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="public-success-screen">
                <div className="public-success-icon guest-out">
                  <svg
                    width="72"
                    height="72"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </div>
                <h2>GUEST SIGNED OUT</h2>
                <strong>{selectedGuest?.name}</strong>
                <span>{successTime ? formatDateTime(successTime) : formatDateTime(new Date().toISOString())}</span>
                <Link to="/" className="btn btn-blue btn-lg">
                  Return Home
                </Link>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
