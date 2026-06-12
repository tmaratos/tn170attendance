import { useState } from 'react';
import CheckInWizard from '../components/CheckInWizard';

export default function CheckIn({ attendance }) {
  const { members, searchMembers, verifyPin, checkInMember, checkOutMember } = attendance;
  const [mode, setMode] = useState('check-in');

  return (
    <div className="kiosk-page">
      <div className="kiosk-mode-toggle">
        <button
          type="button"
          className={`btn ${mode === 'check-in' ? 'btn-green' : 'btn-outline'}`}
          onClick={() => setMode('check-in')}
        >
          Check In
        </button>
        <button
          type="button"
          className={`btn ${mode === 'check-out' ? 'btn-red' : 'btn-outline'}`}
          onClick={() => setMode('check-out')}
        >
          Check Out
        </button>
      </div>
      <CheckInWizard
        key={mode}
        members={members}
        searchMembers={searchMembers}
        verifyPin={verifyPin}
        onCheckIn={checkInMember}
        onCheckOut={checkOutMember}
        mode={mode}
      />
    </div>
  );
}
