import { formatTime } from '../data/mockData';

const ICON_MAP = {
  'check-in': '✓',
  'check-out': '✗',
  'guest-in': '★',
  'guest-out': '★',
  'force-in': '⚡',
  'force-out': '⚡',
};

export default function ActivityFeed({ activities, limit }) {
  const items = limit ? activities.slice(0, limit) : activities;

  if (!items.length) {
    return <div className="empty-state">No recent activity</div>;
  }

  return (
    <ul className="activity-feed">
      {items.map((item) => (
        <li key={item.id} className="activity-item">
          <div className={`activity-icon ${item.type}`}>
            {ICON_MAP[item.type] || '•'}
          </div>
          <div className="activity-text">
            <div className="activity-message">{item.message}</div>
            <div className="activity-time">{formatTime(item.timestamp)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
