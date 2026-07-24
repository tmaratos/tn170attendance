import { KioskShell, KioskFlowTopBar } from '../components/kiosk/KioskChrome';
import KioskActionCard from '../components/kiosk/KioskActionCard';

export default function MemberHub({ attendance }) {
  const { settings, syncState } = attendance;
  return (
    <KioskShell settings={settings} syncState={syncState || 'connected'} header={false}>
      <div className="k-flow">
        <KioskFlowTopBar />
        <section className="k-flow-card">
          <span className="k-flow-eyebrow">Member or Cadet</span>
          <h1 className="k-flow-title">What would you like to do?</h1>
          <p className="k-hint" style={{ marginTop: '0.5rem' }}>
            Check in when you arrive, or check out when you leave.
          </p>
          <div className="k-actions" style={{ marginTop: '1rem' }}>
            <KioskActionCard
              to="/check-in"
              variant="primary"
              icon="member"
              title="Check In"
              subtitle="Sign in for today’s meeting or activity."
              cta="Check in"
            />
            <KioskActionCard
              to="/check-out"
              variant="navy"
              icon="logout"
              title="Check Out"
              subtitle="Sign out at the end of the meeting."
              cta="Check out"
            />
          </div>
        </section>
      </div>
    </KioskShell>
  );
}
