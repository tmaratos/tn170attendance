import { Link } from 'react-router-dom';
import Icon from './icons';

/**
 * Large touch-friendly action card. `variant` sets the visual weight:
 *   primary → dominant operational blue (Member/Cadet)
 *   gold    → restrained CAP gold (Guest/Visitor)
 *   navy    → administrative (Senior Member Login)
 */
export default function KioskActionCard({ to, variant = 'navy', icon, tag, title, subtitle, cta }) {
  return (
    <Link to={to} className={`k-card ${variant}`}>
      <span className="k-card-icon"><Icon name={icon} size={40} /></span>
      <span className="k-card-body">
        {tag && (
          <span className="k-card-tag">
            {variant === 'primary' && <Icon name="check" size={12} />}
            {tag}
          </span>
        )}
        <span className="k-card-title">{title}</span>
        <span className="k-card-sub">{subtitle}</span>
        <span className="k-card-cta">
          {cta}
          <Icon name="arrow" size={18} />
        </span>
      </span>
    </Link>
  );
}
