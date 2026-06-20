import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '../data/mockData';
import { getCallableError } from '../services/errors';
import { useLocalTime } from '../hooks/useLocalTime';

const STEPS = ['Guest', 'Confirm', 'Success'];

export default function OpenHouseSignIn({ attendance }) {
  const { checkInOpenHouseGuest } = attendance;
  const [step, setStep] = useState(0);
  const [guestName, setGuestName] = useState('');
  const [visitReason, setVisitReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successTime, setSuccessTime] = useState(null);
  const { dateStr, shortTimeStr } = useLocalTime();

  const reset = () => {
    setStep(0);
    setGuestName('');
    setVisitReason('');
    setError('');
    setLoading(false);
    setSuccessTime(null);
  };

  const confirmSignIn = async () => {
    if (!guestName.trim()) return;
    setLoading(true);
    setError('');

    try {
      await checkInOpenHouseGuest({
        name: guestName.trim(),
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

  const handleFlowEnter = (event) => {
    if (event.key !== 'Enter') return;
    if (event.target.closest?.('button,a,textarea')) return;
    event.preventDefault();

    if (step === 0 && guestName.trim()) {
      setStep(1);
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
              <div className="public-flow-section">
                <label htmlFor="open-house-guest-name">Your name</label>
                <input
                  id="open-house-guest-name"
                  className="public-flow-search"
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  autoFocus
                  placeholder="First and last name"
                />
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
                  onClick={() => setStep(1)}
                  disabled={!guestName.trim()}
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
