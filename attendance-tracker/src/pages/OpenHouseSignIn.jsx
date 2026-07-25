import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KioskShell, KioskFlowTopBar } from '../components/kiosk/KioskChrome';
import {
  KioskStepHeader,
  KioskStateMessage,
  KioskSuccessScreen,
} from '../components/kiosk/KioskFlow';
import Icon from '../components/kiosk/icons';
import { getInitials } from '../data/mockData';
import { getCallableError } from '../services/errors';
import { formatEastern } from '../hooks/useEasternClock';
import {
  formatGuestPhone,
  isValidGuestEmail,
  isValidGuestPhone,
} from '../services/guestService';

const STEPS = ['Your info', 'Confirm', 'Done'];

function Field({ id, label, error, children }) {
  return (
    <div className="k-field">
      <label className="k-label" htmlFor={id}>{label}</label>
      {children}
      {error && (
        <p className="k-field-error"><Icon name="alert" size={15} /> {error}</p>
      )}
    </div>
  );
}

export default function OpenHouseSignIn({ attendance }) {
  const { checkInOpenHouseGuest, settings, syncState } = attendance;
  const [step, setStep] = useState(0);
  const [guestName, setGuestName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [visitReason, setVisitReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successTime, setSuccessTime] = useState(null);

  const reset = () => {
    setStep(0);
    setGuestName('');
    setEmail('');
    setPhone('');
    setVisitReason('');
    setFieldErrors({});
    setError('');
    setLoading(false);
    setSuccessTime(null);
  };

  const validateStepZero = () => {
    const next = {};
    if (!guestName.trim()) next.name = 'Please enter your name.';
    if (!email.trim()) next.email = 'Please enter your email.';
    else if (!isValidGuestEmail(email)) next.email = 'Enter a valid email address.';
    if (!phone.trim()) next.phone = 'Please enter your phone number.';
    else if (!isValidGuestPhone(phone)) next.phone = 'Enter a valid 10-digit phone number.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const canContinue = guestName.trim() && email.trim() && phone.trim()
    && isValidGuestEmail(email) && isValidGuestPhone(phone);

  const goToConfirm = () => {
    if (!validateStepZero()) return;
    setError('');
    setStep(1);
  };

  const confirmSignIn = async () => {
    if (!canContinue || loading) return;
    setLoading(true);
    setError('');
    try {
      await checkInOpenHouseGuest({
        name: guestName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        visitReason: visitReason.trim() || null,
      });
      setSuccessTime(new Date().toISOString());
      setStep(2);
    } catch (err) {
      setError(getCallableError(err) || 'Open house sign-in could not be completed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFlowEnter = (event) => {
    if (event.key !== 'Enter') return;
    if (event.target.closest?.('button,a,textarea')) return;
    event.preventDefault();
    if (step === 0) { goToConfirm(); return; }
    if (step === 1 && !loading) confirmSignIn();
  };

  const clearErr = (key, setter) => (event) => {
    setter(event.target.value);
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  return (
    <KioskShell settings={settings} syncState={syncState || 'connected'} header={false}>
      <div className="k-flow" onKeyDown={handleFlowEnter}>
        <KioskFlowTopBar />
        <section className="k-flow-card">
          <span className="k-flow-eyebrow">Open house</span>
          <h1 className="k-flow-title">Welcome, visitors!</h1>
          <p className="k-hint" style={{ marginTop: '0.25rem' }}>No host required — just tell us a little about you.</p>

          {step !== 2 && <KioskStepHeader steps={STEPS} current={step} />}

          {/* Step 0 — form */}
          {step === 0 && (
            <div>
              <Field id="oh-name" label="Your name" error={fieldErrors.name}>
                <input
                  id="oh-name"
                  className={`k-input${fieldErrors.name ? ' invalid' : ''}`}
                  value={guestName}
                  onChange={clearErr('name', setGuestName)}
                  autoFocus
                  autoComplete="name"
                  placeholder="First and last name"
                  aria-invalid={Boolean(fieldErrors.name)}
                />
              </Field>
              <Field id="oh-email" label="Email" error={fieldErrors.email}>
                <input
                  id="oh-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className={`k-input${fieldErrors.email ? ' invalid' : ''}`}
                  value={email}
                  onChange={clearErr('email', setEmail)}
                  placeholder="you@example.com"
                  aria-invalid={Boolean(fieldErrors.email)}
                />
              </Field>
              <Field id="oh-phone" label="Phone number" error={fieldErrors.phone}>
                <input
                  id="oh-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  className={`k-input${fieldErrors.phone ? ' invalid' : ''}`}
                  value={phone}
                  onChange={clearErr('phone', setPhone)}
                  placeholder="(555) 555-5555"
                  aria-invalid={Boolean(fieldErrors.phone)}
                />
              </Field>
              <Field id="oh-reason" label="Organization or reason for visit (optional)">
                <input
                  id="oh-reason"
                  className="k-input"
                  value={visitReason}
                  onChange={(event) => setVisitReason(event.target.value)}
                  placeholder="e.g. Prospective cadet, community partner"
                />
              </Field>
              <div className="k-btn-row">
                <button type="button" className="k-btn k-btn-primary" onClick={goToConfirm} aria-disabled={!canContinue}>
                  Continue
                </button>
              </div>
              <p className="k-hint" style={{ textAlign: 'center', marginTop: '1rem', marginBottom: 0 }}>
                Here to see a specific member? <Link className="k-inline-link" to="/guest-sign-in">Use Guest Sign In</Link>
              </p>
            </div>
          )}

          {/* Step 1 — confirm */}
          {step === 1 && (
            <div className="k-confirm">
              <span className="k-avatar lg" aria-hidden="true">{getInitials(guestName)}</span>
              <h2>{guestName}</h2>
              <p>Open house visitor</p>
              {visitReason.trim() && <p className="k-hint" style={{ textAlign: 'center' }}>{visitReason.trim()}</p>}
              <dl className="k-dl">
                <dt>Email</dt>
                <dd>{email.trim()}</dd>
                <dt>Phone</dt>
                <dd>{formatGuestPhone(phone)}</dd>
              </dl>
              {error && <KioskStateMessage type="error">{error}</KioskStateMessage>}
              <div className="k-btn-row">
                <button type="button" className="k-btn k-btn-outline" onClick={() => setStep(0)} disabled={loading}>Back</button>
                <button type="button" className="k-btn k-btn-primary" onClick={confirmSignIn} disabled={loading}>
                  {loading ? <><span className="k-spin" /> Signing in…</> : <><Icon name="check" size={20} /> Confirm sign in</>}
                </button>
              </div>
              <button type="button" className="k-btn k-btn-ghost" onClick={reset} disabled={loading} style={{ marginTop: '0.5rem' }}>
                Start over
              </button>
            </div>
          )}

          {/* Step 2 — success */}
          {step === 2 && (
            <KioskSuccessScreen
              title="Welcome — thanks for visiting!"
              name={guestName}
              meta={formatEastern(successTime || new Date().toISOString())}
            />
          )}
        </section>
      </div>
    </KioskShell>
  );
}
