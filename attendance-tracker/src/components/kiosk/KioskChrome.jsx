import { Link } from 'react-router-dom';
import Icon from './icons';
import { useEasternClock, easternMeetingStatus } from '../../hooks/useEasternClock';

const BASE = import.meta.env.BASE_URL;

export function KioskBranding({ squadronName, designator }) {
  return (
    <div className="k-brand">
      <img className="k-brand-patch" src={`${BASE}squadron-logo.jpeg`} alt="Oak Ridge Composite Squadron patch" />
      <div className="k-brand-text">
        <span className="k-brand-name">{squadronName || 'Oak Ridge Composite Squadron'}</span>
        <span className="k-brand-desig">{designator || 'TN-170'}</span>
      </div>
    </div>
  );
}

/**
 * Official Civil Air Patrol mark (secondary identity). Renders the supplied asset
 * at public/civil-air-patrol-logo.png exactly as provided — the wordmark ("Civil Air
 * Patrol" / "U.S. Air Force Auxiliary") is baked into the artwork, so no adjacent text
 * is drawn. If the asset is ever missing it degrades to a tasteful "CAP" placeholder;
 * the official logo is never fabricated or redrawn.
 */
export function KioskCapLogo() {
  const handleError = (e) => {
    e.currentTarget.style.display = 'none';
    const fb = e.currentTarget.parentElement?.querySelector('.k-caplogo-fallback');
    if (fb) fb.style.display = 'grid';
  };
  return (
    <div className="k-caplogo">
      <img
        className="k-caplogo-img"
        src={`${BASE}civil-air-patrol-logo.png`}
        alt="Civil Air Patrol, U.S. Air Force Auxiliary"
        onError={handleError}
      />
      <div className="k-caplogo-fallback" role="img" aria-label="Civil Air Patrol, U.S. Air Force Auxiliary" style={{ display: 'none' }}>
        CAP
      </div>
    </div>
  );
}

export function KioskConnectionStatus({ syncState = 'connected' }) {
  const map = {
    connected: { icon: 'connected', label: 'System Online', sub: 'Kiosk connected' },
    reconnecting: { icon: 'refresh', label: 'Reconnecting', sub: 'Restoring sync…' },
    offline: { icon: 'offline', label: 'Offline', sub: 'Not connected' },
  };
  const s = map[syncState] || map.connected;
  return (
    <div className="k-connection" role="status" aria-live="polite">
      <span className={`k-chip ${syncState}`}>
        <Icon name={s.icon} />
        {s.label}
      </span>
      <span className="k-chip-sub">{s.sub}</span>
    </div>
  );
}

export function KioskMeetingStatus({ settings, clock }) {
  const status = easternMeetingStatus(settings, clock);
  return (
    <div className="k-header-center">
      <span className="k-meeting-date">
        <Icon name="calendar" size={16} className="k-inline-icon" /> {clock.dateStr}
      </span>
      <span className="k-meeting-sub">
        <span className={`k-meeting-dot ${status.open ? 'open' : ''}`} />
        {status.label}
      </span>
      <span className="k-meeting-sub">
        <Icon name="clock" size={14} /> {clock.timeStr} ET
      </span>
    </div>
  );
}

export function KioskHeader({ settings, syncState }) {
  const clock = useEasternClock();
  return (
    <header className="k-header">
      <KioskBranding squadronName={settings?.squadronName} designator={settings?.squadronDesignator} />
      <KioskMeetingStatus settings={settings} clock={clock} />
      <KioskConnectionStatus syncState={syncState} />
      <KioskCapLogo />
    </header>
  );
}

export function KioskFooter() {
  return (
    <footer className="k-footer">
      <p className="k-footer-help">
        <Icon name="key" size={18} />
        <span>
          <strong>New or forgot your PIN?</strong> Tap “Check in / Check out,” find your name, and
          you’ll be prompted to create one. Semper Vigilans — thanks for keeping attendance ready.
        </span>
      </p>
      <p className="k-attrib">
        {/* Real external anchor. Accessible name is exactly the visible text
            ("Built by Tristan Maratos"); target=_blank opens a new tab, rel prevents
            reverse-tabnabbing, and .k-attrib a:focus-visible gives a visible ring. */}
        <a href="https://tristanmaratos.com" target="_blank" rel="noopener noreferrer">
          Built by Tristan Maratos
        </a>
      </p>
    </footer>
  );
}

/**
 * Page shell for every public kiosk screen. Optional header (landing) or a compact
 * top bar for flow screens.
 */
export function KioskShell({ settings, syncState, header = true, children }) {
  return (
    <div className="k-scope">
      <div className="k-shell">
        <div className="k-container">
          {header && <KioskHeader settings={settings} syncState={syncState} />}
          {children}
          <KioskFooter />
        </div>
      </div>
    </div>
  );
}

/** Compact top bar for wizard/flow screens (Home + Eastern time). */
export function KioskFlowTopBar() {
  const clock = useEasternClock();
  return (
    <div className="k-flow-topbar">
      <Link to="/" className="k-back">
        <Icon name="home" size={18} /> Home
      </Link>
      <div className="k-flow-time">
        {clock.dateStr}
        <strong>{clock.timeStr} ET</strong>
      </div>
    </div>
  );
}
