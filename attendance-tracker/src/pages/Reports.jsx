import { useMemo } from 'react';
import { formatTime, formatDuration } from '../data/mockData';

function exportCSV(members, guests) {
  const headers = ['Name', 'Grade', 'CAPID', 'Role', 'Status', 'Check-In', 'Check-Out', 'Duration'];
  const memberRows = members.map((m) => [
    m.name,
    m.grade,
    m.capid,
    m.role,
    m.status === 'checked-in' ? 'Checked In' : 'Checked Out',
    formatTime(m.checkInTime),
    formatTime(m.checkOutTime),
    formatDuration(m.checkInTime, m.checkOutTime),
  ]);
  const guestRows = guests.map((g) => [
    g.name,
    '—',
    '—',
    'Guest',
    g.status === 'checked-in' ? 'Present' : 'Signed Out',
    formatTime(g.checkInTime),
    formatTime(g.checkOutTime),
    formatDuration(g.checkInTime, g.checkOutTime),
  ]);

  const rows = [headers, ...memberRows, ...guestRows];
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tn170-attendance-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports({ attendance }) {
  const { members, guests, getStats } = attendance;
  const stats = getStats();

  const cadetStats = useMemo(() => {
    const cadets = members.filter((m) => m.role === 'Cadet');
    const present = cadets.filter((m) => m.status === 'checked-in').length;
    return { total: cadets.length, present };
  }, [members]);

  const seniorStats = useMemo(() => {
    const seniors = members.filter((m) => m.role === 'Senior Member');
    const present = seniors.filter((m) => m.status === 'checked-in').length;
    return { total: seniors.length, present };
  }, [members]);

  return (
    <div>
      <h1 className="page-title">Reports</h1>
      <p className="page-subtitle">Meeting attendance summaries and exports</p>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h3 className="panel-title" style={{ marginBottom: 16 }}>Tonight&apos;s Summary</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div className="report-card">
            <div className="report-card-title">Total Present</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--blue)' }}>
              {stats.totalPresent}
            </div>
            <div className="report-card-desc">Members + guests checked in</div>
          </div>
          <div className="report-card">
            <div className="report-card-title">Cadets</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--gold-dark)' }}>
              {cadetStats.present}/{cadetStats.total}
            </div>
            <div className="report-card-desc">Cadets present tonight</div>
          </div>
          <div className="report-card">
            <div className="report-card-title">Senior Members</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--blue-dark)' }}>
              {seniorStats.present}/{seniorStats.total}
            </div>
            <div className="report-card-desc">Senior members present tonight</div>
          </div>
          <div className="report-card">
            <div className="report-card-title">Guests</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--gold)' }}>
              {stats.guestsPresent}
            </div>
            <div className="report-card-desc">Guests signed in tonight</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3 className="panel-title" style={{ marginBottom: 16 }}>Export & Reports</h3>

        <div className="report-card">
          <div className="report-card-title">Full Attendance CSV</div>
          <div className="report-card-desc">
            Export all member and guest attendance records for tonight&apos;s meeting.
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-blue" onClick={() => exportCSV(members, guests)}>
              Export CSV
            </button>
            <button
              className="btn btn-gray"
              onClick={() => window.alert('PDF export will be available when the backend is connected. Use Export CSV for now.')}
            >
              Download PDF
            </button>
          </div>
        </div>

        <div className="report-card">
          <div className="report-card-title">Checked-In Roster</div>
          <div className="report-card-desc">
            {stats.checkedIn} members currently checked in.
          </div>
          <div className="table-scroll" style={{ maxHeight: 200 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Grade</th>
                  <th>Check-In</th>
                </tr>
              </thead>
              <tbody>
                {members
                  .filter((m) => m.status === 'checked-in')
                  .map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>{m.grade}</td>
                      <td>{formatTime(m.checkInTime)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="report-card">
          <div className="report-card-title">Absent Members</div>
          <div className="report-card-desc">
            Members who have not checked in tonight.
          </div>
          <div className="table-scroll" style={{ maxHeight: 200 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Grade</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {members
                  .filter((m) => m.status !== 'checked-in')
                  .map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>{m.grade}</td>
                      <td>{m.role}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
