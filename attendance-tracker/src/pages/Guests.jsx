import { useState, useMemo } from 'react';
import PinPad from '../components/PinPad';
import { formatTime, formatDateTime } from '../data/mockData';

const STEPS = ['Guest', 'Host', 'PIN', 'Confirm', 'Done'];

export default function Guests({ attendance }) {
  const {
    members,
    guests,
    recurringGuests,
    checkInGuest,
    checkOutGuest,
    verifyPin,
    isFirebase,
  } = attendance;

  const [step, setStep] = useState(0);
  const [guestName, setGuestName] = useState('');
  const [selectedHost, setSelectedHost] = useState(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [mode, setMode] = useState('sign-in');
  const [signOutGuest, setSignOutGuest] = useState(null);
  const [signOutPin, setSignOutPin] = useState('');
  const [signOutCapid, setSignOutCapid] = useState('');
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [timestamp, setTimestamp] = useState(null);
  const [loading, setLoading] = useState(false);

  const seniorMembers = useMemo(
    () => members.filter((m) => m.role === 'Senior Member'),
    [members]
  );

  const presentGuests = guests.filter((g) => g.status === 'checked-in');

  const matchingRecurring = useMemo(() => {
    if (!guestName.trim()) return [];
    const q = guestName.toLowerCase();
    return recurringGuests.filter((g) => g.name.toLowerCase().includes(q));
  }, [guestName, recurringGuests]);

  const resetSignIn = () => {
    setStep(0);
    setGuestName('');
    setSelectedHost(null);
    setPin('');
    setPinError('');
    setTimestamp(null);
    setMode('sign-in');
  };

  const handleSignIn = async () => {
    try {
      if (attendance.isFirebase) {
        await checkInGuest({
          name: guestName.trim(),
          hostId: selectedHost.id,
          hostCapid: selectedHost.capidRaw || selectedHost.id,
          hostName: selectedHost.name,
          hostPin: pin,
          guestId: matchingRecurring.find((g) => g.name.toLowerCase() === guestName.trim().toLowerCase())?.guestId,
        });
      } else {
        checkInGuest({
          name: guestName.trim(),
          hostId: selectedHost.id,
          hostName: selectedHost.name,
        });
      }
      setTimestamp(new Date().toISOString());
      setStep(4);
    } catch (err) {
      setPinError(err.message || 'Guest sign-in failed.');
      setStep(2);
    }
  };

  const handleSignOut = async (guest) => {
    if (attendance.isFirebase) {
      setSignOutGuest(guest);
      setSignOutPin('');
      setSignOutCapid('');
      setPinError('');
      return;
    }
    try {
      await checkOutGuest(guest.id);
      setSelectedGuest(guest);
      setTimestamp(new Date().toISOString());
      setMode('sign-out-done');
    } catch (err) {
      setPinError(err.message || 'Guest sign-out failed.');
    }
  };

  const confirmGuestSignOut = async () => {
    if (!signOutGuest || signOutPin.length !== 4 || !signOutCapid.trim()) return;
    setLoading(true);
    setPinError('');
    try {
      await checkOutGuest(signOutGuest.id, signOutCapid.trim(), signOutPin);
      setSelectedGuest(signOutGuest);
      setTimestamp(new Date().toISOString());
      setSignOutGuest(null);
      setMode('sign-out-done');
    } catch (err) {
      setPinError(err.message || 'Guest sign-out failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Guest Sign-In</h1>
      <p className="page-subtitle">Register guests visiting tonight&apos;s meeting</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title text-gold">Guests Present ({presentGuests.length})</h3>
          </div>
          {presentGuests.length === 0 ? (
            <div className="empty-state">No guests currently signed in</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Host</th>
                  <th>Time</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {presentGuests.map((g) => (
                  <tr key={g.id}>
                    <td>{g.name}</td>
                    <td>{g.hostName}</td>
                    <td>{formatTime(g.checkInTime)}</td>
                    <td>
                      <button
                        className="btn btn-red btn-lg guest-sign-out-btn"
                        onClick={() => handleSignOut(g)}
                      >
                        Sign Out
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">Recurring Guests</h3>
          </div>
          {recurringGuests.length === 0 ? (
            <div className="empty-state">No recurring guest records yet</div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Host</th>
                    <th>Visits</th>
                    <th>Last Visit</th>
                  </tr>
                </thead>
                <tbody>
                  {recurringGuests.map((g) => (
                    <tr key={g.id}>
                      <td>{g.name}</td>
                      <td>{g.hostName}</td>
                      <td>{g.totalVisits}</td>
                      <td>{g.lastVisit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {mode === 'sign-out-done' ? (
        <div className="kiosk-panel">
          <div className="success-screen">
            <div className="success-icon out">✗</div>
            <div className="success-title out">GUEST SIGNED OUT</div>
            <div className="confirm-name">{selectedGuest?.name}</div>
            <div className="success-time">{timestamp && formatTime(timestamp)}</div>
            <button className="btn btn-blue btn-lg" onClick={resetSignIn}>Done</button>
          </div>
        </div>
      ) : (
        <div className="kiosk-panel">
          <h2 className="kiosk-title">Guest Sign-In Workflow</h2>
          <p className="kiosk-subtitle">Search for an existing guest or enter a new name</p>

          <div className="wizard-steps">
            {STEPS.map((label, i) => (
              <div key={label} className={`wizard-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
                <span className="wizard-step-num">{i + 1}</span>
                {label}
              </div>
            ))}
          </div>

          <div className="wizard-content">
            {step === 0 && (
              <div>
                <div className="search-box">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Enter guest name..."
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    autoFocus
                  />
                </div>
                {matchingRecurring.length > 0 && (
                  <div className="member-results">
                    {matchingRecurring.map((g) => (
                      <div
                        key={g.id}
                        className="member-result"
                        onClick={() => { setGuestName(g.name); setSelectedHost(seniorMembers.find((m) => m.id === g.hostId) || null); }}
                      >
                        <div>
                          <div className="member-result-name">{g.name}</div>
                          <div className="member-result-meta">Host: {g.hostName} • {g.totalVisits} visits</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="wizard-nav">
                  <button className="btn btn-blue" onClick={() => setStep(1)} disabled={!guestName.trim()}>
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <p style={{ textAlign: 'center', marginBottom: 16, color: 'rgba(255,255,255,0.7)' }}>
                  Select host Senior Member for {guestName}
                </p>
                <div className="member-results">
                  {seniorMembers.map((m) => (
                    <div
                      key={m.id}
                      className={`member-result ${selectedHost?.id === m.id ? 'selected' : ''}`}
                      onClick={() => setSelectedHost(m)}
                    >
                      <div>
                        <div className="member-result-name">{m.name}</div>
                        <div className="member-result-meta">{m.grade} • CAPID {m.capid}</div>
                      </div>
                      {selectedHost?.id === m.id && <span>✓</span>}
                    </div>
                  ))}
                </div>
                <div className="wizard-nav">
                  <button className="btn btn-outline" onClick={() => setStep(0)}>Back</button>
                  <button className="btn btn-blue" onClick={() => setStep(2)} disabled={!selectedHost}>Continue</button>
                </div>
              </div>
            )}

            {step === 2 && selectedHost && (
              <div>
                <p style={{ textAlign: 'center', marginBottom: 16, color: 'rgba(255,255,255,0.7)' }}>
                  Host {selectedHost.name} — enter your PIN to authorize
                </p>
                {pinError && <div className="pin-error">{pinError}</div>}
                <PinPad
                  pin={pin}
                  onDigit={(d) => { setPinError(''); setPin((p) => p + d); }}
                  onBackspace={() => setPin((p) => p.slice(0, -1))}
                  onClear={() => { setPin(''); setPinError(''); }}
                />
                <div className="wizard-nav">
                  <button className="btn btn-outline" onClick={() => setStep(1)}>Back</button>
                  <button
                    className="btn btn-blue"
                    onClick={() => {
                      if (pin.length === 4) {
                        if (isFirebase) setStep(3);
                        else if (verifyPin(selectedHost.id, pin)) setStep(3);
                        else { setPinError('Incorrect PIN.'); setPin(''); }
                      }
                    }}
                    disabled={pin.length !== 4}
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <div className="confirm-member">
                  <div className="confirm-name">{guestName}</div>
                  <div className="confirm-meta">Hosted by {selectedHost.name}</div>
                </div>
                <div className="confirm-actions">
                  <button className="btn btn-lg btn-block btn-gold" onClick={handleSignIn}>
                    SIGN IN GUEST
                  </button>
                  <button className="btn btn-outline btn-block" onClick={resetSignIn}>Cancel</button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="success-screen">
                <div className="success-icon in">★</div>
                <div className="success-title in">GUEST SIGNED IN!</div>
                <div className="confirm-name">{guestName}</div>
                <div className="success-time">{timestamp && formatDateTime(timestamp)}</div>
                <button className="btn btn-blue btn-lg" onClick={resetSignIn}>Done</button>
              </div>
            )}
          </div>
        </div>
      )}

      {signOutGuest && (
        <div className="pin-modal-backdrop" role="presentation">
          <div className="pin-modal" role="dialog" aria-modal="true">
            <div className="pin-modal-header">
              <div>
                <p>Sign Out Guest</p>
                <h3>{signOutGuest.name}</h3>
                <span>Host or admin CAPID + PIN required</span>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <input
                type="text"
                className="form-input form-input-lg"
                placeholder="Your CAPID"
                value={signOutCapid}
                onChange={(e) => setSignOutCapid(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            {pinError && <div className="pin-error">{pinError}</div>}
            <PinPad
              pin={signOutPin}
              onDigit={(d) => { setPinError(''); setSignOutPin((p) => p + d); }}
              onBackspace={() => setSignOutPin((p) => p.slice(0, -1))}
              onClear={() => { setSignOutPin(''); setPinError(''); }}
            />
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-red"
                disabled={loading || signOutPin.length !== 4 || !signOutCapid.trim()}
                onClick={confirmGuestSignOut}
              >
                {loading ? 'Signing out...' : 'Sign Out Guest'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => { setSignOutGuest(null); setPinError(''); }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
