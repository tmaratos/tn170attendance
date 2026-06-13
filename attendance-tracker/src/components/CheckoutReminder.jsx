import { useLocalTime } from '../hooks/useLocalTime';

const REMINDER_START = 20 * 60 + 45;
const URGENT_START = 20 * 60 + 55;
const ENDED_START = 21 * 60;

function getReminderState(now) {
  const minutes = now.getHours() * 60 + now.getMinutes();

  if (minutes >= ENDED_START) {
    return {
      level: 'ended',
      title: 'Meeting ended',
      message: 'Please check out before leaving if you are still checked in.',
    };
  }

  if (minutes >= URGENT_START) {
    return {
      level: 'urgent',
      title: 'Checkout reminder',
      message: 'Meeting ends soon. Please check out before leaving.',
    };
  }

  if (minutes >= REMINDER_START) {
    return {
      level: 'notice',
      title: 'Checkout reminder',
      message: 'As you wrap up, remember to check out before leaving.',
    };
  }

  return null;
}

export default function CheckoutReminder() {
  const { now } = useLocalTime();
  const reminder = getReminderState(now);

  if (!reminder) return null;

  return (
    <div
      className={`checkout-reminder checkout-reminder-${reminder.level}`}
      role="status"
      aria-live="polite"
    >
      <strong>{reminder.title}</strong>
      <span>{reminder.message}</span>
    </div>
  );
}
