import { Link } from 'react-router-dom';
import CheckoutReminder from '../components/CheckoutReminder';
import KioskModeBanner from '../components/KioskModeBanner';
import { formatTime } from '../data/mockData';
import { useLocalTime } from '../hooks/useLocalTime';
import {
  getMeetingStatus,
  isAfterSignOutReviewTime,
  isAfterSystemForceCheckoutTime,
} from '../utils/timeRules';
import { useState } from 'react';

function KioskStatusPanel({ members, guests, now }) {
  const [view, setView] = useState('in');
  const afterReviewTime = isAfterSignOutReviewTime(now);
  const afterForceTime = isAfterSystemForceCheckoutTime(now);
  const signedInMembers = members.filter((member) => member.status === 'checked-in');
  const signedInGuests = guests.filter((guest) => guest.status === 'checked-in');
  const signedOutMembers = members.filter((member) => member.status !== 'checked-in');

  return (
    <aside className="public-status-panel">
      <div className="public-status-toggle" aria-label="Attendance status view">
        <button
          type="button"
          className={view === 'in' ? 'active in' : ''}
          onClick={() => setView('in')}
        >
          Signed In
        </button>
        <button
          type="button"
          className={view === 'out' ? 'active out' : ''}
          onClick={() => setView('out')}
        >
          Signed Out
        </button>
      </div>

      {view === 'in' ? (
        <div className="public-status-list">
          <div className="public-status-count">
            <strong>{signedInMembers.length + signedInGuests.length}</strong>
            <span>currently signed in</span>
          </div>
          {signedInMembers.map((member) => (
            <div
              key={member.id}
              className={`public-status-row signed-in ${afterReviewTime ? 'needs-review' : ''}`}
            >
              <div>
                <strong>{member.name}</strong>
                <span>{member.grade} - {formatTime(member.checkInTime)}</span>
              </div>
              {afterReviewTime && <em>Still checked in after 9:00 PM</em>}
              {afterForceTime && <em className="force-due">System force checkout due at 9:30 PM</em>}
            </div>
          ))}
          {signedInGuests.length > 0 && <div className="public-status-section-label">Guests</div>}
          {signedInGuests.map((guest) => (
            <div
              key={guest.id}
              className={`public-status-row signed-in guest ${afterReviewTime ? 'needs-review' : ''}`}
            >
              <div>
                <strong>{guest.name}</strong>
                <span>Guest - {formatTime(guest.checkInTime)}</span>
              </div>
              {afterReviewTime && <em>Still checked in after 9:00 PM</em>}
              {afterForceTime && <em className="force-due">System force checkout due at 9:30 PM</em>}
            </div>
          ))}
          {signedInMembers.length === 0 && signedInGuests.length === 0 && (
            <div className="public-status-empty">No one is signed in yet.</div>
          )}
        </div>
      ) : (
        <div className="public-status-list">
          <div className="public-status-count out">
            <strong>{signedOutMembers.length}</strong>
            <span>not currently present</span>
          </div>
          {signedOutMembers.map((member) => (
            <div key={member.id} className="public-status-row signed-out">
              <div>
                <strong>{member.name}</strong>
                <span>
                  {member.grade} - {member.status === 'checked-out' ? 'Checked out' : 'Not present'}
                </span>
                {member.forceAction && member.forceNote && (
                  <em className={member.forceType === 'system' ? 'force-system' : 'force-admin'}>
                    {member.forceType === 'system' ? 'System force logout' : 'Admin force logout'}: {member.forceNote}
                  </em>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

export default function PublicKiosk({ attendance }) {
  const { members, guests, settings, isKioskMode } = attendance;
  const { now, dateStr, timeStr } = useLocalTime();
  const meetingStatus = getMeetingStatus(settings, now);
  const logoSrc = `${import.meta.env.BASE_URL}squadron-logo.jpeg`;

  return (
    <div className="public-kiosk-page">
      {isKioskMode && (
        <KioskModeBanner settings={settings} usingLocalRoster={attendance.usingLocalRoster} />
      )}
      <div className="public-kiosk-body">
        <main className="public-kiosk-shell">
          <section className="public-kiosk-hero">
            <div className="public-brand-card">
              <img src={logoSrc} alt="Oak Ridge Composite Squadron patch" />
              <div>
                <p>{settings.motto}</p>
                <h1>{settings.squadronName}</h1>
                <strong>{settings.squadronDesignator}</strong>
              </div>
            </div>

            <div className="public-clock-card">
              <span>{dateStr}</span>
              <strong>{timeStr}</strong>
              <em className={meetingStatus === 'Meeting In Progress' ? 'open' : 'closed'}>
                {meetingStatus}
              </em>
            </div>

            <CheckoutReminder />
          </section>

          <KioskStatusPanel members={members} guests={guests} now={now} />
        </main>
      </div>

      <footer className="public-kiosk-footer">
        <div className="public-kiosk-actions">
          <Link to="/check-in" className="public-action-button check-in">
            <span>CHECK IN</span>
            <small>Members and cadets</small>
          </Link>
          <Link to="/check-out" className="public-action-button check-out">
            <span>CHECK OUT</span>
            <small>End of meeting</small>
          </Link>
          <Link to="/guest-sign-in" className="public-action-button guest">
            <span>GUEST SIGN IN</span>
            <small>Parents and visitors</small>
          </Link>
          <Link to="/admin-login" className="public-action-button admin">
            <span>ADMIN LOGIN</span>
            <small>Senior member tools</small>
          </Link>
        </div>
        <p className="kiosk-footer-pin-help">
          New or forgot PIN? Tap Check In, select your name, and create a PIN if none exists on this device.
        </p>
      </footer>
    </div>
  );
}
