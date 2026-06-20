import { formatTime } from '../data/mockData';
import { useLocalTime } from '../hooks/useLocalTime';
import { formatGuestPhone } from '../services/guestService';
import { isAfterSignOutReviewTime, isAfterSystemForceCheckoutTime } from '../utils/timeRules';

export default function GuestTable({ guests, compact = false, meetingEnd }) {
  const { now } = useLocalTime();
  const afterReviewTime = isAfterSignOutReviewTime(now, meetingEnd);
  const afterForceTime = isAfterSystemForceCheckoutTime(now, meetingEnd);

  if (!guests.length) {
    return <div className="empty-state">No guests present</div>;
  }

  return (
    <div className={compact ? 'table-scroll-sm' : 'table-scroll'}>
      <table className="data-table guest-table">
        <thead>
          <tr>
            <th>Guest Name</th>
            <th>Hosted By</th>
            <th>Check In Time</th>
          </tr>
        </thead>
        <tbody>
          {guests.map((guest) => {
            const needsReview = afterReviewTime && guest.status === 'checked-in' && !guest.checkOutTime;
            const forceDue = afterForceTime && guest.status === 'checked-in' && !guest.checkOutTime;
            const forceType = guest.forceType || (
              guest.forceNote?.toLowerCase().includes('system') ? 'system' : 'admin'
            );
            return (
              <tr key={guest.id} className={forceDue || needsReview ? 'needs-signout-review' : ''}>
                <td>
                  <div className="guest-cell">
                    <div className="avatar guest-avatar">{guest.name.slice(0, 1)}</div>
                    <div className="guest-cell-details">
                      <span className="member-name">{guest.name}</span>
                      {guest.isOpenHouse && (guest.email || guest.phone) && (
                        <span className="guest-contact-info">
                          {[guest.email, guest.phone ? formatGuestPhone(guest.phone) : null].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {needsReview && (
                        <span className="review-warning">Still checked in after 9:00 PM</span>
                      )}
                      {forceDue && (
                        <span className="force-note due">System force checkout due at 9:30 PM.</span>
                      )}
                      {guest.forceAction && guest.forceNote && (
                        <span className={`force-note ${forceType}`}>
                          {forceType === 'system' ? 'System force logout' : 'Admin force logout'}: {guest.forceNote}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td>{guest.isOpenHouse ? 'Open House' : guest.hostName || '—'}</td>
                <td className="time-cell in">{formatTime(guest.checkInTime)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
