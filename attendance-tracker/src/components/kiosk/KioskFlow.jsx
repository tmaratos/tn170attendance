import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './icons';

export function KioskStepHeader({ steps, current }) {
  return (
    <ol className="k-steps" aria-label={`Step ${current + 1} of ${steps.length}: ${steps[current]}`}>
      {steps.map((label, i) => (
        <li key={label} className={`k-step ${i === current ? 'active' : ''} ${i < current ? 'done' : ''}`}>
          <span className="k-step-num" aria-hidden="true">{i < current ? '✓' : i + 1}</span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

export function KioskMemberResultCard({ title, subtitle, initials, selected, disabled, onSelect }) {
  if (disabled) {
    return (
      <div className="k-result disabled">
        <span className="k-avatar" aria-hidden="true">{initials}</span>
        <span className="k-result-body"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</span>
      </div>
    );
  }
  return (
    <button type="button" className={`k-result ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <span className="k-avatar" aria-hidden="true">{initials}</span>
      <span className="k-result-body"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</span>
    </button>
  );
}

/** State/validation/empty message. Communicates via icon + text (never color alone). */
export function KioskStateMessage({ type = 'info', children }) {
  const icon = type === 'error' || type === 'warn' ? 'alert' : 'info';
  return (
    <div className={`k-state ${type}`} role={type === 'error' ? 'alert' : 'status'} aria-live={type === 'error' ? 'assertive' : 'polite'}>
      <Icon name={icon} size={20} />
      <span>{children}</span>
    </div>
  );
}

/**
 * Terminal success screen: exact action + name + timestamp, a Done button, auto-return
 * home after ~5s, cancelled if the user interacts (so they can read it), announced via
 * an aria-live region.
 */
export function KioskSuccessScreen({ title, name, meta, autoReturnSeconds = 5 }) {
  const navigate = useNavigate();
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (cancelled) return undefined;
    const id = window.setTimeout(() => navigate('/'), autoReturnSeconds * 1000);
    return () => window.clearTimeout(id);
  }, [cancelled, autoReturnSeconds, navigate]);

  return (
    <div
      className="k-success"
      role="status"
      aria-live="assertive"
      onPointerDown={() => setCancelled(true)}
      onKeyDownCapture={() => setCancelled(true)}
    >
      <div className="k-success-badge"><Icon name="check" size={48} /></div>
      <h2>{title}</h2>
      {name && <span className="k-success-name">{name}</span>}
      {meta && <span className="k-success-meta">{meta}</span>}
      <div className="k-btn-row" style={{ maxWidth: '20rem', margin: '1.25rem auto 0' }}>
        <button type="button" className="k-btn k-btn-primary" onClick={() => navigate('/')}>Done</button>
      </div>
      <p className="k-success-return">{cancelled ? 'Tap Done when you’re ready.' : 'Returning to the home screen…'}</p>
    </div>
  );
}
