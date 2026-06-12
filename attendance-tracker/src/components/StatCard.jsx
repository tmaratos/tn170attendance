import { Link } from 'react-router-dom';

export default function StatCard({
  icon,
  label,
  value,
  color,
  linkTo,
  linkText,
  variant,
  children,
}) {
  const colorClass = color ? `text-${color}` : '';

  return (
    <div className={`stat-card ${variant || ''}`}>
      <div className="stat-card-header">
        {icon && <span className="stat-card-icon">{icon}</span>}
        {label}
      </div>
      <div className={`stat-card-value ${colorClass}`}>{value}</div>
      {children}
      {linkTo && (
        <Link to={linkTo} className="stat-card-link">
          {linkText || 'View List →'}
        </Link>
      )}
    </div>
  );
}
