import { formatTime, getInitials } from '../data/mockData';

export default function AttendanceTable({ members, showCheckOut = false }) {
  if (!members.length) {
    return <div className="empty-state">No members to display</div>;
  }

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>{showCheckOut ? 'Check Out Time' : 'Check In Time'}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id}>
              <td>
                <div className="member-cell">
                  <div className="avatar">{getInitials(member.name)}</div>
                  <div className="member-info">
                    <span className="member-name">{member.name}</span>
                    <span className="member-meta">
                      {member.grade} • CAPID {member.capid}
                    </span>
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
              <td>
                {formatTime(showCheckOut ? member.checkOutTime : member.checkInTime)}
              </td>
              <td>
                <span
                  className={`status-dot ${showCheckOut ? 'out' : 'in'}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
