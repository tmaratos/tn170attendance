import { SYNC_UNAVAILABLE } from '../services/attendanceService';

export default function SyncWarningBanner({ isSyncAvailable, syncError }) {
  if (isSyncAvailable !== false) return null;

  return (
    <div className="sync-warning-banner" role="status">
      {syncError || SYNC_UNAVAILABLE}
    </div>
  );
}
