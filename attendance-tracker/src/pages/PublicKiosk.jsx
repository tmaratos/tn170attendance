import { Link } from 'react-router-dom';
import BuiltByCredit from '../components/BuiltByCredit';
import CheckoutReminder from '../components/CheckoutReminder';
import { formatTime } from '../data/mockData';
import { useLocalTime } from '../hooks/useLocalTime';
import {
  getMeetingStatus,
  isAfterSignOutReviewTime,
  isAfterSystemForceCheckoutTime,
} from '../utils/timeRules';
import { useState } from 'react';

function KioskStatusPanel({ members, guests, now, meetingEnd }) {
  const [view, setView] = useState('in');
  const afterReviewTime = isAfterSignOutReviewTime(now, meetingEnd);
  const afterForceTime = isAfterSystemForceCheckoutTime(now, meetingEnd);
  const signedInMembers = members.filter((member) => member.status === 'checked-in');
  const signedInGuests = guests.filter((guest) => guest.status === 'checked-in');
  const signedOutMembers = members.filter((member) => member.status === 'checked-out');
  const signedOutGuests = guests.filter((guest) => guest.status === 'checked-out');

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
            <Link
              key={guest.id}
              to={`/guest-sign-out?guestId=${encodeURIComponent(guest.id)}`}
              className={`public-status-row signed-in guest clickable ${guest.isOpenHouse ? 'open-house' : ''} ${afterReviewTime ? 'needs-review' : ''}`}
            >
              <div>
                <strong>{guest.name}</strong>
                <span>
                  {guest.isOpenHouse ? 'Open House' : 'Guest'} - {formatTime(guest.checkInTime)}
                </span>
              </div>
              <em className="guest-sign-out-hint">Tap to sign out</em>
              {afterReviewTime && <em>Still checked in after 9:00 PM</em>}
              {afterForceTime && <em className="force-due">System force checkout due at 9:30 PM</em>}
            </Link>
          ))}
          {signedInMembers.length === 0 && signedInGuests.length === 0 && (
            <div className="public-status-empty">No one is signed in yet.</div>
          )}
        </div>
      ) : (
        <div className="public-status-list">
          <div className="public-status-count out">
            <strong>{signedOutMembers.length + signedOutGuests.length}</strong>
            <span>signed out tonight</span>
          </div>
          {signedOutMembers.map((member) => (
            <div key={member.id} className="public-status-row signed-out">
              <div>
                <strong>{member.name}</strong>
                <span>
                  {member.grade} - {formatTime(member.checkOutTime)}
                </span>
                {member.forceAction && member.forceNote && (
                  <em className={member.forceType === 'system' ? 'force-system' : 'force-admin'}>
                    {member.forceType === 'system' ? 'System force logout' : 'Admin force logout'}: {member.forceNote}
                  </em>
                )}
              </div>
            </div>
          ))}
          {signedOutGuests.length > 0 && <div className="public-status-section-label">Guests</div>}
          {signedOutGuests.map((guest) => (
            <div
              key={guest.id}
              className={`public-status-row signed-out guest ${guest.isOpenHouse ? 'open-house' : ''}`}
            >
              <div>
                <strong>{guest.name}</strong>
                <span>
                  {guest.isOpenHouse ? 'Open House' : 'Guest'} - {formatTime(guest.checkOutTime)}
                </span>
                {guest.forceAction && guest.forceNote && (
                  <em className={guest.forceType === 'system' ? 'force-system' : 'force-admin'}>
                    {guest.forceType === 'system' ? 'System force logout' : 'Admin force logout'}: {guest.forceNote}
                  </em>
                )}
              </div>
            </div>
          ))}
          {signedOutMembers.length === 0 && signedOutGuests.length === 0 && (
            <div className="public-status-empty">No one has signed out yet.</div>
          )}
        </div>
      )}
    </aside>
  );
}

export default function PublicKiosk({ attendance }) {
  const { members, guests, settings } = attendance;
  const { now, dateStr, timeStr } = useLocalTime();
  const meetingStatus = getMeetingStatus(settings, now);
  const logoSrc = `${import.meta.env.BASE_URL}squadron-logo.jpeg`;

  return (
    <div className="public-kiosk-page">
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

          <KioskStatusPanel
            members={members}
            guests={guests}
            now={now}
            meetingEnd={settings.meetingEnd}
          />
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
          <Link to="/guest-sign-out" className="public-action-button guest-out">
            <span>GUEST SIGN OUT</span>
            <small>End guest visit</small>
          </Link>
          <Link to="/admin-login" className="public-action-button admin">
            <span>ADMIN LOGIN</span>
            <small>Senior member tools</small>
          </Link>
        </div>
        <div className="public-kiosk-secondary-actions">
          <Link to="/open-house" className="public-action-button open-house">
            <span>OPEN HOUSE</span>
            <small>Self-service visitor sign-in</small>
          </Link>
        </div>
        <p className="kiosk-footer-pin-help">
          New or forgot PIN? Tap Check In, select your name, and create a PIN if none exists yet.
        </p>
        <BuiltByCredit />
      </footer>
    </div>
  );
}
