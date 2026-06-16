import { useEffect, useRef } from 'react';

function digitFromKey(event) {
  if (/^\d$/.test(event.key)) return event.key;
  const match = event.code?.match(/^Numpad(\d)$/);
  if (match) return match[1];
  const digitMatch = event.code?.match(/^Digit(\d)$/);
  if (digitMatch) return digitMatch[1];
  return null;
}

export default function PinPad({
  pin,
  onDigit,
  onBackspace,
  onClear,
  maxLength = 4,
  compact = false,
  autoFocus = true,
}) {
  const inputRef = useRef(null);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

  useEffect(() => {
    if (!autoFocus) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [autoFocus]);

  const handleKey = (key) => {
    if (key === 'clear') onClear();
    else if (key === 'back') onBackspace();
    else if (pin.length < maxLength) onDigit(key);
  };

  const handleInputChange = (event) => {
    const next = event.target.value.replace(/\D/g, '').slice(0, maxLength);
    if (next === pin) return;

    if (next.length === 0) {
      onClear();
      return;
    }

    if (next.length < pin.length) {
      onBackspace();
      return;
    }

    if (next.length - pin.length > 1) {
      onClear();
      next.split('').forEach((digit) => onDigit(digit));
      return;
    }

    onDigit(next[next.length - 1]);
  };

  const handleInputKeyDown = (event) => {
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      onBackspace();
      return;
    }

    const digit = digitFromKey(event);
    if (digit !== null && pin.length < maxLength) {
      event.preventDefault();
      onDigit(digit);
    }
  };

  return (
    <div className="pin-pad-wrapper">
      <input
        ref={inputRef}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={maxLength}
        autoComplete="off"
        className="pin-keyboard-input"
        value={pin}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        aria-label="PIN entry"
      />
      <div className="pin-display">
        {Array.from({ length: maxLength }).map((_, i) => (
          <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />
        ))}
      </div>
      <div className={`pin-pad ${compact ? 'pin-pad-compact' : ''}`}>
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            className={`pin-key ${key === 'clear' || key === 'back' ? 'action' : ''}`}
            aria-label={key === 'back' ? 'Backspace' : key === 'clear' ? 'Clear' : `Digit ${key}`}
            onClick={() => handleKey(key)}
          >
            {key === 'back' ? '⌫' : key === 'clear' ? 'Clear' : key}
          </button>
        ))}
      </div>
    </div>
  );
}
