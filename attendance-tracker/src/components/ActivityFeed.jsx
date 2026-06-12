import { Link } from 'react-router-dom';
import { formatTime } from '../data/mockData';

const ICON_MAP = {
  'check-in': '+',
  'check-out': '-',
  'guest-in': 'G',
  'guest-out': 'G',
  'force-in': '!',
  'force-out': '!',
};

export default function ActivityFeed({ activities, limit, showFooter = false }) {
  const items = limit ? activities.slice(0, limit) : activities;

  if (!items.length) {
    return <div className="empty-state">No recent activity</div>;
  }

  return (
    <>
      <ul className="activity-feed">
        {items.map((item) => (
          <li key={item.id} className="activity-item">
            <div className={`activity-icon ${item.type}`}>
              {ICON_MAP[item.type] || '-'}
            </div>
            <div className="activity-text">
              <div className="activity-message">{item.message}</div>
              <div className="activity-time">{formatTime(item.timestamp)}</div>
            </div>
          </li>
        ))}
      </ul>
      {showFooter && (
        <div className="panel-footer">
          <Link to="/attendance" className="panel-footer-link">
            View All Activity <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      )}
    </>
  );
}
