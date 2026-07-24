import Icon from './icons';

/**
 * Landing status card. Shows counts only — NEVER a public list of member names
 * or CAPIDs. Friendly empty state when no one is signed in.
 */
export default function KioskStatusPanel({ presentCount = 0, guestCount = 0, memberCount = 0, meetingLabel = 'Meeting' }) {
  const totalPresent = presentCount + guestCount;
  return (
    <aside className="k-panel" aria-label="Attendance status">
      <div className="k-panel-head">
        <h2>Currently present</h2>
        <span className="k-meeting-sub"><Icon name="clock" size={14} /> {meetingLabel}</span>
      </div>
      <div className="k-panel-body">
        {totalPresent === 0 ? (
          <div className="k-empty">
            <div className="k-empty-icon"><Icon name="people" size={26} /></div>
            <h3>No one is signed in yet.</h3>
            <p>Be the first to check in!</p>
          </div>
        ) : (
          <>
            <div className="k-count">
              <b>{totalPresent}</b>
              <span>signed in now</span>
            </div>
            <div className="k-panel-stats">
              <div className="k-stat"><b>{presentCount}</b><span>Members present</span></div>
              <div className="k-stat"><b>{guestCount}</b><span>Guests present</span></div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
