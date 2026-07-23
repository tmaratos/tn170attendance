/**
 * Professional admin top bar: page title + tonight's date, and the signed-in
 * admin identity with an obvious Sign out. Makes the admin state explicit so
 * senior members always know they are authenticated and who they are.
 */
import { useLocalTime } from '../hooks/useLocalTime';

function initials(name) {
  if (!name) return 'TN';
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function AdminTopBar({ title, subtitle, attendance, onSignOut }) {
  const { shortDateStr } = useLocalTime();
  const session = attendance?.seniorSession;
  const name = session?.displayName || session?.fullName || 'Administrator';

  return (
    <header className="admin-topbar no-print">
      <div className="admin-topbar-title">
        <h1>{title}</h1>
        {subtitle && <span className="admin-topbar-sub">{subtitle}</span>}
      </div>
      <div className="admin-topbar-spacer" />
      <span className="admin-topbar-date">{shortDateStr}</span>
      {session && (
        <>
          <span className="admin-identity">
            <span className="avatar">{initials(name)}</span>
            <span className="admin-identity-meta">
              <span className="admin-identity-name">{name}</span>
              <span className="admin-identity-role">Administrator</span>
            </span>
          </span>
          <button type="button" className="admin-signout" onClick={onSignOut}>
            Sign out
          </button>
        </>
      )}
    </header>
  );
}
