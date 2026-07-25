import PublicKiosk from './PublicKiosk';

/**
 * The dedicated iPad/kiosk route now shares the exact same responsive landing as
 * the public kiosk home, so there is a single kiosk experience to maintain.
 */
export default function IPadKiosk({ attendance }) {
  return <PublicKiosk attendance={attendance} />;
}
