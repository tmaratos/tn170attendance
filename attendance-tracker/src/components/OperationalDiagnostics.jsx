/**
 * Operational diagnostics for admins/operators. Shows connection health and the
 * authoritative meeting identity so two devices can be confirmed in sync before a
 * meeting. Contains NO secret values (only the public Firebase project id).
 */
function formatSyncTime(value) {
  if (!value) return 'never';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'never';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

const STATE_LABEL = {
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  offline: 'Offline',
};

export default function OperationalDiagnostics({ attendance }) {
  const d = attendance?.diagnostics;
  if (!d) return null;

  const state = d.syncState || 'offline';
  const rows = [
    ['Connection', STATE_LABEL[state] || state],
    ['Firebase project', d.firebaseProjectId || '—'],
    ['Meeting ID', d.currentMeetingId || '(none started)'],
    ['Meeting date (ET)', d.currentMeetingDate || '—'],
    ['Last sync', formatSyncTime(d.lastSyncedAt)],
    ['Member records', String(d.memberAttendanceCount ?? 0)],
    ['Guest records', String(d.guestAttendanceCount ?? 0)],
    ['Roster source', d.usingLocalRoster ? 'Embedded fallback (Firestore empty)' : 'Firestore (live)'],
    ['App version', d.appVersion || 'unknown'],
  ];

  return (
    <div className="panel" style={{ marginTop: 24 }}>
      <h3 className="panel-title" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          className={`status-dot ${state === 'connected' ? 'in' : 'out'}`}
          aria-hidden="true"
        />
        Operational Diagnostics
      </h3>
      <p className="report-card-desc" style={{ marginBottom: 12 }}>
        Confirm two devices show the same Meeting ID and date, and that both are Connected.
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th style={{ textAlign: 'left', width: 200 }}>{label}</th>
                <td style={{ fontFamily: 'monospace' }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
