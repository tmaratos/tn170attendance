import { useLocalTime } from '../hooks/useLocalTime';

export default function LocalClock({ showSeconds = false }) {
  const { dateStr, timeStr, shortDateStr, shortTimeStr } = useLocalTime();

  return (
    <span>
      {showSeconds ? `${dateStr} - ${timeStr}` : `${shortDateStr} - ${shortTimeStr}`}
    </span>
  );
}
