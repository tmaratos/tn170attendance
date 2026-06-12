import { Link } from 'react-router-dom';

function StatIcon({ name }) {
  const common = {
    width: 34,
    height: 34,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  const paths = {
    green: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
        <circle cx="12" cy="7" r="4" />
        <path d="M20 8v6" />
        <path d="M23 11h-6" />
      </>
    ),
    red: (
      <>
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <path d="M10 17l5-5-5-5" />
        <path d="M15 12H3" />
      </>
    ),
    gold: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
        <circle cx="12" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M2 21v-2a4 4 0 0 1 3-3.87" />
      </>
    ),
    blue: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
        <circle cx="12" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M2 21v-2a4 4 0 0 1 3-3.87" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4" />
        <path d="M8 2v4" />
        <path d="M3 10h18" />
        <path d="M8 14h.01" />
        <path d="M12 14h.01" />
        <path d="M16 14h.01" />
        <path d="M8 18h.01" />
        <path d="M12 18h.01" />
      </>
    ),
  };

  return <svg {...common}>{paths[name] || paths.calendar}</svg>;
}

export default function StatCard({
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
  const iconName = color || 'calendar';

  return (
    <div className={`stat-card ${variant || ''}`}>
      <div className="stat-card-main">
        <span className={`stat-card-icon-wrap ${color || 'calendar'}`}>
          <StatIcon name={iconName} />
        </span>
        <div className="stat-card-copy">
          <div className="stat-card-header">{label}</div>
          {value != null && (
            <div className={`stat-card-value ${colorClass}`}>{value}</div>
          )}
          {subtext && <div className="stat-card-subtext">{subtext}</div>}
        </div>
      </div>
      {children}
      {linkTo && (
        <Link to={linkTo} className="stat-card-link">
          {linkText || 'View List'} <span aria-hidden="true">&rarr;</span>
        </Link>
      )}
    </div>
  );
}
