export default function KioskModeBanner({ settings, usingLocalRoster }) {
  const designator = settings?.squadronDesignator || 'TN-170';
  return (
    <div className="kiosk-mode-banner" role="status">
      <strong>Kiosk mode</strong>
      <span>
        {usingLocalRoster
          ? `Local TN-170 roster (${designator}) — attendance on this device; Firestore roster empty`
          : `Member roster from Firebase (${designator}) — attendance on this device; PINs stored in Firestore`}
      </span>
    </div>
  );
}
