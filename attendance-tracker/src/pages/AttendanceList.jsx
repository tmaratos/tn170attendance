import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatTime, formatDuration, getInitials } from '../data/mockData';
import { useLocalTime } from '../hooks/useLocalTime';
import { isAfterSystemForceCheckoutTime } from '../utils/timeRules';
import { getCallableError } from '../services/errors';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'checked-in', label: 'Checked In' },
  { key: 'checked-out', label: 'Checked Out' },
  { key: 'cadets', label: 'Cadets' },
  { key: 'seniors', label: 'Senior Members' },
  { key: 'guests', label: 'Guests' },
];

export default function AttendanceList({ attendance }) {
  const {
    members,
    guests,
    isFirebase,
    seniorSession,
    searchMembers,
    createPendingMember,
    updatePendingMemberCapid,
    deactivateMember,
    reactivateMember,
  } = attendance;
  const [searchParams] = useSearchParams();
  const initialFilter = searchParams.get('filter') || 'all';
  const [filter, setFilter] = useState(initialFilter);
  const [search, setSearch] = useState('');
  const [mgmtPin, setMgmtPin] = useState('');
  const [mgmtSearch, setMgmtSearch] = useState('');
  const [pendingName, setPendingName] = useState('');
  const [pendingGrade, setPendingGrade] = useState('Prospective');
  const [capidTarget, setCapidTarget] = useState('');
  const [newCapid, setNewCapid] = useState('');
  const [mgmtMessage, setMgmtMessage] = useState('');
  const [mgmtError, setMgmtError] = useState('');
  const [mgmtLoading, setMgmtLoading] = useState(false);
  const { now } = useLocalTime();
  const forceCheckoutDue = isAfterSystemForceCheckoutTime(now);

  const canManage = isFirebase && seniorSession?.canManageMembers;
  const pendingMembers = useMemo(
    () => members.filter((m) => m.isProspective || String(m.capid).startsWith('TEMP-')),
    [members]
  );

  const runMgmtAction = async (action) => {
    if (mgmtPin.length !== 4) {
      setMgmtError('Enter your 4-digit PIN to authorize.');
      return;
    }
    setMgmtLoading(true);
    setMgmtError('');
    setMgmtMessage('');
    try {
      await action();
    } catch (err) {
      setMgmtError(getCallableError(err));
    } finally {
      setMgmtLoading(false);
    }
  };

  const filteredMembers = useMemo(() => {
    let list = members;

    if (filter === 'checked-in') list = list.filter((m) => m.status === 'checked-in');
    else if (filter === 'checked-out') list = list.filter((m) => m.status === 'checked-out');
    else if (filter === 'cadets') list = list.filter((m) => m.role === 'Cadet');
    else if (filter === 'seniors') list = list.filter((m) => m.role === 'Senior Member');

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.capid.includes(q) ||
          m.grade.toLowerCase().includes(q)
      );
    }

    return list;
  }, [members, filter, search]);

  const showGuests = filter === 'all' || filter === 'guests';

  return (
    <div>
      <h1 className="page-title">Attendance List</h1>
      <p className="page-subtitle">Full squadron roster with attendance status</p>

      <div className="panel">
        <div className="table-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`filter-btn ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="form-group" style={{ maxWidth: 400 }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search by name, CAPID, or grade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {filter !== 'guests' && (
          <div className="table-scroll-lg">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Grade</th>
                  <th>CAPID</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Check-In</th>
                  <th>Check-Out</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((m) => {
                  const forceDue = forceCheckoutDue && m.status === 'checked-in' && !m.checkOutTime;
                  const forceType = m.forceType || (
                    m.forceNote?.toLowerCase().includes('system') ? 'system' : 'admin'
                  );
                  return (
                  <tr key={m.id} className={forceDue ? 'needs-signout-review' : ''}>
                    <td>
                      <div className="member-cell">
                        <div className="avatar">{getInitials(m.name)}</div>
                        <div className="member-info">
                          <span className="member-name">{m.name}</span>
                          {forceDue && (
                            <span className="force-note due">System force checkout due at 9:30 PM.</span>
                          )}
                          {m.forceAction && m.forceNote && (
                            <span className={`force-note ${forceType}`}>
                              {forceType === 'system' ? 'System force logout' : 'Admin force logout'}: {m.forceNote}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{m.grade}</td>
                    <td>{m.capid}</td>
                    <td>
                      <span className={`role-badge ${m.role === 'Senior Member' ? 'senior' : 'cadet'}`}>
                        {m.role}
                      </span>
                    </td>
                    <td>
                      <span className={`status-label ${m.status === 'checked-in' ? 'in' : 'out'}`}>
                        <span className={`status-dot ${m.status === 'checked-in' ? 'in' : 'out'}`} />
                        {m.status === 'checked-in' ? 'Checked In' : 'Checked Out'}
                      </span>
                    </td>
                    <td>{formatTime(m.checkInTime)}</td>
                    <td>{formatTime(m.checkOutTime)}</td>
                    <td>{formatDuration(m.checkInTime, m.checkOutTime)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredMembers.length === 0 && (
              <div className="empty-state">No members match the current filter</div>
            )}
          </div>
        )}

        {showGuests && (
          <>
            <h3 className="panel-title" style={{ marginTop: 24, marginBottom: 12 }}>
              Guests
            </h3>
            <div className="table-scroll-lg">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Grade</th>
                    <th>CAPID</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Check-In</th>
                    <th>Check-Out</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {guests.map((g) => {
                    const forceDue = forceCheckoutDue && g.status === 'checked-in' && !g.checkOutTime;
                    const forceType = g.forceType || (
                      g.forceNote?.toLowerCase().includes('system') ? 'system' : 'admin'
                    );
                    return (
                    <tr key={g.id} className={forceDue ? 'needs-signout-review' : ''}>
                      <td>
                        <div className="member-cell">
                          <div className="avatar">{g.name[0]}</div>
                          <div className="member-info">
                            <span className="member-name">{g.name}</span>
                            {forceDue && (
                              <span className="force-note due">System force checkout due at 9:30 PM.</span>
                            )}
                            {g.forceAction && g.forceNote && (
                              <span className={`force-note ${forceType}`}>
                                {forceType === 'system' ? 'System force logout' : 'Admin force logout'}: {g.forceNote}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>—</td>
                      <td>—</td>
                      <td><span className="role-badge guest">Guest</span></td>
                      <td>
                        <span className={`status-label ${g.status === 'checked-in' ? 'in' : 'out'}`}>
                          <span className={`status-dot ${g.status === 'checked-in' ? 'in' : 'out'}`} />
                          {g.status === 'checked-in' ? 'Present' : 'Signed Out'}
                        </span>
                      </td>
                      <td>{formatTime(g.checkInTime)}</td>
                      <td>{formatTime(g.checkOutTime)}</td>
                      <td>{formatDuration(g.checkInTime, g.checkOutTime)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              {guests.length === 0 && (
                <div className="empty-state">No guest records</div>
              )}
            </div>
          </>
        )}
      </div>

      {canManage && (
        <div className="panel" style={{ marginTop: 24 }}>
          <h3 className="panel-title" style={{ marginBottom: 8 }}>Member Management</h3>
          <p className="report-card-desc" style={{ marginBottom: 16 }}>
            Create pending members, assign CAPIDs, and manage roster status. Authorized actions require your PIN.
          </p>

          {mgmtMessage && (
            <div style={{ marginBottom: 12, color: 'var(--green-dark)', fontWeight: 600 }}>{mgmtMessage}</div>
          )}
          {mgmtError && (
            <div style={{ marginBottom: 12, color: 'var(--red)' }}>{mgmtError}</div>
          )}

          <div className="form-group" style={{ maxWidth: 200, marginBottom: 20 }}>
            <label className="form-label">Your PIN (required for all actions)</label>
            <input
              type="password"
              className="form-input"
              maxLength={4}
              value={mgmtPin}
              onChange={(e) => setMgmtPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4-digit PIN"
            />
          </div>

          <div className="settings-grid" style={{ marginBottom: 24 }}>
            <div className="report-card">
              <div className="report-card-title">Create Pending Member</div>
              <div className="form-group">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Full name"
                  value={pendingName}
                  onChange={(e) => setPendingName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Grade (default: Prospective)"
                  value={pendingGrade}
                  onChange={(e) => setPendingGrade(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn btn-blue"
                disabled={mgmtLoading || !pendingName.trim()}
                onClick={() =>
                  runMgmtAction(async () => {
                    const result = await createPendingMember(
                      { fullName: pendingName.trim(), grade: pendingGrade, role: 'Prospective Member' },
                      mgmtPin
                    );
                    setMgmtMessage(`Created pending member ${result.temporaryId || result.memberId}.`);
                    setPendingName('');
                  })
                }
              >
                Create Pending
              </button>
            </div>

            <div className="report-card">
              <div className="report-card-title">Assign CAPID</div>
              <div className="form-group">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Pending member ID (TEMP-...)"
                  value={capidTarget}
                  onChange={(e) => setCapidTarget(e.target.value.toUpperCase())}
                />
              </div>
              <div className="form-group">
                <input
                  type="text"
                  className="form-input"
                  placeholder="New CAPID"
                  value={newCapid}
                  onChange={(e) => setNewCapid(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <button
                type="button"
                className="btn btn-gold"
                disabled={mgmtLoading || !capidTarget || !newCapid}
                onClick={() =>
                  runMgmtAction(async () => {
                    await updatePendingMemberCapid(capidTarget.trim(), newCapid.trim(), mgmtPin);
                    setMgmtMessage(`CAPID ${newCapid} assigned. Attendance history preserved.`);
                    setCapidTarget('');
                    setNewCapid('');
                  })
                }
              >
                Assign CAPID
              </button>
            </div>
          </div>

          {pendingMembers.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ marginBottom: 8 }}>Pending Members ({pendingMembers.length})</h4>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>ID</th>
                      <th>Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingMembers.map((m) => (
                      <tr key={m.id}>
                        <td>{m.name}</td>
                        <td>{m.capid}</td>
                        <td>{m.grade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="form-group" style={{ maxWidth: 400 }}>
            <label className="form-label">Search member to deactivate/reactivate</label>
            <input
              type="text"
              className="form-input"
              placeholder="Name or CAPID..."
              value={mgmtSearch}
              onChange={(e) => setMgmtSearch(e.target.value)}
            />
          </div>
          <div className="admin-search-results">
            {(mgmtSearch.trim() ? searchMembers(mgmtSearch) : []).slice(0, 8).map((member) => (
              <div key={member.id} className="admin-member-row">
                <div className="member-cell">
                  <div className="avatar">{getInitials(member.name)}</div>
                  <div className="member-info">
                    <span className="member-name">{member.name}</span>
                    <span className="member-meta">{member.grade} • CAPID {member.capid}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ minHeight: 'auto', padding: '6px 12px', fontSize: '0.85rem' }}
                    disabled={mgmtLoading}
                    onClick={() =>
                      runMgmtAction(async () => {
                        await deactivateMember(member.id, mgmtPin, 'Deactivated via member management');
                        setMgmtMessage(`${member.name} deactivated.`);
                      })
                    }
                  >
                    Deactivate
                  </button>
                  <button
                    type="button"
                    className="btn btn-green"
                    style={{ minHeight: 'auto', padding: '6px 12px', fontSize: '0.85rem' }}
                    disabled={mgmtLoading}
                    onClick={() =>
                      runMgmtAction(async () => {
                        await reactivateMember(member.id, mgmtPin);
                        setMgmtMessage(`${member.name} reactivated.`);
                      })
                    }
                  >
                    Reactivate
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
