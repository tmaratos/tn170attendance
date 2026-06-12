import { Link } from 'react-router-dom';

const ICONS = {
  green: '✓',
  red: '✗',
  gold: '★',
  blue: '👥',
  calendar: '📅',
};

export default function StatCard({
  icon,
  label,
  value,
  subtext,
  color,
  linkTo,
  linkText,
  variant,
  children,
}) {
  const colorClass = color ? `text-${color}` : '';
  const iconChar = icon || ICONS[color] || ICONS.calendar;

  return (
    <div className={`stat-card ${variant || ''}`}>
      <div className="stat-card-header">
        <span className={`stat-card-icon-wrap ${color || ''}`}>{iconChar}</span>
        {label}
      </div>
      {value != null && (
        <div className={`stat-card-value ${colorClass}`}>{value}</div>
      )}
      {subtext && <div className="stat-card-subtext">{subtext}</div>}
      {children}
      {linkTo && (
        <Link to={linkTo} className="stat-card-link">
          {linkText || 'View List →'}
        </Link>
      )}
    </div>
  );
}
