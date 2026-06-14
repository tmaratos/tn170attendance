export default function KioskModeBanner({ settings, usingLocalRoster }) {
  const designator = settings?.squadronDesignator || 'TN-170';
  return (
    <div className="kiosk-mode-banner" role="status">
      <strong>Kiosk mode</strong>
      <span>
        {usingLocalRoster
          ? `Local TN-170 roster (${designator}) — attendance and PINs on this device; Firestore roster empty`
          : `Member roster from Firebase (${designator}) — attendance and PINs stored on this device only`}
      </span>
    </div>
  );
}
