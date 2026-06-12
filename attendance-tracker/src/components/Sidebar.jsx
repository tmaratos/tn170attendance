import { NavLink } from 'react-router-dom';
import { useState } from 'react';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'home' },
  { to: '/check-in', label: 'Check In / Out', icon: 'login' },
  { to: '/guests', label: 'Guests', icon: 'user' },
  { to: '/attendance', label: 'Attendance List', icon: 'list' },
  { to: '/reports', label: 'Reports', icon: 'file' },
  { to: '/admin', label: 'Admin Tools', icon: 'shield' },
  { to: '/settings', label: 'Settings', icon: 'gear' },
];

function NavIcon({ name }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  const paths = {
    home: (
      <>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10.5V20h14v-9.5" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    login: (
      <>
        <path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" />
        <path d="M3 12h11" />
        <path d="m11 8 4 4-4 4" />
      </>
    ),
    user: (
      <>
        <path d="M20 21a8 8 0 0 0-16 0" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
    list: (
      <>
        <path d="M8 6h13" />
        <path d="M8 12h13" />
        <path d="M8 18h13" />
        <path d="M3 6h.01" />
        <path d="M3 12h.01" />
        <path d="M3 18h.01" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h6" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M12 8v6" />
        <path d="M9.5 11h5" />
      </>
    ),
    gear: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.38 1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.38H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .38-1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.23.35.6.57 1 .6.33.02.6.04.6.04a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}

export default function Sidebar({ settings }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="mobile-menu-btn no-print"
        onClick={() => setOpen(!open)}
        aria-label="Toggle menu"
      >
        Menu
      </button>
      <div
        className={`sidebar-overlay ${open ? 'open' : ''}`}
        onClick={() => setOpen(false)}
      />
      <aside className={`sidebar no-print ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <img
            src="/squadron-logo.jpeg"
            alt="Squadron Logo"
            className="sidebar-logo"
          />
          <div className="sidebar-squadron">
            {settings.squadronName.toUpperCase()}
          </div>
          <div className="sidebar-designator">{settings.squadronDesignator}</div>
          <div className="sidebar-motto-wrap">
            <div className="sidebar-motto-line" />
            <div className="sidebar-motto">{settings.motto.toUpperCase()}</div>
            <div className="sidebar-motto-line" />
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
              onClick={() => setOpen(false)}
            >
              <span className="sidebar-link-icon"><NavIcon name={item.icon} /></span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-help">
            <div className="sidebar-help-title">Need Help?</div>
            <div className="sidebar-help-text">
              See a Senior Member for assistance.
            </div>
          </div>
          <div className="sidebar-version">v1.0.0</div>
        </div>
      </aside>
    </>
  );
}
