export default function PinPad({ pin, onDigit, onBackspace, onClear, maxLength = 4 }) {
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
      <div className="pin-pad">
        {keys.map((key) => (
          <button
            key={key}
            className={`pin-key ${key === 'clear' || key === 'back' ? 'action' : ''}`}
            onClick={() => handleKey(key)}
          >
            {key === 'back' ? '⌫' : key === 'clear' ? 'Clear' : key}
          </button>
        ))}
      </div>
    </div>
  );
}
