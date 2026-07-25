import { useEasternClock } from '../hooks/useEasternClock';
import Icon from './kiosk/icons';

const REMINDER_START = 20 * 60 + 45;
const URGENT_START = 20 * 60 + 55;
const ENDED_START = 21 * 60;

function getReminderState(minutes) {
  if (minutes >= ENDED_START) {
    return {
      tone: 'warn',
      title: 'Meeting ended',
      message: 'Still checked in? Please check out before you leave.',
    };
  }
  if (minutes >= URGENT_START) {
    return {
      tone: 'warn',
      title: 'Checkout reminder',
      message: 'The meeting ends soon — please check out before leaving.',
    };
  }
  if (minutes >= REMINDER_START) {
    return {
      tone: 'info',
      title: 'Checkout reminder',
      message: 'As you wrap up, remember to check out before leaving.',
    };
  }
  return null;
}

/**
 * Eastern-time checkout reminder banner. Renders only inside the wind-down window
 * near the end of the meeting. Communicates with an icon + text (never color alone).
 */
export default function CheckoutReminder() {
  const clock = useEasternClock();
  const reminder = getReminderState(clock.hour * 60 + clock.minute);
  if (!reminder) return null;

  return (
    <div className={`k-state ${reminder.tone}`} role="status" aria-live="polite">
      <Icon name={reminder.tone === 'warn' ? 'alert' : 'clock'} size={20} />
      <span>
        <strong>{reminder.title}.</strong> {reminder.message}
      </span>
    </div>
  );
}
