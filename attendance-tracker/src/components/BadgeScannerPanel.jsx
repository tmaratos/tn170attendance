import { useEffect, useRef, useState } from 'react';
import { extractCapid, isFormControl, SCANNER_GAP_MS } from '../utils/scanner';
import { getCallableError } from '../services/errors';

function ScannerIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 5v4M3 5h4M21 5v4M21 5h-4M3 19v-4M3 19h4M21 19v-4M21 19h-4" />
      <path d="M7 9v6M10 8v8M13 9v6M16 8v8" />
    </svg>
  );
}

export default function BadgeScannerPanel({ attendance }) {
  const {
    members,
    forceCheckInMember,
    forceCheckOutMember,
    seniorSession,
  } = attendance;
  const [adminPin, setAdminPin] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState('toggle');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const buffer = useRef('');
  const lastKeyAt = useRef(0);
  const busyRef = useRef(false);
  const pinRef = useRef('');
  const modeRef = useRef('toggle');
  const membersRef = useRef(members);

  useEffect(() => { pinRef.current = adminPin; }, [adminPin]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { membersRef.current = members; }, [members]);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  useEffect(() => {
    if (!enabled) return undefined;

    const processScan = async (raw) => {
      if (busyRef.current) return;
      const capid = extractCapid(raw);
      if (!capid) {
        setResult({ tone: 'error', title: 'Badge not recognized', detail: 'Badge must contain a 6–8 digit CAPID.' });
        return;
      }
      const member = membersRef.current.find((item) =>
        String(item.capid || item.memberId || item.id) === capid
      );
      if (!member) {
        setResult({ tone: 'error', title: `CAPID ${capid} not found`, detail: 'Use Roster to confirm the member is active.' });
        return;
      }

      const action = modeRef.current === 'toggle'
        ? (member.status === 'checked-in' ? 'check-out' : 'check-in')
        : modeRef.current;
      setBusy(true);
      busyRef.current = true;
      try {
        if (action === 'check-in') {
          await forceCheckInMember(member.id, pinRef.current, 'Badge scanner check-in');
        } else {
          await forceCheckOutMember(member.id, pinRef.current, 'Badge scanner check-out');
        }
        setResult({
          tone: 'success',
          title: `${member.name} checked ${action === 'check-in' ? 'in' : 'out'}`,
          detail: `CAPID ${capid} • Ready for the next badge`,
        });
      } catch (error) {
        setResult({
          tone: 'error',
          title: 'Scan could not be completed',
          detail: getCallableError(error) || error.message || 'Try again or use Manual Corrections.',
        });
      } finally {
        setBusy(false);
        busyRef.current = false;
      }
    };

    const onKeyDown = (event) => {
      if (isFormControl(event.target)) return;
      const now = Date.now();
      if (now - lastKeyAt.current > SCANNER_GAP_MS) buffer.current = '';
      lastKeyAt.current = now;

      if (event.key === 'Enter' || event.key === 'Tab') {
        if (buffer.current) {
          event.preventDefault();
          const raw = buffer.current;
          buffer.current = '';
          processScan(raw);
        }
        return;
      }
      if (event.key.length === 1) buffer.current += event.key;
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, forceCheckInMember, forceCheckOutMember]);

  const canEnable = Boolean(seniorSession && adminPin.length === 4);

  return (
    <section className={`operator-card scanner-card ${enabled ? 'scanner-live' : ''}`} aria-labelledby="scanner-title">
      <div className="operator-card-heading">
        <span className="operator-card-icon scanner"><ScannerIcon /></span>
        <div>
          <div className="eyebrow">Recommended for the front desk</div>
          <h2 id="scanner-title">Badge scanner</h2>
          <p>Works with USB or wireless scanners that act like a keyboard and send Enter after each badge.</p>
        </div>
        <span className={`scanner-state ${enabled ? 'live' : ''}`}>
          <span className="scanner-dot" />{enabled ? 'Listening' : 'Off'}
        </span>
      </div>

      <div className="scanner-setup">
        <div>
          <label htmlFor="scanner-pin">Your 4-digit admin PIN</label>
          <input
            id="scanner-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength="4"
            value={adminPin}
            onChange={(event) => setAdminPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            disabled={enabled}
            placeholder="••••"
          />
          <small>Entered once per browser session; it is not saved.</small>
        </div>
        <div>
          <label htmlFor="scanner-mode">What a scan does</label>
          <select id="scanner-mode" value={mode} onChange={(event) => setMode(event.target.value)} disabled={enabled}>
            <option value="toggle">Smart: check in or out</option>
            <option value="check-in">Check in only</option>
            <option value="check-out">Check out only</option>
          </select>
        </div>
        <button
          type="button"
          className={`scanner-toggle ${enabled ? 'stop' : ''}`}
          disabled={!enabled && !canEnable}
          onClick={() => {
            setResult(null);
            setEnabled((value) => !value);
          }}
        >
          {enabled ? 'Stop scanner' : 'Start scanner'}
        </button>
      </div>

      {enabled && (
        <div className="scanner-ready" aria-live="polite">
          {busy ? (
            <><strong>Processing badge…</strong><span>Please wait before scanning the next person.</span></>
          ) : result ? (
            <><strong className={result.tone}>{result.title}</strong><span>{result.detail}</span></>
          ) : (
            <><strong>Scanner ready</strong><span>Scan any active member badge. No field needs to be selected.</span></>
          )}
        </div>
      )}

      <details className="scanner-help">
        <summary>Scanner setup for iPad or laptop</summary>
        <ol>
          <li>Use a scanner in <strong>USB HID keyboard</strong> mode.</li>
          <li>Program it to send an <strong>Enter suffix</strong> after every scan.</li>
          <li>Connect its dongle through a data-capable iPad adapter or directly to the laptop.</li>
          <li>Open this dashboard, enter the operator PIN once, and tap <strong>Start scanner</strong>.</li>
        </ol>
        <p>The badge barcode must contain the member’s 6–8 digit CAPID. Test one badge before the line begins.</p>
      </details>
    </section>
  );
}

