import { KioskShell, KioskFlowTopBar } from '../components/kiosk/KioskChrome';
import KioskActionCard from '../components/kiosk/KioskActionCard';

export default function GuestHub({ attendance }) {
  const { settings, syncState } = attendance;
  return (
    <KioskShell settings={settings} syncState={syncState || 'connected'} header={false}>
      <div className="k-flow">
        <KioskFlowTopBar />
        <section className="k-flow-card">
          <span className="k-flow-eyebrow">Guest or Visitor</span>
          <h1 className="k-flow-title">How can we help you today?</h1>
          <p className="k-hint" style={{ marginTop: '0.5rem' }}>
            Choose an option below. A senior member can help if you have questions.
          </p>
          <div className="k-actions" style={{ marginTop: '1rem' }}>
            <KioskActionCard
              to="/guest-sign-in"
              variant="gold"
              icon="guest"
              title="Guest Sign In"
              subtitle="Visiting with a squadron member? Sign in with your host."
              cta="Sign in"
            />
            <KioskActionCard
              to="/open-house"
              variant="primary"
              icon="door"
              title="Open House"
              subtitle="Here for an open house or public event? No host needed."
              cta="Open house sign-in"
            />
            <KioskActionCard
              to="/guest-sign-out"
              variant="navy"
              icon="logout"
              title="Guest Sign Out"
              subtitle="Leaving? Sign out so we know you got home safe."
              cta="Sign out"
            />
          </div>
        </section>
      </div>
    </KioskShell>
  );
}
