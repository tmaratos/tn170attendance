import { NavLink } from 'react-router-dom';
import { useState } from 'react';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/check-in', label: 'Check In / Out', icon: '✅' },
  { to: '/guests', label: 'Guests', icon: '👥' },
  { to: '/attendance', label: 'Attendance List', icon: '📋' },
  { to: '/reports', label: 'Reports', icon: '📈' },
  { to: '/admin', label: 'Admin Tools', icon: '🔧' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar({ settings }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="mobile-menu-btn no-print"
        onClick={() => setOpen(!open)}
        aria-label="Toggle menu"
      >
        ☰
      </button>
      <div
        className={`sidebar-overlay ${open ? 'open' : ''}`}
        onClick={() => setOpen(false)}
      />
      <aside className={`sidebar no-print ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <img
            src="/squadron-logo.svg"
            alt="Squadron Logo"
            className="sidebar-logo"
          />
          <div className="sidebar-squadron">
            {settings.squadronName.toUpperCase()}
          </div>
          <div className="sidebar-designator">{settings.squadronDesignator}</div>
          <div className="sidebar-motto">{settings.motto.toUpperCase()}</div>
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
              <span className="sidebar-link-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-help">
            <div className="sidebar-help-title">Need Help?</div>
            <div className="sidebar-help-text">
              See a Senior Member for assistance with check-in or check-out.
            </div>
          </div>
          <div className="sidebar-version">v1.0.0</div>
        </div>
      </aside>
    </>
  );
}
