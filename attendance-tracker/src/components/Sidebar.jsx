import { NavLink, Link } from 'react-router-dom';
import { useState } from 'react';

const NAV_ITEMS = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: 'home' },
  { to: '/admin/members', label: 'Attendance', icon: 'clipboard' },
  { to: '/admin/roster', label: 'Roster', icon: 'users' },
  { to: '/admin/reports', label: 'Reports', icon: 'file' },
  { to: '/admin/tools', label: 'Overrides & PINs', icon: 'shield' },
  { to: '/admin/settings', label: 'Settings', icon: 'gear' },
];

function NavIcon({ name }) {
  const common = {
    width: 21, height: 21, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
  };
  const paths = {
    home: (<><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10.5V20h14v-9.5" /><path d="M9 20v-6h6v6" /></>),
    clipboard: (<><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" /><path d="M9 12h6" /><path d="M9 16h4" /></>),
    users: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
    file: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h6" /></>),
    shield: (<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>),
    gear: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.38 1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.38H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .38-1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.23.35.6.57 1 .6.33.02.6.04.6.04a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z" /></>),
    tablet: (<><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>),
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function initials(name) {
  if (!name) return 'TN';
  return name.split(' ').map((n) => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2);
}

export default function Sidebar({ settings, attendance }) {
  const [open, setOpen] = useState(false);
  const logoSrc = `${import.meta.env.BASE_URL}squadron-logo.jpeg`;
  const session = attendance?.seniorSession;
  const name = session?.displayName || session?.fullName || 'Administrator';

  return (
    <>
      <button
        className="mobile-menu-btn no-print"
        onClick={() => setOpen(!open)}
        aria-label="Toggle menu"
      >
        Menu
      </button>
      <div className={`sidebar-overlay ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar no-print ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <img src={logoSrc} alt="Squadron Logo" className="sidebar-logo" />
          <div className="sidebar-squadron">{settings.squadronName.toUpperCase()}</div>
          <div className="sidebar-designator">{settings.squadronDesignator}</div>
          <div className="sidebar-motto-wrap">
            <div className="sidebar-motto-line" />
            <div className="sidebar-motto">{settings.motto.toUpperCase()}</div>
            <div className="sidebar-motto-line" />
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-nav-group-label">Administration</div>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <span className="sidebar-link-icon"><NavIcon name={item.icon} /></span>
              {item.label}
            </NavLink>
          ))}
          <Link to="/" className="sidebar-kiosk-btn" onClick={() => setOpen(false)}>
            <span className="sidebar-link-icon"><NavIcon name="tablet" /></span>
            Open Public Kiosk
          </Link>
        </nav>

        <div className="sidebar-footer">
          {session ? (
            <div className="sidebar-identity">
              <span className="avatar">{initials(name)}</span>
              <span className="sidebar-identity-meta">
                <span className="sidebar-identity-name">{name}</span>
                <span className="sidebar-identity-role">Administrator</span>
              </span>
            </div>
          ) : (
            <div className="sidebar-help">
              <div className="sidebar-help-title">Need help?</div>
              <div className="sidebar-help-text">See a senior member for assistance.</div>
            </div>
          )}
          <div className="sidebar-version">TN-170 Attendance</div>
        </div>
      </aside>
    </>
  );
}
