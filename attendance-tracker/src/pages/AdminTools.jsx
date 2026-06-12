import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import PinPad from '../components/PinPad';
import { getInitials } from '../data/mockData';

export default function AdminTools({ attendance }) {
  const {
    members,
    searchMembers,
    verifyAdminPin,
    checkInMember,
    checkOutMember,
  } = attendance;

  const [searchParams] = useSearchParams();
  const initialAction = searchParams.get('action') || 'check-in';

  const [authenticated, setAuthenticated] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [query, setQuery] = useState('');
  const [action, setAction] = useState(initialAction);
  const [message, setMessage] = useState('');

  const results = useMemo(() => searchMembers(query), [query, searchMembers]);

  const handleAdminAuth = () => {
    if (adminPin.length === 4) {
      if (verifyAdminPin(adminPin)) {
        setAuthenticated(true);
        setPinError('');
      } else {
        setPinError('Incorrect admin PIN.');
        setAdminPin('');
      }
    }
  };

  const handleForce = (memberId) => {
    if (action === 'check-in') {
      checkInMember(memberId, true);
      setMessage('Member force checked in.');
    } else {
      checkOutMember(memberId, true);
      setMessage('Member force checked out.');
    }
    setTimeout(() => setMessage(''), 3000);
  };

  if (!authenticated) {
    return (
      <div>
        <h1 className="page-title">Admin Tools</h1>
        <p className="page-subtitle">Enter admin PIN to access administrative functions</p>

        <div className="kiosk-panel" style={{ maxWidth: 480, margin: '0 auto' }}>
          <h2 className="kiosk-title">Admin Authentication</h2>
          <p className="kiosk-subtitle">Enter the 4-digit admin PIN</p>
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
              disabled={adminPin.length !== 4}
            >
              Authenticate
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Admin Tools</h1>
      <p className="page-subtitle">Force check-in/out and administrative overrides</p>

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
                      {member.status === 'checked-in' ? 'Checked In' : 'Checked Out'}
                    </span>
                  </span>
                </div>
              </div>
              <button
                className={`btn ${action === 'check-in' ? 'btn-green' : 'btn-red'}`}
                style={{ minHeight: 'auto', padding: '8px 16px', fontSize: '0.85rem' }}
                onClick={() => handleForce(member.id)}
              >
                {action === 'check-in' ? 'Force In' : 'Force Out'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
