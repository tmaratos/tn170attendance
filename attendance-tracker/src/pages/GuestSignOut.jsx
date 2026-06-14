import { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PinPad from '../components/PinPad';
import { formatDateTime, formatTime } from '../data/mockData';
import { getCallableError } from '../services/errors';
import { useLocalTime } from '../hooks/useLocalTime';
import { ADMIN_CAPIDS } from '../data/rosterData';

const STEPS = ['Guest', 'Host', 'PIN', 'Confirm', 'Success'];

function canAuthorizeGuestSignOut(guest, actorCapid, members) {
  const actorId = String(actorCapid);
  if (ADMIN_CAPIDS.has(actorId)) return true;

  const hostId = String(guest.hostId || '');
  if (hostId && hostId === actorId) return true;

  const actorMember = members.find(
    (m) =>
      String(m.capidRaw || m.capid || m.id) === actorId || String(m.id) === actorId
  );
  if (!actorMember) return false;

  if (hostId === String(actorMember.id)) return true;
  if (hostId === String(actorMember.capidRaw || actorMember.capid)) return true;

  return false;
}

export default function GuestSignOut({ attendance }) {
  const {
    members,
    guests,
    recurringGuests,
    checkOutGuest,
    verifyPin,
    isCloudBackend,
  } = attendance;
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [guestQuery, setGuestQuery] = useState('');
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [selectedHost, setSelectedHost] = useState(null);
  const [hostQuery, setHostQuery] = useState('');
  const [pin, setPin] = useState('');
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

  const seniorMembers = useMemo(() => {
    const query = hostQuery.toLowerCase().trim();
    return members
      .filter((member) => member.role === 'Senior Member')
      .filter(
        (member) =>
          !query ||
          member.name.toLowerCase().includes(query) ||
          String(member.capid).includes(query)
      )
      .slice(0, 10);
  }, [members, hostQuery]);

  const defaultHost = useMemo(() => {
    if (!selectedGuest?.hostId) return null;
    return (
      members.find((m) => String(m.id) === String(selectedGuest.hostId)) ||
      members.find(
        (m) =>
          String(m.capidRaw || m.capid) === String(selectedGuest.hostId) ||
          m.name === selectedGuest.hostName
      ) ||
      null
    );
  }, [selectedGuest, members]);

  useEffect(() => {
    const guestId = searchParams.get('guestId');
    if (!guestId) return;
    const guest = presentGuests.find((g) => g.id === guestId);
    if (guest) {
      setSelectedGuest(guest);
      setGuestQuery(guest.name);
    }
  }, [searchParams, presentGuests]);

  const reset = () => {
    setStep(0);
    setGuestQuery('');
    setSelectedGuest(null);
    setSelectedHost(null);
    setHostQuery('');
    setPin('');
    setError('');
    setLoading(false);
    setSuccessTime(null);
  };

  const selectGuest = (guest) => {
    setSelectedGuest(guest);
    setGuestQuery(guest.name);
    setSelectedHost(null);
    setError('');
  };

  const continueFromGuest = () => {
    if (!selectedGuest) {
      setError('Select a guest who is currently signed in.');
      return;
    }
    setError('');
    setStep(1);
    if (defaultHost) {
      setSelectedHost(defaultHost);
    }
  };

  const continueFromHost = () => {
    if (!selectedHost) return;
    const actorCapid = String(selectedHost.capidRaw || selectedHost.capid || selectedHost.id);
    if (!canAuthorizeGuestSignOut(selectedGuest, actorCapid, members)) {
      setError('Only the original host or an authorized admin can sign out this guest.');
      return;
    }
    setError('');
    setStep(2);
  };

  const verifyHostPin = async () => {
    if (!selectedHost || pin.length !== 4) return;
    setError('');

    if (!isCloudBackend) {
      const pinOk = await verifyPin(selectedHost.id, pin);
      if (!pinOk) {
        setPin('');
        setError('Incorrect PIN. Try again.');
        return;
      }
    }

    setStep(3);
  };

  const confirmGuestSignOut = async () => {
    if (!selectedGuest || !selectedHost) return;
    setLoading(true);
    setError('');

    const actorCapid = String(selectedHost.capidRaw || selectedHost.capid || selectedHost.id);

    try {
      await checkOutGuest(selectedGuest.id, actorCapid, pin);
      setSuccessTime(new Date().toISOString());
      setStep(4);
    } catch (err) {
      setPin('');
      setStep(2);
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
    if (step === 1) {
      continueFromHost();
      return;
    }
    if (step === 2 && pin.length === 4) {
      verifyHostPin();
      return;
    }
    if (step === 3 && !loading) {
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
                <button
                  type="button"
                  className="public-confirm-button guest-out"
                  onClick={continueFromGuest}
                  disabled={!selectedGuest}
                >
                  Continue
                </button>
                <p className="public-flow-alt-link">
                  Need to sign someone in?{' '}
                  <Link to="/guest-sign-in">Go to Guest Sign In</Link>
                </p>
              </div>
            )}

            {step === 1 && selectedGuest && (
              <div className="public-flow-section">
                <div className="public-selected-member">
                  <strong>{selectedGuest.name}</strong>
                  <span>
                    Original host: {selectedGuest.hostName}. Host or admin authorization required.
                  </span>
                </div>
                <label htmlFor="host-search">Select authorizing Senior Member</label>
                <input
                  id="host-search"
                  className="public-flow-search"
                  value={hostQuery}
                  onChange={(event) => setHostQuery(event.target.value)}
                  placeholder="Search host or admin name or CAPID"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && seniorMembers.length === 1) {
                      event.preventDefault();
                      event.stopPropagation();
                      setSelectedHost(seniorMembers[0]);
                      setStep(2);
                    }
                  }}
                />
                {error && <div className="public-flow-error">{error}</div>}
                <div className="public-member-results">
                  {seniorMembers.map((member) => (
                    <button
                      type="button"
                      key={member.id}
                      className={`public-member-result ${selectedHost?.id === member.id ? 'selected' : ''}`}
                      onClick={() => setSelectedHost(member)}
                    >
                      <span className="public-member-avatar">
                        {member.name
                          .split(' ')
                          .map((part) => part[0])
                          .join('')
                          .slice(0, 2)}
                      </span>
                      <span>
                        <strong>{member.name}</strong>
                        <small>
                          {member.grade} — CAPID {member.capid}
                          {ADMIN_CAPIDS.has(String(member.capidRaw || member.capid || member.id))
                            ? ' — Admin'
                            : ''}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="public-flow-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setStep(0)}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn btn-blue"
                    onClick={continueFromHost}
                    disabled={!selectedHost && seniorMembers.length !== 1}
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === 2 && selectedHost && (
              <div className="public-flow-section pin-section">
                <div className="public-selected-member">
                  <strong>{selectedHost.name}</strong>
                  <span>Enter PIN to authorize sign-out</span>
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
                  <button type="button" className="btn btn-outline" onClick={() => setStep(1)}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn btn-blue"
                    onClick={verifyHostPin}
                    disabled={pin.length !== 4}
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === 3 && selectedGuest && selectedHost && (
              <div className="public-flow-section">
                <div className="public-confirm-card guest-out">
                  <span className="public-member-avatar large">{selectedGuest.name.slice(0, 1).toUpperCase()}</span>
                  <h2>{selectedGuest.name}</h2>
                  <p>Signing out — hosted by {selectedGuest.hostName}</p>
                  <dl>
                    <dt>Signed in</dt>
                    <dd>{formatTime(selectedGuest.checkInTime)}</dd>
                    <dt>Authorized by</dt>
                    <dd>{selectedHost.name}</dd>
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
                <button type="button" className="public-cancel-button" onClick={reset}>
                  Cancel
                </button>
              </div>
            )}

            {step === 4 && (
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
