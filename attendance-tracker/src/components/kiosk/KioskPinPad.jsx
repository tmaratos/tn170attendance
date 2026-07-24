import { useEffect, useRef } from 'react';
import Icon from './icons';

/**
 * Accessible 4-digit numeric PIN pad. Four indicators, digits 0–9, backspace,
 * clear, physical-keyboard support, screen-reader labels, disabled while submitting.
 */
export default function KioskPinPad({ value = '', onChange, disabled = false, label = 'PIN' }) {
  const groupRef = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const set = (next) => {
    if (!disabled) onChange(next);
  };
  const press = (d) => set((valueRef.current + d).slice(0, 4));
  const back = () => set(valueRef.current.slice(0, -1));
  const clear = () => set('');

  useEffect(() => {
    const el = groupRef.current;
    if (!el) return undefined;
    const handler = (e) => {
      if (disabled) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        back();
      } else if (e.key === 'Delete' || e.key === 'Escape') {
        e.preventDefault();
        clear();
      }
    };
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return (
    <div className="k-pin" ref={groupRef} role="group" aria-label={`${label} entry`}>
      <div className="k-pin-dots" role="status" aria-live="polite" aria-label={`${value.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`k-pin-dot ${i < value.length ? 'filled' : ''}`} />
        ))}
      </div>
      <div className="k-pin-keys">
        {digits.map((d) => (
          <button key={d} type="button" className="k-key" onClick={() => press(d)} disabled={disabled || value.length >= 4} aria-label={`Digit ${d}`}>
            {d}
          </button>
        ))}
        <button type="button" className="k-key util" onClick={clear} disabled={disabled || value.length === 0} aria-label="Clear PIN">
          Clear
        </button>
        <button type="button" className="k-key" onClick={() => press('0')} disabled={disabled || value.length >= 4} aria-label="Digit 0">
          0
        </button>
        <button type="button" className="k-key util" onClick={back} disabled={disabled || value.length === 0} aria-label="Delete last digit">
          <Icon name="backspace" size={22} />
        </button>
      </div>
    </div>
  );
}
