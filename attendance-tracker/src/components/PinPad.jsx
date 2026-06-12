export default function PinPad({ pin, onDigit, onBackspace, onClear, maxLength = 4, compact = false }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

  const handleKey = (key) => {
    if (key === 'clear') onClear();
    else if (key === 'back') onBackspace();
    else if (pin.length < maxLength) onDigit(key);
  };

  return (
    <div>
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
            onClick={() => handleKey(key)}
          >
            {key === 'back' ? '⌫' : key === 'clear' ? 'CLR' : key}
          </button>
        ))}
      </div>
    </div>
  );
}
