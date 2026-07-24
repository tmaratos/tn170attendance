import { KioskShell } from '../components/kiosk/KioskChrome';
import KioskActionCard from '../components/kiosk/KioskActionCard';
import KioskStatusPanel from '../components/kiosk/KioskStatusPanel';
import CheckoutReminder from '../components/CheckoutReminder';
import { useEasternClock, easternMeetingStatus } from '../hooks/useEasternClock';

export default function PublicKiosk({ attendance }) {
  const { settings, getStats, syncState } = attendance;
  const stats = getStats();
  const clock = useEasternClock();
  const meeting = easternMeetingStatus(settings, clock);

  return (
    <KioskShell settings={settings} syncState={syncState || 'connected'}>
      <section className="k-welcome">
        <span className="k-eyebrow">Welcome to TN-170</span>
        <h1>Welcome — what would you like to do?</h1>
        <p>Touch an option below to get started.</p>
      </section>

      <CheckoutReminder />

      <div className="k-landing">
        <div className="k-actions">
          <KioskActionCard
            to="/member"
            variant="primary"
            icon="member"
            tag="Primary action"
            title="Member or Cadet"
            subtitle="Check in or check out for today’s meeting or activity."
            cta="Check in / Check out"
          />
          <KioskActionCard
            to="/guest"
            variant="gold"
            icon="guest"
            title="Guest or Visitor"
            subtitle="Sign in, sign out, or attend an open house."
            cta="Guest options"
          />
          <KioskActionCard
            to="/admin-login"
            variant="navy"
            icon="admin"
            title="Senior Member Login"
            subtitle="Access senior member tools and administrative options."
            cta="Admin login"
          />
        </div>

        <KioskStatusPanel
          presentCount={stats.checkedIn}
          guestCount={stats.guestsPresent}
          meetingLabel={meeting.label}
        />
      </div>
    </KioskShell>
  );
}
