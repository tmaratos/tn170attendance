import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '../data/mockData';
import { getCallableError } from '../services/errors';
import { useLocalTime } from '../hooks/useLocalTime';
import {
  formatGuestPhone,
  isValidGuestEmail,
  isValidGuestPhone,
} from '../services/guestService';

const STEPS = ['Guest', 'Confirm', 'Success'];

export default function OpenHouseSignIn({ attendance }) {
  const { checkInOpenHouseGuest } = attendance;
  const [step, setStep] = useState(0);
  const [guestName, setGuestName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [visitReason, setVisitReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successTime, setSuccessTime] = useState(null);
  const { dateStr, shortTimeStr } = useLocalTime();

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
    const nextErrors = {};
    if (!guestName.trim()) {
      nextErrors.name = 'Name is required.';
    }
    if (!email.trim()) {
      nextErrors.email = 'Email is required.';
    } else if (!isValidGuestEmail(email)) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (!phone.trim()) {
      nextErrors.phone = 'Phone number is required.';
    } else if (!isValidGuestPhone(phone)) {
      nextErrors.phone = 'Enter a valid 10-digit phone number.';
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const canContinue = guestName.trim()
    && email.trim()
    && phone.trim()
    && isValidGuestEmail(email)
    && isValidGuestPhone(phone);

  const confirmSignIn = async () => {
    if (!canContinue) return;
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
      setError(getCallableError(err) || 'Open house sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const goToConfirm = () => {
    if (!validateStepZero()) return;
    setError('');
    setStep(1);
  };

  const handleFlowEnter = (event) => {
    if (event.key !== 'Enter') return;
    if (event.target.closest?.('button,a,textarea')) return;
    event.preventDefault();

    if (step === 0 && canContinue) {
      goToConfirm();
      return;
    }
    if (step === 1 && !loading) {
      confirmSignIn();
    }
  };

  return (
    <div className="public-flow-page guest-flow open-house-flow" onKeyDown={handleFlowEnter}>
      <div className="public-flow-body">
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
              <span>OPEN HOUSE</span>
              <h1>Guest sign-in</h1>
              <p className="open-house-subtitle">No host required — welcome, visitors!</p>
            </div>

            <div className="public-flow-steps open-house-steps">
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
              <div className="public-flow-section open-house-form">
                <label htmlFor="open-house-guest-name">Your name</label>
                <input
                  id="open-house-guest-name"
                  className={`public-flow-search${fieldErrors.name ? ' invalid' : ''}`}
                  value={guestName}
                  onChange={(event) => {
                    setGuestName(event.target.value);
                    if (fieldErrors.name) {
                      setFieldErrors((prev) => ({ ...prev, name: undefined }));
                    }
                  }}
                  autoFocus
                  autoComplete="name"
                  placeholder="First and last name"
                />
                {fieldErrors.name && <p className="public-flow-field-error">{fieldErrors.name}</p>}

                <label htmlFor="open-house-email">Email</label>
                <input
                  id="open-house-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className={`public-flow-search${fieldErrors.email ? ' invalid' : ''}`}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (fieldErrors.email) {
                      setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }
                  }}
                  placeholder="you@example.com"
                />
                {fieldErrors.email && <p className="public-flow-field-error">{fieldErrors.email}</p>}

                <label htmlFor="open-house-phone">Phone number</label>
                <input
                  id="open-house-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  className={`public-flow-search${fieldErrors.phone ? ' invalid' : ''}`}
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    if (fieldErrors.phone) {
                      setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                    }
                  }}
                  placeholder="(555) 555-5555"
                />
                {fieldErrors.phone && <p className="public-flow-field-error">{fieldErrors.phone}</p>}

                <label htmlFor="open-house-reason">Organization or reason for visit (optional)</label>
                <input
                  id="open-house-reason"
                  className="public-flow-search"
                  value={visitReason}
                  onChange={(event) => setVisitReason(event.target.value)}
                  placeholder="e.g. Prospective cadet, community partner"
                />
                <button
                  type="button"
                  className="public-confirm-button open-house"
                  onClick={goToConfirm}
                  disabled={!canContinue}
                >
                  Continue
                </button>
                <p className="public-flow-alt-link">
                  Need a host?{' '}
                  <Link to="/guest-sign-in">Use regular Guest Sign In</Link>
                </p>
              </div>
            )}

            {step === 1 && (
              <div className="public-flow-section">
                <div className="public-confirm-card open-house">
                  <span className="public-member-avatar large">{guestName.slice(0, 1).toUpperCase()}</span>
                  <h2>{guestName}</h2>
                  <p>Open House visitor</p>
                  {visitReason.trim() && <p className="open-house-reason-display">{visitReason.trim()}</p>}
                  <dl>
                    <dt>Email</dt>
                    <dd>{email.trim()}</dd>
                    <dt>Phone</dt>
                    <dd>{formatGuestPhone(phone)}</dd>
                    <dt>Date</dt>
                    <dd>{new Date().toLocaleDateString('en-US')}</dd>
                    <dt>Time</dt>
                    <dd>{new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</dd>
                  </dl>
                </div>
                {error && <div className="public-flow-error">{error}</div>}
                <button
                  type="button"
                  className="public-confirm-button open-house"
                  onClick={confirmSignIn}
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'CONFIRM SIGN IN'}
                </button>
                <div className="public-flow-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setStep(0)}>Back</button>
                  <button type="button" className="public-cancel-button inline" onClick={reset}>Cancel</button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="public-success-screen">
                <div className="public-success-icon open-house">
                  <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </div>
                <h2>WELCOME!</h2>
                <strong>{guestName}</strong>
                <span>{successTime ? formatDateTime(successTime) : formatDateTime(new Date().toISOString())}</span>
                <Link to="/" className="btn btn-blue btn-lg">Return Home</Link>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
