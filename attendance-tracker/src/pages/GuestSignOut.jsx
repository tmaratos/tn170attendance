import { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KioskShell, KioskFlowTopBar } from '../components/kiosk/KioskChrome';
import {
  KioskStepHeader,
  KioskMemberResultCard,
  KioskStateMessage,
  KioskSuccessScreen,
} from '../components/kiosk/KioskFlow';
import Icon from '../components/kiosk/icons';
import { formatTime, getInitials } from '../data/mockData';
import { getCallableError } from '../services/errors';
import { formatEastern } from '../hooks/useEasternClock';

const STEPS = ['Find you', 'Confirm', 'Done'];

export default function GuestSignOut({ attendance }) {
  const { guests, recurringGuests, checkOutGuest, settings, syncState } = attendance;
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [guestQuery, setGuestQuery] = useState('');
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successTime, setSuccessTime] = useState(null);

  const presentGuests = useMemo(
    () => (guests || []).filter((g) => g.status === 'checked-in'),
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
    return (recurringGuests || [])
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

  const confirmGuestSignOut = async () => {
    if (!selectedGuest || loading) return;
    setLoading(true);
    setError('');
    try {
      await checkOutGuest(selectedGuest.id);
      setSuccessTime(new Date().toISOString());
      setStep(2);
    } catch (err) {
      setError(getCallableError(err) || err.message || 'Guest sign-out could not be completed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFlowEnter = (event) => {
    if (event.key !== 'Enter') return;
    if (event.target.closest?.('button,a')) return;
    event.preventDefault();
    if (step === 1 && !loading) confirmGuestSignOut();
  };

  return (
    <KioskShell settings={settings} syncState={syncState || 'connected'} header={false}>
      <div className="k-flow" onKeyDown={handleFlowEnter}>
        <KioskFlowTopBar />
        <section className="k-flow-card">
          <span className="k-flow-eyebrow">Guest sign out</span>
          <h1 className="k-flow-title">Thanks for visiting — sign out here</h1>

          {step !== 2 && <KioskStepHeader steps={STEPS} current={step} />}

          {/* Step 0 — find */}
          {step === 0 && (
            <div>
              <label className="k-label" htmlFor="guest-search">Find your name</label>
              <p className="k-hint">Tap your name from the list of guests signed in tonight.</p>
              <input
                id="guest-search"
                className="k-input"
                value={guestQuery}
                onChange={(event) => { setGuestQuery(event.target.value); setSelectedGuest(null); setError(''); }}
                autoFocus
                autoComplete="off"
                placeholder="Search signed-in guests"
              />
              <div className="k-results">
                {matchingPresent.map((guest) => (
                  <KioskMemberResultCard
                    key={guest.id}
                    title={guest.name}
                    subtitle={`Host: ${guest.hostName || '—'} · in since ${formatTime(guest.checkInTime)}`}
                    initials={getInitials(guest.name)}
                    selected={selectedGuest?.id === guest.id}
                    onSelect={() => selectGuest(guest)}
                  />
                ))}
                {matchingPresent.length === 0 && !guestQuery.trim() && (
                  <KioskStateMessage type="info">No guests are currently signed in.</KioskStateMessage>
                )}
                {matchingPresent.length === 0 && guestQuery.trim() && matchingRecurring.length === 0 && (
                  <KioskStateMessage type="info">No signed-in guest matches that name.</KioskStateMessage>
                )}
                {matchingRecurring.length > 0 && (
                  <>
                    <p className="k-hint" style={{ marginTop: '0.5rem', marginBottom: 0 }}>Not signed in tonight:</p>
                    {matchingRecurring.map((guest) => (
                      <KioskMemberResultCard
                        key={guest.id}
                        title={guest.name}
                        subtitle="Not checked in — use Guest Sign In first"
                        initials={getInitials(guest.name)}
                        disabled
                      />
                    ))}
                  </>
                )}
              </div>
              <p className="k-hint" style={{ textAlign: 'center', marginTop: '1rem', marginBottom: 0 }}>
                Need to sign in? <Link className="k-inline-link" to="/guest-sign-in">Guest sign in</Link>
              </p>
            </div>
          )}

          {/* Step 1 — confirm */}
          {step === 1 && selectedGuest && (
            <div className="k-confirm">
              <span className="k-avatar lg" aria-hidden="true">{getInitials(selectedGuest.name)}</span>
              <h2>{selectedGuest.name}</h2>
              <p>Sign this guest out?</p>
              <dl className="k-dl">
                <dt>Host</dt>
                <dd>{selectedGuest.hostName || '—'}</dd>
                <dt>Signed in</dt>
                <dd>{formatTime(selectedGuest.checkInTime)}</dd>
              </dl>
              {error && <KioskStateMessage type="error">{error}</KioskStateMessage>}
              <div className="k-btn-row">
                <button type="button" className="k-btn k-btn-outline" onClick={() => setStep(0)} disabled={loading}>Back</button>
                <button type="button" className="k-btn k-btn-navy" onClick={confirmGuestSignOut} disabled={loading}>
                  {loading ? <><span className="k-spin" /> Signing out…</> : <><Icon name="check" size={20} /> Confirm sign out</>}
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — success */}
          {step === 2 && (
            <KioskSuccessScreen
              title="You’re signed out. Safe travels!"
              name={selectedGuest?.name}
              meta={formatEastern(successTime || new Date().toISOString())}
            />
          )}
        </section>
      </div>
    </KioskShell>
  );
}
