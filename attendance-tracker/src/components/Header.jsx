import { useLocalTime } from '../hooks/useLocalTime';

export default function Header({ title, subtitle }) {
  const { shortDateStr, shortTimeStr } = useLocalTime();

  return (
    <header className="dashboard-header">
      <h1 className="dashboard-welcome">{title || 'Welcome!'}</h1>
      <p className="dashboard-datetime">
        {subtitle || `${shortDateStr} - ${shortTimeStr}`}
      </p>
    </header>
  );
}
