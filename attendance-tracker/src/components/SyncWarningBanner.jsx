import { SYNC_UNAVAILABLE } from '../services/attendanceService';

/**
 * Prominent connection status. Distinguishes Offline (never synced) from
 * Reconnecting (synced before, connection dropped) and shows the last successful
 * Firestore sync time so operators never mistake a stale cache for live data.
 */
export default function SyncWarningBanner({ isSyncAvailable, syncError, syncState, lastSyncedAt }) {
  if (isSyncAvailable !== false) return null;

  const reconnecting = syncState === 'reconnecting';
  const label = reconnecting ? 'Reconnecting to cloud…' : 'Offline — not syncing';
  const lastSync = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div className="sync-warning-banner" role="status">
      <strong>{label}</strong>{' '}
      {lastSync
        ? `Last successful sync at ${lastSync}. Changes are NOT saved to the cloud until reconnected.`
        : syncError || SYNC_UNAVAILABLE}
    </div>
  );
}
