/**
 * Site-wide operational status strip for admin pages. Reads attendance.diagnostics
 * (connection, meeting id/date, last sync, version). Contains no secret values.
 */
function Icon({ name }) {
  const p = {
    width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
  };
  const paths = {
    check: <><path d="M20 6 9 17l-5-5" /></>,
    off: <><path d="m1 1 22 22" /><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" /><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" /><path d="M10.71 5.05A16 16 0 0 1 22.58 9" /><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><path d="M12 20h.01" /></>,
    sync: <><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
    info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>,
  };
  return <svg {...p}>{paths[name]}</svg>;
}

function fmtTime(value) {
  if (!value) return 'never';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return 'never';
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const CONNECTION = {
  connected: { label: 'Connected', sub: 'All systems operational', icon: 'check', tone: 'green' },
  reconnecting: { label: 'Reconnecting', sub: 'Restoring cloud sync', icon: 'sync', tone: 'gold' },
  offline: { label: 'Offline', sub: 'Not syncing', icon: 'off', tone: 'red' },
};

export default function StatusStrip({ attendance }) {
  const d = attendance?.diagnostics;
  if (!d) return null;
  const conn = CONNECTION[d.syncState] || CONNECTION.offline;

  const items = [
    { icon: conn.icon, tone: conn.tone, label: conn.label, value: conn.sub },
    { icon: 'users', tone: 'blue', label: 'Meeting ID', value: d.currentMeetingId || d.currentMeetingDate || '—' },
    { icon: 'sync', tone: 'green', label: 'Last sync', value: fmtTime(d.lastSyncedAt) },
    { icon: 'clock', tone: 'gold', label: 'Report target', value: '10:00 PM ET' },
    { icon: 'info', tone: 'gray', label: 'Version', value: d.appVersion || '—' },
  ];

  return (
    <div className="status-strip" role="status" aria-label="System status">
      {items.map((it) => (
        <div className="status-item" key={it.label}>
          <span className={`status-item-icon status-icon-${it.tone}`}><Icon name={it.icon} /></span>
          <span className="status-item-body">
            <span className="status-item-label">{it.label}</span>
            <span className={`status-item-value${it.tone === 'gray' ? ' muted' : ''}`}>{it.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
