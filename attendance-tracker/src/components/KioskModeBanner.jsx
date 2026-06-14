export default function KioskModeBanner({ settings }) {
  return (
    <div className="kiosk-mode-banner" role="status">
      <strong>Kiosk mode</strong>
      <span>
        Member roster from Firebase - attendance and PINs stored on this device only
        {settings?.squadronDesignator ? ` (${settings.squadronDesignator})` : ''}
      </span>
    </div>
  );
}
