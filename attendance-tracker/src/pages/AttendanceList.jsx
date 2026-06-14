import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatTime, formatDuration, getInitials } from '../data/mockData';
import { useLocalTime } from '../hooks/useLocalTime';
import { isAfterSystemForceCheckoutTime } from '../utils/timeRules';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'checked-in', label: 'Checked In' },
  { key: 'checked-out', label: 'Checked Out' },
  { key: 'cadets', label: 'Cadets' },
  { key: 'seniors', label: 'Senior Members' },
  { key: 'guests', label: 'Guests' },
];

export default function AttendanceList({ attendance }) {
  const { members, guests } = attendance;
  const [searchParams] = useSearchParams();
  const initialFilter = searchParams.get('filter') || 'all';
  const [filter, setFilter] = useState(initialFilter);
  const [search, setSearch] = useState('');
  const { now } = useLocalTime();
  const forceCheckoutDue = isAfterSystemForceCheckoutTime(now);

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
    </div>
  );
}
