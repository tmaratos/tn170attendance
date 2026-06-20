import { formatTime, getInitials } from '../data/mockData';
import { useLocalTime } from '../hooks/useLocalTime';
import { isAfterSignOutReviewTime, isAfterSystemForceCheckoutTime } from '../utils/timeRules';

export default function AttendanceTable({
  members,
  showCheckOut = false,
  compact = false,
  meetingEnd,
}) {
  const { now } = useLocalTime();
  const afterReviewTime = isAfterSignOutReviewTime(now, meetingEnd);
  const afterForceTime = isAfterSystemForceCheckoutTime(now, meetingEnd);

  if (!members.length) {
    return <div className="empty-state">No members to display</div>;
  }

  return (
    <div className={compact ? 'table-scroll-sm' : 'table-scroll'}>
      <table className="data-table attendance-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>{showCheckOut ? 'Check Out Time' : 'Check In Time'}</th>
            <th aria-label="Status"></th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const needsReview = afterReviewTime && member.status === 'checked-in' && !member.checkOutTime;
            const forceDue = afterForceTime && member.status === 'checked-in' && !member.checkOutTime;
            const forceType = member.forceType || (
              member.forceNote?.toLowerCase().includes('system') ? 'system' : 'admin'
            );
            return (
              <tr key={member.id} className={forceDue || needsReview ? 'needs-signout-review' : ''}>
                <td>
                  <div className="member-cell">
                    <div className="avatar">{getInitials(member.name)}</div>
                    <div className="member-info">
                      <span className="member-name">{member.name}</span>
                      <span className="member-meta">
                        {member.grade} <span aria-hidden="true">&bull;</span> CAPID: {member.capid}
                      </span>
                      {needsReview && (
                        <span className="review-warning">Still checked in after 9:00 PM</span>
                      )}
                      {forceDue && (
                        <span className="force-note due">System force checkout due at 9:30 PM.</span>
                      )}
                      {member.forceAction && member.forceNote && (
                        <span className={`force-note ${forceType}`}>
                          {forceType === 'system' ? 'System force logout' : 'Admin force logout'}: {member.forceNote}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  <span
                    className={`role-badge ${
                      member.role === 'Senior Member' ? 'senior' : 'cadet'
                    }`}
                  >
                    {member.role}
                  </span>
                </td>
                <td className={`time-cell ${showCheckOut ? 'out' : 'in'}`}>
                  {formatTime(showCheckOut ? member.checkOutTime : member.checkInTime)}
                </td>
                <td>
                  <span
                    className={`status-dot ${showCheckOut ? 'out' : 'in'}`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
