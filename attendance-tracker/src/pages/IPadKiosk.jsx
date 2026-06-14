import { useState } from 'react';
import CheckInWizard from '../components/CheckInWizard';
import CheckoutReminder from '../components/CheckoutReminder';
import KioskModeBanner from '../components/KioskModeBanner';
import LocalClock from '../components/LocalClock';
import { formatTime, getInitials } from '../data/mockData';
import { useLocalTime } from '../hooks/useLocalTime';
import { isAfterSignOutReviewTime, isAfterSystemForceCheckoutTime } from '../utils/timeRules';

export default function IPadKiosk({ attendance }) {
  const {
    members,
    guests,
    settings,
    searchMembers,
    verifyPin,
    checkInMember,
    checkOutMember,
    isFirebase,
    isKioskMode,
    memberHasPin,
    needsPinSetup,
    createMemberPin,
  } = attendance;
  const [mode, setMode] = useState('check-in');
  const { now } = useLocalTime();
  const afterReviewTime = isAfterSignOutReviewTime(now);
  const afterForceTime = isAfterSystemForceCheckoutTime(now);
  const logoSrc = `${import.meta.env.BASE_URL}squadron-logo.jpeg`;

  const checkedInMembers = members.filter((member) => member.status === 'checked-in');
  const checkedInGuests = guests.filter((guest) => guest.status === 'checked-in');
  const totalPresent = checkedInMembers.length + checkedInGuests.length;

  return (
    <div className="ipad-kiosk-root">
      {isKioskMode && <KioskModeBanner settings={settings} />}
      <header className="ipad-kiosk-header">
        <div className="ipad-brand">
          <img src={logoSrc} alt="Squadron Logo" />
          <div>
            <span>{settings.squadronDesignator}</span>
            <h1>Attendance Kiosk</h1>
            <p>{settings.squadronName}</p>
          </div>
        </div>
        <div className="ipad-clock">
          <LocalClock />
        </div>
      </header>

      <div className="ipad-mode-toggle" role="group" aria-label="Attendance mode">
        <button
          type="button"
          className={mode === 'check-in' ? 'active in' : ''}
          onClick={() => setMode('check-in')}
        >
          Check In
        </button>
        <button
          type="button"
          className={mode === 'check-out' ? 'active out' : ''}
          onClick={() => setMode('check-out')}
        >
          Check Out
        </button>
      </div>

      <CheckoutReminder />

      <main className="ipad-kiosk-layout">
        <section className="ipad-kiosk-action">
          <CheckInWizard
            key={mode}
            members={members}
            searchMembers={searchMembers}
            verifyPin={verifyPin}
            onCheckIn={checkInMember}
            onCheckOut={checkOutMember}
            mode={mode}
            isFirebase={isFirebase}
            memberHasPin={memberHasPin}
            needsPinSetup={needsPinSetup}
            createMemberPin={createMemberPin}
            refreshOnSuccess
          />
        </section>

        <aside className="ipad-present-panel" aria-label="Currently checked in">
          <div className="ipad-present-header">
            <div>
              <p>Currently Present</p>
              <h2>{totalPresent}</h2>
            </div>
            <span>{checkedInMembers.length} members</span>
          </div>

          <div className="ipad-present-list">
            {checkedInMembers.slice(0, 14).map((member) => (
              <div className={`ipad-present-row ${afterReviewTime ? 'needs-review' : ''}`} key={member.id}>
                <span className="ipad-present-avatar">{getInitials(member.name)}</span>
                <span>
                  <strong>{member.name}</strong>
                  <small>{member.grade} <span aria-hidden="true">&bull;</span> {formatTime(member.checkInTime)}</small>
                  {afterReviewTime && <small className="ipad-review-note">Still checked in after 9:00 PM</small>}
                  {afterForceTime && <small className="ipad-review-note force-due">System force checkout due at 9:30 PM</small>}
                </span>
              </div>
            ))}

            {checkedInGuests.slice(0, 4).map((guest) => (
              <div className={`ipad-present-row guest ${afterReviewTime ? 'needs-review' : ''}`} key={guest.id}>
                <span className="ipad-present-avatar">{guest.name.slice(0, 1)}</span>
                <span>
                  <strong>{guest.name}</strong>
                  <small>Guest <span aria-hidden="true">&bull;</span> {formatTime(guest.checkInTime)}</small>
                  {afterReviewTime && <small className="ipad-review-note">Still checked in after 9:00 PM</small>}
                  {afterForceTime && <small className="ipad-review-note force-due">System force checkout due at 9:30 PM</small>}
                </span>
              </div>
            ))}

            {totalPresent === 0 && (
              <div className="ipad-present-empty">No one is currently checked in.</div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
