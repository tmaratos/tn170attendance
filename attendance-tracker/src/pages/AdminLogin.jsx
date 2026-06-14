import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import PinPad from '../components/PinPad';
import { useLocalTime } from '../hooks/useLocalTime';

export default function AdminLogin({ attendance, onLogin }) {
  const [selectedAdminId, setSelectedAdminId] = useState('');
  const [capid, setCapid] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { dateStr, shortTimeStr } = useLocalTime();
  const needsCapid = attendance.isCloudBackend;
  const isKioskMode = attendance.isKioskMode;
  const adminMembers = attendance.adminMembers || [];
  const logoSrc = `${import.meta.env.BASE_URL}squadron-logo.jpeg`;

  const selectedAdmin = useMemo(
    () => adminMembers.find((member) => String(member.id) === String(selectedAdminId)),
    [adminMembers, selectedAdminId]
  );

  const adminNeedsPinSetup =
    !needsCapid && selectedAdmin && attendance.needsPinSetup?.(selectedAdmin.id);

  const submit = async () => {
    if (pin.length !== 4) return;
    if (needsCapid && !capid.trim()) return;
    if (!needsCapid && !selectedAdminId) return;

    if (adminNeedsPinSetup) {
      if (confirmPin.length !== 4) {
        setError('Confirm your new 4-digit PIN.');
        return;
      }
      if (pin !== confirmPin) {
        setPin('');
        setConfirmPin('');
        setError('PINs do not match.');
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      if (adminNeedsPinSetup) {
        await attendance.createMemberPin?.(selectedAdmin.id, pin, confirmPin);
      }

      const ok = needsCapid
        ? await attendance.verifyAdminPin(capid.trim(), pin)
        : await attendance.verifyAdminPin(selectedAdminId, pin);
      if (!ok) {
        setPin('');
        setConfirmPin('');
        setError(
          isKioskMode
            ? 'PIN not accepted. Use your personal kiosk PIN or the emergency admin PIN from settings.'
            : 'Admin PIN was not accepted.'
        );
        return;
      }
      onLogin();
      navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      setPin('');
      setConfirmPin('');
      setError(err.message || 'Admin login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnter = (event) => {
    if (event.key !== 'Enter') return;
    if (event.target.closest?.('button,a')) return;
    event.preventDefault();
    submit();
  };

  const submitDisabled =
    loading ||
    pin.length !== 4 ||
    (needsCapid && !capid.trim()) ||
    (!needsCapid && !selectedAdminId) ||
    (adminNeedsPinSetup && confirmPin.length !== 4);

  return (
    <div className="admin-login-page" onKeyDown={handleEnter}>
      <div className="admin-login-card">
        <Link to="/" className="public-back-link">Home</Link>
        <img src={logoSrc} alt="Oak Ridge Composite Squadron patch" />
        <p>{dateStr}</p>
        <strong>{shortTimeStr}</strong>
        <h1>Admin Login</h1>
        <span>Senior member tools are protected from public kiosk use.</span>

        {needsCapid ? (
          <label className="admin-capid-field" htmlFor="admin-capid">
            CAPID
            <input
              id="admin-capid"
              value={capid}
              onChange={(event) => setCapid(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="Senior member CAPID"
              onKeyDown={handleEnter}
            />
          </label>
        ) : (
          <label className="admin-capid-field" htmlFor="admin-select">
            Select admin
            <select
              id="admin-select"
              className="admin-select-field"
              value={selectedAdminId}
              onChange={(event) => {
                setSelectedAdminId(event.target.value);
                setPin('');
                setConfirmPin('');
                setError('');
                setShowForgotHelp(false);
              }}
            >
              <option value="">Choose your name...</option>
              {adminMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} — {member.grade} — CAPID {member.capid}
                </option>
              ))}
            </select>
          </label>
        )}

        {adminNeedsPinSetup && (
          <div className="admin-pin-notice create">
            No PIN set yet. Create your 4-digit PIN below — you&apos;ll use it for
            check-in, check-out, and admin login on any kiosk device.
          </div>
        )}

        {error && <div className="public-flow-error">{error}</div>}

        <p className="admin-pin-label">
          {adminNeedsPinSetup
            ? 'Create your 4-digit PIN'
            : needsCapid
              ? 'Enter your senior member PIN'
              : 'Enter your personal kiosk PIN'}
        </p>
        <PinPad
          pin={pin}
          onDigit={(digit) => {
            setError('');
            setPin((current) => (current.length < 4 ? `${current}${digit}` : current));
          }}
          onBackspace={() => setPin((current) => current.slice(0, -1))}
          onClear={() => {
            setPin('');
            setError('');
          }}
        />

        {adminNeedsPinSetup && pin.length === 4 && (
          <>
            <p className="admin-pin-label">Confirm your PIN</p>
            <PinPad
              pin={confirmPin}
              onDigit={(digit) => {
                setError('');
                setConfirmPin((current) => (current.length < 4 ? `${current}${digit}` : current));
              }}
              onBackspace={() => setConfirmPin((current) => current.slice(0, -1))}
              onClear={() => setConfirmPin('')}
            />
          </>
        )}

        {isKioskMode && !adminNeedsPinSetup && (
          <button
            type="button"
            className="admin-forgot-pin-link"
            onClick={() => setShowForgotHelp((current) => !current)}
          >
            Forgot your PIN?
          </button>
        )}

        {showForgotHelp && (
          <div className="admin-forgot-pin-help">
            <p>If you forgot your PIN:</p>
            <ul>
              <li>
                Ask another admin to reset your PIN in Admin Tools — then create a new one at
                check-in or admin login.
              </li>
              <li>
                Or go to <Link to="/check-in">Check In</Link>, select your name, and create a new
                PIN if an admin has reset yours.
              </li>
              <li>
                Emergency access: use the shared admin PIN from Settings (default 0000) only if
                configured for your squadron.
              </li>
            </ul>
          </div>
        )}

        <button
          type="button"
          className="public-confirm-button admin"
          onClick={submit}
          disabled={submitDisabled}
        >
          {loading ? 'Checking...' : adminNeedsPinSetup ? 'CREATE PIN & OPEN DASHBOARD' : 'OPEN ADMIN DASHBOARD'}
        </button>
      </div>
    </div>
  );
}
