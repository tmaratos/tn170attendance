import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KioskShell, KioskFlowTopBar } from '../components/kiosk/KioskChrome';
import KioskPinPad from '../components/kiosk/KioskPinPad';
import {
  KioskStepHeader,
  KioskMemberResultCard,
  KioskStateMessage,
  KioskSuccessScreen,
} from '../components/kiosk/KioskFlow';
import Icon from '../components/kiosk/icons';
import { getInitials } from '../data/mockData';
import { getCallableError } from '../services/errors';
import { formatEastern } from '../hooks/useEasternClock';

const STEPS = ['Your name', 'Host', 'Host PIN', 'Confirm', 'Done'];

export default function GuestSignIn({ attendance }) {
  const { members, recurringGuests, checkInGuest, verifyPin, isFirebase, settings, syncState } = attendance;
  const [step, setStep] = useState(0);
  const [guestName, setGuestName] = useState('');
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [selectedHost, setSelectedHost] = useState(null);
  const [hostQuery, setHostQuery] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successTime, setSuccessTime] = useState(null);

  const matchingGuests = useMemo(() => {
    if (!guestName.trim()) return [];
    const query = guestName.toLowerCase();
    return (recurringGuests || []).filter((guest) => guest.name.toLowerCase().includes(query)).slice(0, 6);
  }, [guestName, recurringGuests]);

  const seniorMembers = useMemo(() => {
    const query = hostQuery.toLowerCase().trim();
    return (members || [])
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
      setError('That host PIN was not correct. Please try again.');
      return;
    }
    setError('');
    setStep(3);
  };

  const confirmGuestSignIn = async () => {
    if (!guestName.trim() || !selectedHost || loading) return;
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
      setError(getCallableError(err) || 'Guest sign-in could not be completed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const continueFromHost = () => {
    if (selectedHost) {
      setStep(2);
      return;
    }
    if (seniorMembers.length === 1) {
      setSelectedHost(seniorMembers[0]);
      setStep(2);
    }
  };

  const handleFlowEnter = (event) => {
    if (event.key !== 'Enter') return;
    if (event.target.closest?.('button,a')) return;
    event.preventDefault();
    if (step === 0 && guestName.trim()) { setStep(1); return; }
    if (step === 1) { continueFromHost(); return; }
    if (step === 2 && pin.length === 4) { verifyHostPin(); return; }
    if (step === 3 && !loading) { confirmGuestSignIn(); }
  };

  return (
    <KioskShell settings={settings} syncState={syncState || 'connected'} header={false}>
      <div className="k-flow" onKeyDown={handleFlowEnter}>
        <KioskFlowTopBar />
        <section className="k-flow-card">
          <span className="k-flow-eyebrow">Guest sign in</span>
          <h1 className="k-flow-title">Welcome — let’s get you signed in</h1>

          {step !== 4 && <KioskStepHeader steps={STEPS} current={step} />}

          {/* Step 0 — guest name */}
          {step === 0 && (
            <div>
              <label className="k-label" htmlFor="guest-name">Your name</label>
              <p className="k-hint">Type your name. If you’ve visited before, tap your record to reuse it.</p>
              <input
                id="guest-name"
                className="k-input"
                value={guestName}
                onChange={(event) => { setGuestName(event.target.value); setSelectedGuest(null); }}
                autoFocus
                autoComplete="off"
                placeholder="First and last name"
              />
              <div className="k-results">
                {matchingGuests.map((guest) => (
                  <KioskMemberResultCard
                    key={guest.id}
                    title={guest.name}
                    subtitle={`Hosted by ${guest.hostName || 'a senior member'} · ${guest.totalVisits || 0} visits`}
                    initials={getInitials(guest.name)}
                    selected={selectedGuest?.id === guest.id}
                    onSelect={() => { setSelectedGuest(guest); setGuestName(guest.name); }}
                  />
                ))}
              </div>
              <div className="k-btn-row">
                <button type="button" className="k-btn k-btn-gold" onClick={() => guestName.trim() && setStep(1)} disabled={!guestName.trim()}>
                  Continue
                </button>
              </div>
              <p className="k-hint" style={{ textAlign: 'center', marginTop: '1rem', marginBottom: 0 }}>
                Leaving instead? <Link className="k-inline-link" to="/guest-sign-out">Guest sign out</Link>
              </p>
            </div>
          )}

          {/* Step 1 — host */}
          {step === 1 && (
            <div>
              <label className="k-label" htmlFor="host-search">Who is your host?</label>
              <p className="k-hint">Choose the senior member you’re here to see.</p>
              <input
                id="host-search"
                className="k-input"
                value={hostQuery}
                onChange={(event) => setHostQuery(event.target.value)}
                placeholder="Search host name or CAPID"
              />
              <div className="k-results">
                {seniorMembers.map((member) => (
                  <KioskMemberResultCard
                    key={member.id}
                    title={member.name}
                    subtitle={`${member.grade} · CAPID ${member.capid}`}
                    initials={getInitials(member.name)}
                    selected={selectedHost?.id === member.id}
                    onSelect={() => setSelectedHost(member)}
                  />
                ))}
                {hostQuery.trim() && seniorMembers.length === 0 && (
                  <KioskStateMessage type="info">No senior member matches that search.</KioskStateMessage>
                )}
              </div>
              <div className="k-btn-row">
                <button type="button" className="k-btn k-btn-outline" onClick={() => setStep(0)}>Back</button>
                <button type="button" className="k-btn k-btn-gold" onClick={continueFromHost} disabled={!selectedHost && seniorMembers.length !== 1}>
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — host PIN */}
          {step === 2 && selectedHost && (
            <div>
              <div className="k-result selected" style={{ cursor: 'default', marginBottom: '1.25rem' }}>
                <span className="k-avatar" aria-hidden="true">{getInitials(selectedHost.name)}</span>
                <span className="k-result-body">
                  <strong>{selectedHost.name}</strong>
                  <small>Host authorization</small>
                </span>
              </div>
              <h2 className="k-label" style={{ fontSize: '1.15rem', textAlign: 'center' }}>Host’s 4-digit PIN</h2>
              <p className="k-hint" style={{ textAlign: 'center' }}>
                Your host enters their PIN to authorize your visit.
              </p>
              {error && <KioskStateMessage type="error">{error}</KioskStateMessage>}
              <KioskPinPad value={pin} onChange={(next) => { setError(''); setPin(next); }} disabled={loading} label="Host PIN" />
              <div className="k-btn-row">
                <button type="button" className="k-btn k-btn-outline" onClick={() => setStep(1)} disabled={loading}>Back</button>
                <button type="button" className="k-btn k-btn-gold" onClick={verifyHostPin} disabled={pin.length !== 4 || loading}>Continue</button>
              </div>
            </div>
          )}

          {/* Step 3 — confirm */}
          {step === 3 && selectedHost && (
            <div className="k-confirm">
              <span className="k-avatar lg" aria-hidden="true">{getInitials(guestName)}</span>
              <h2>{guestName}</h2>
              <p>Hosted by {selectedHost.name}</p>
              {error && <KioskStateMessage type="error">{error}</KioskStateMessage>}
              <div className="k-btn-row">
                <button type="button" className="k-btn k-btn-outline" onClick={reset} disabled={loading}>Cancel</button>
                <button type="button" className="k-btn k-btn-gold" onClick={confirmGuestSignIn} disabled={loading}>
                  {loading ? <><span className="k-spin" /> Signing in…</> : <><Icon name="check" size={20} /> Confirm sign in</>}
                </button>
              </div>
            </div>
          )}

          {/* Step 4 — success */}
          {step === 4 && (
            <KioskSuccessScreen
              title="Welcome — you’re signed in!"
              name={guestName}
              meta={formatEastern(successTime || new Date().toISOString())}
            />
          )}
        </section>
      </div>
    </KioskShell>
  );
}
