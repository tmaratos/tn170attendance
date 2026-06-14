import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import PinPad from '../components/PinPad';
import { getInitials } from '../data/mockData';
import { useLocalTime } from '../hooks/useLocalTime';
import { isAfterSystemForceCheckoutTime } from '../utils/timeRules';

export default function AdminTools({ attendance }) {
  const {
    members,
    searchMembers,
    verifyAdminPin,
    checkInMember,
    checkOutMember,
    isCloudBackend,
    isKioskMode,
    authenticateSenior,
    forceCheckInMember,
    forceCheckOutMember,
    resetMemberPin,
    seniorSession,
    canResetPins,
  } = attendance;

  const [searchParams] = useSearchParams();
  const initialAction = searchParams.get('action') || 'check-in';

  const [authenticated, setAuthenticated] = useState(!!seniorSession);
  const [adminCapid, setAdminCapid] = useState('');
  const [adminMemberId, setAdminMemberId] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [query, setQuery] = useState('');
  const [action, setAction] = useState(initialAction);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetTarget, setResetTarget] = useState('');
  const [resetQuery, setResetQuery] = useState('');
  const { now } = useLocalTime();
  const forceCheckoutDue = isAfterSystemForceCheckoutTime(now);

  const results = useMemo(() => searchMembers(query), [query, searchMembers]);
  const resetResults = useMemo(() => searchMembers(resetQuery), [resetQuery, searchMembers]);
  const showPinReset =
    (isCloudBackend && seniorSession?.canResetPins) || (isKioskMode && canResetPins);
  const adminMembers = attendance.adminMembers || [];

  const handleAdminAuth = async () => {
    if (adminPin.length !== 4) return;
    setLoading(true);
    setPinError('');
    try {
      if (isCloudBackend) {
        if (!adminCapid.trim()) {
          setPinError('Enter your CAPID.');
          return;
        }
        await authenticateSenior(adminCapid.trim(), adminPin);
        setAuthenticated(true);
      } else if (isKioskMode) {
        if (!adminMemberId) {
          setPinError('Select your admin account.');
          return;
        }
        const ok = await verifyAdminPin(adminMemberId, adminPin);
        if (!ok) {
          setPinError('Incorrect admin PIN.');
          setAdminPin('');
          return;
        }
        setAuthenticated(true);
      } else if (verifyAdminPin(adminPin)) {
        setAuthenticated(true);
      } else {
        setPinError('Incorrect admin PIN.');
        setAdminPin('');
      }
    } catch (err) {
      setPinError(err.message || 'Authentication failed.');
      setAdminPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleForce = async (memberId) => {
    setLoading(true);
    setMessage('');
    try {
      if (isCloudBackend) {
        if (action === 'check-in') {
          await forceCheckInMember(memberId, adminPin);
          setMessage('Member force checked in.');
        } else {
          await forceCheckOutMember(
            memberId,
            adminPin,
            'Admin force logout - manually signed out by senior member.'
          );
          setMessage('Member force checked out.');
        }
      } else if (action === 'check-in') {
        checkInMember(memberId, true);
        setMessage('Member force checked in.');
      } else {
        checkOutMember(memberId, true, 'Admin force logout - manually signed out by senior member.');
        setMessage('Member force checked out.');
      }
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage(err.message || 'Force action failed.');
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div>
        <h1 className="page-title">Admin Tools</h1>
        <p className="page-subtitle">
          {isCloudBackend
            ? 'Senior members: enter your CAPID and PIN to access administrative functions'
            : isKioskMode
              ? 'Select your admin account and enter your Firestore PIN'
              : 'Enter admin PIN to access administrative functions'}
        </p>

        <div className="kiosk-panel" style={{ maxWidth: 480, margin: '0 auto' }}>
          <h2 className="kiosk-title">Senior Member Authentication</h2>
          <p className="kiosk-subtitle">
            {isCloudBackend ? 'Enter your CAPID and 4-digit PIN' : isKioskMode ? 'Select admin and enter PIN' : 'Enter the 4-digit admin PIN'}
          </p>
          {isCloudBackend && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <input
                type="text"
                className="form-input form-input-lg"
                placeholder="Your CAPID"
                value={adminCapid}
                onChange={(e) => setAdminCapid(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          )}
          {isKioskMode && !isCloudBackend && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <select
                className="form-input form-input-lg admin-select-field"
                value={adminMemberId}
                onChange={(e) => {
                  setAdminMemberId(e.target.value);
                  setAdminPin('');
                  setPinError('');
                }}
              >
                <option value="">Choose your name...</option>
                {adminMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} — {member.grade} — CAPID {member.capid}
                  </option>
                ))}
              </select>
            </div>
          )}
          {pinError && <div className="pin-error">{pinError}</div>}
          <PinPad
            pin={adminPin}
            onDigit={(d) => { setPinError(''); setAdminPin((p) => p + d); }}
            onBackspace={() => setAdminPin((p) => p.slice(0, -1))}
            onClear={() => { setAdminPin(''); setPinError(''); }}
          />
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button
              className="btn btn-gold btn-lg"
              onClick={handleAdminAuth}
              disabled={
                adminPin.length !== 4 ||
                loading ||
                (isCloudBackend && !adminCapid.trim()) ||
                (isKioskMode && !isCloudBackend && !adminMemberId)
              }
            >
              {loading ? 'Authenticating...' : 'Authenticate'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Admin Tools</h1>
      <p className="page-subtitle">
        Force check-in/out and administrative overrides
        {seniorSession?.displayName ? ` — ${seniorSession.displayName}` : ''}
      </p>

      {message && (
        <div className="panel" style={{ marginBottom: 16, background: 'var(--green-bg)' }}>
          <p style={{ color: 'var(--green-dark)', fontWeight: 600 }}>{message}</p>
        </div>
      )}

      <div className="panel">
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <button
            className={`btn ${action === 'check-in' ? 'btn-green' : 'btn-outline'}`}
            onClick={() => setAction('check-in')}
          >
            Force Check In
          </button>
          <button
            className={`btn ${action === 'check-out' ? 'btn-red' : 'btn-outline'}`}
            onClick={() => setAction('check-out')}
          >
            Force Check Out
          </button>
        </div>

        <div className="form-group">
          <label className="form-label">Search Member</label>
          <input
            type="text"
            className="form-input form-input-lg"
            placeholder="Search by name, CAPID, or grade..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="admin-search-results">
          {(query ? results : members).map((member) => (
            <div key={member.id} className="admin-member-row">
              <div className="member-cell">
                <div className="avatar">{getInitials(member.name)}</div>
                <div className="member-info">
                  <span className="member-name">{member.name}</span>
                  <span className="member-meta">
                    {member.grade} • CAPID {member.capid} •{' '}
                    <span className={`status-label ${member.status === 'checked-in' ? 'in' : 'out'}`}>
                      {member.status === 'checked-in' ? 'Checked In' : member.status === 'checked-out' ? 'Checked Out' : 'Not Present'}
                    </span>
                  </span>
                  {forceCheckoutDue && member.status === 'checked-in' && (
                    <span className="force-note due">
                      System force checkout due at 9:30 PM.
                    </span>
                  )}
                  {member.forceAction && member.forceNote && (
                    <span className={`force-note ${member.forceType === 'system' ? 'system' : 'admin'}`}>
                      {member.forceType === 'system' ? 'System force logout' : 'Admin force logout'}: {member.forceNote}
                    </span>
                  )}
                </div>
              </div>
              <button
                className={`btn ${action === 'check-in' ? 'btn-green' : 'btn-red'}`}
                style={{ minHeight: 'auto', padding: '8px 16px', fontSize: '0.85rem' }}
                onClick={() => handleForce(member.id)}
                disabled={loading}
              >
                {action === 'check-in' ? 'Force In' : 'Force Out'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {showPinReset && (
        <div className="panel" style={{ marginTop: 24 }}>
          <h3 className="panel-title" style={{ marginBottom: 12 }}>PIN Reset</h3>
          <p className="report-card-desc" style={{ marginBottom: 16 }}>
            Reset a member&apos;s PIN. They will create a new PIN at next check-in.
            {isKioskMode ? ' PINs are stored in Firebase and sync across all kiosks.' : ''}
          </p>
          {isCloudBackend ? (
            <>
              <div className="form-group">
                <label className="form-label">Member CAPID to reset</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="CAPID"
                  value={resetTarget}
                  onChange={(e) => setResetTarget(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <button
                className="btn btn-gold"
                disabled={!resetTarget || loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    await resetMemberPin(resetTarget, adminPin);
                    setMessage(`PIN reset for CAPID ${resetTarget}.`);
                    setResetTarget('');
                    setTimeout(() => setMessage(''), 3000);
                  } catch (err) {
                    setMessage(err.message || 'PIN reset failed.');
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Reset PIN
              </button>
            </>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">Search member to reset</label>
                <input
                  type="text"
                  className="form-input form-input-lg"
                  placeholder="Search by name or CAPID..."
                  value={resetQuery}
                  onChange={(e) => setResetQuery(e.target.value)}
                />
              </div>
              <div className="admin-search-results">
                {(resetQuery ? resetResults : members).slice(0, 12).map((member) => (
                  <div key={`reset-${member.id}`} className="admin-member-row">
                    <div className="member-cell">
                      <div className="avatar">{getInitials(member.name)}</div>
                      <div className="member-info">
                        <span className="member-name">{member.name}</span>
                        <span className="member-meta">
                          {member.grade} • CAPID {member.capid}
                          {member.hasPin ? ' • PIN set' : ' • No PIN / reset required'}
                        </span>
                      </div>
                    </div>
                    <button
                      className="btn btn-gold"
                      style={{ minHeight: 'auto', padding: '8px 16px', fontSize: '0.85rem' }}
                      disabled={loading}
                      onClick={async () => {
                        setLoading(true);
                        try {
                          await resetMemberPin(
                            member.id,
                            adminPin,
                            isKioskMode ? adminMemberId : seniorSession?.memberId || seniorSession?.capid
                          );
                          setMessage(`PIN reset for ${member.name}. They can create a new PIN at check-in.`);
                          setTimeout(() => setMessage(''), 4000);
                        } catch (err) {
                          setMessage(err.message || 'PIN reset failed.');
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      Reset PIN
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
