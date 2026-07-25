import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { KioskShell, KioskFlowTopBar } from '../components/kiosk/KioskChrome';
import KioskPinPad from '../components/kiosk/KioskPinPad';
import { KioskStepHeader, KioskStateMessage } from '../components/kiosk/KioskFlow';
import Icon from '../components/kiosk/icons';
import { getInitials } from '../data/mockData';
import { getCallableError } from '../services/errors';

const STEPS = ['Identify', 'PIN'];

export default function AdminLogin({ attendance, onLogin }) {
  const [step, setStep] = useState(0);
  const [selectedAdminId, setSelectedAdminId] = useState('');
  const [capid, setCapid] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { settings, syncState } = attendance;

  // Worker/cloud mode has no public roster, so seniors sign in by CAPID + PIN and the
  // client cannot (and must not) resolve a name from a CAPID — doing so would leak PII
  // to the public kiosk. Local mode picks a known admin from the in-memory roster.
  const needsCapid = attendance.isCloudBackend || attendance.isApiMode;
  const isKioskMode = attendance.isKioskMode;
  const adminMembers = attendance.adminMembers || [];

  const selectedAdmin = useMemo(
    () => adminMembers.find((member) => String(member.id) === String(selectedAdminId)),
    [adminMembers, selectedAdminId]
  );

  const adminNeedsPinSetup =
    !needsCapid && selectedAdmin && attendance.needsPinSetup?.(selectedAdmin.id);

  const canIdentify = needsCapid ? Boolean(capid.trim()) : Boolean(selectedAdminId);

  const goToPin = () => {
    if (!canIdentify) return;
    setError('');
    setPin('');
    setConfirmPin('');
    setStep(1);
  };

  const backToIdentify = () => {
    setError('');
    setPin('');
    setConfirmPin('');
    setShowForgotHelp(false);
    setStep(0);
  };

  const submitDisabled =
    loading ||
    pin.length !== 4 ||
    (adminNeedsPinSetup && confirmPin.length !== 4);

  const submit = async () => {
    if (submitDisabled) return;

    if (adminNeedsPinSetup) {
      if (confirmPin.length !== 4) {
        setError('Re-enter your new 4-digit PIN to confirm it.');
        return;
      }
      if (pin !== confirmPin) {
        setPin('');
        setConfirmPin('');
        setError('Those PINs did not match. Try again.');
        return;
      }
    }

    setLoading(true);
    setError('');
    try {
      if (adminNeedsPinSetup) {
        await attendance.createMemberPin?.(selectedAdmin.id, pin, confirmPin);
      }

      if (isKioskMode && attendance.authenticateKioskAdmin) {
        await attendance.authenticateKioskAdmin(needsCapid ? capid.trim() : selectedAdminId, pin);
      } else if (needsCapid) {
        const ok = await attendance.verifyAdminPin(capid.trim(), pin);
        if (!ok) {
          setPin('');
          setConfirmPin('');
          setError('That admin PIN was not accepted.');
          return;
        }
      } else {
        const ok = await attendance.verifyAdminPin(selectedAdminId, pin);
        if (!ok) {
          setPin('');
          setConfirmPin('');
          setError(
            isKioskMode
              ? 'PIN not accepted. Use your personal kiosk PIN or the emergency admin PIN from settings.'
              : 'That admin PIN was not accepted.'
          );
          return;
        }
      }
      onLogin();
      navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      setPin('');
      setConfirmPin('');
      setError(getCallableError(err) || err.message || 'Administrative login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnter = (event) => {
    if (event.key !== 'Enter') return;
    if (event.target.closest?.('button,a')) return;
    event.preventDefault();
    if (step === 0) { goToPin(); return; }
    submit();
  };

  const pinLabel = adminNeedsPinSetup
    ? 'Create your 4-digit PIN'
    : needsCapid
      ? 'Enter your senior member PIN'
      : 'Enter your personal kiosk PIN';

  return (
    <KioskShell settings={settings} syncState={syncState || 'connected'} header={false}>
      <div className="k-flow" onKeyDown={handleEnter}>
        <KioskFlowTopBar />
        <section className="k-flow-card">
          <span className="k-flow-eyebrow">Senior member</span>
          <h1 className="k-flow-title">Administrative login</h1>
          <p className="k-hint" style={{ marginTop: '0.25rem' }}>
            Senior member tools are protected from public kiosk use.
          </p>

          <KioskStepHeader steps={STEPS} current={step} />

          {/* Step 1 — identify */}
          {step === 0 && (
            <div>
              {needsCapid ? (
                <div className="k-field">
                  <label className="k-label" htmlFor="admin-capid">Your CAPID</label>
                  <p className="k-hint">Enter your senior member CAPID to continue.</p>
                  <input
                    id="admin-capid"
                    className="k-input"
                    value={capid}
                    onChange={(event) => { setCapid(event.target.value); setError(''); }}
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    placeholder="Senior member CAPID"
                  />
                </div>
              ) : (
                <div className="k-field">
                  <label className="k-label" htmlFor="admin-select">Select your name</label>
                  <select
                    id="admin-select"
                    className="k-input"
                    value={selectedAdminId}
                    onChange={(event) => { setSelectedAdminId(event.target.value); setError(''); }}
                    autoFocus
                  >
                    <option value="">Choose your name…</option>
                    {adminMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} — {member.grade} — CAPID {member.capid}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="k-btn-row">
                <button type="button" className="k-btn k-btn-navy" onClick={goToPin} aria-disabled={!canIdentify} disabled={!canIdentify}>
                  Continue <Icon name="arrow" size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — resolved identity + PIN */}
          {step === 1 && (
            <div>
              <div className="k-result selected" style={{ cursor: 'default', marginBottom: '1.25rem' }}>
                <span className="k-avatar" aria-hidden="true">
                  {needsCapid ? <Icon name="admin" size={22} /> : getInitials(selectedAdmin?.name || 'Senior')}
                </span>
                <span className="k-result-body">
                  <strong>{needsCapid ? 'Senior member' : selectedAdmin?.name}</strong>
                  <small>
                    {needsCapid
                      ? `CAPID ${capid.trim()}`
                      : `${selectedAdmin?.grade} · CAPID ${selectedAdmin?.capid}`}
                  </small>
                </span>
              </div>

              {adminNeedsPinSetup && (
                <KioskStateMessage type="info">
                  No PIN set yet. Create your 4-digit PIN below — you’ll use it for check-in,
                  check-out, and admin login on any kiosk device.
                </KioskStateMessage>
              )}

              {error && <KioskStateMessage type="error">{error}</KioskStateMessage>}

              <h2 className="k-label" style={{ fontSize: '1.1rem', textAlign: 'center' }}>{pinLabel}</h2>
              <KioskPinPad value={pin} onChange={(next) => { setError(''); setPin(next); }} disabled={loading} label="PIN" />

              {adminNeedsPinSetup && pin.length === 4 && (
                <>
                  <h2 className="k-label" style={{ fontSize: '1.1rem', textAlign: 'center', marginTop: '1.5rem' }}>Confirm your PIN</h2>
                  <KioskPinPad value={confirmPin} onChange={(next) => { setError(''); setConfirmPin(next); }} disabled={loading} label="Confirm PIN" />
                </>
              )}

              {isKioskMode && !adminNeedsPinSetup && (
                <button
                  type="button"
                  className="k-btn k-btn-ghost"
                  onClick={() => setShowForgotHelp((current) => !current)}
                  aria-expanded={showForgotHelp}
                >
                  Forgot your PIN?
                </button>
              )}

              {showForgotHelp && (
                <div className="k-state info" role="region" aria-label="PIN help" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                  <p style={{ fontWeight: 700 }}>If you forgot your PIN:</p>
                  <ul style={{ margin: '0.5rem 0 0 1.1rem', display: 'grid', gap: '0.4rem' }}>
                    <li>Ask another admin to reset your PIN in Admin Tools — then create a new one at check-in or admin login.</li>
                    <li>Or go to <Link className="k-inline-link" to="/check-in">Check In</Link>, select your name, and create a new PIN if an admin has reset yours.</li>
                    <li>Emergency access: use the shared admin PIN from Settings only if configured for your squadron.</li>
                  </ul>
                </div>
              )}

              <div className="k-btn-row">
                <button type="button" className="k-btn k-btn-outline" onClick={backToIdentify} disabled={loading}>Back</button>
                <button type="button" className="k-btn k-btn-navy" onClick={submit} disabled={submitDisabled}>
                  {loading
                    ? <><span className="k-spin" /> Checking…</>
                    : <><Icon name="admin" size={20} /> {adminNeedsPinSetup ? 'Create PIN & open dashboard' : 'Open admin dashboard'}</>}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </KioskShell>
  );
}
