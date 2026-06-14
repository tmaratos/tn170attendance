import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import PinPad from '../components/PinPad';
import { useLocalTime } from '../hooks/useLocalTime';

export default function AdminLogin({ attendance, onLogin }) {
  const [selectedAdminId, setSelectedAdminId] = useState('');
  const [capid, setCapid] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { dateStr, shortTimeStr } = useLocalTime();
  const needsCapid = attendance.isCloudBackend;
  const adminMembers = attendance.adminMembers || [];
  const logoSrc = `${import.meta.env.BASE_URL}squadron-logo.jpeg`;

  const selectedAdmin = useMemo(
    () => adminMembers.find((member) => String(member.id) === String(selectedAdminId)),
    [adminMembers, selectedAdminId]
  );

  const adminNeedsKioskPin =
    !needsCapid && selectedAdmin && !attendance.memberHasPin?.(selectedAdmin.id);

  const submit = async () => {
    if (pin.length !== 4) return;
    if (needsCapid && !capid.trim()) return;
    if (!needsCapid && !selectedAdminId) return;
    if (adminNeedsKioskPin) return;

    setLoading(true);
    setError('');

    try {
      const ok = needsCapid
        ? await attendance.verifyAdminPin(capid.trim(), pin)
        : await attendance.verifyAdminPin(selectedAdminId, pin);
      if (!ok) {
        setPin('');
        setError('Admin PIN was not accepted.');
        return;
      }
      onLogin();
      navigate('/admin/dashboard', { replace: true });
    } catch {
      setPin('');
      setError('Admin login failed.');
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
                setError('');
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

        {adminNeedsKioskPin && (
          <div className="public-flow-error admin-pin-notice">
            Set your personal check-in PIN at the kiosk first, then return here to sign in.
          </div>
        )}

        {error && <div className="public-flow-error">{error}</div>}

        {!adminNeedsKioskPin && (
          <>
            <p className="admin-pin-label">
              {needsCapid ? 'Enter your senior member PIN' : 'Enter your personal kiosk PIN'}
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
          </>
        )}

        <button
          type="button"
          className="public-confirm-button admin"
          onClick={submit}
          disabled={
            loading ||
            pin.length !== 4 ||
            (needsCapid && !capid.trim()) ||
            (!needsCapid && !selectedAdminId) ||
            adminNeedsKioskPin
          }
        >
          {loading ? 'Checking...' : 'OPEN ADMIN DASHBOARD'}
        </button>
      </div>
    </div>
  );
}
