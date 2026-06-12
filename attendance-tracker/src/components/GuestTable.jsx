import { formatTime } from '../data/mockData';

export default function GuestTable({ guests, compact = false }) {
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
          {guests.map((guest) => (
            <tr key={guest.id}>
              <td>
                <div className="guest-cell">
                  <div className="avatar guest-avatar">{guest.name.slice(0, 1)}</div>
                  <span className="member-name">{guest.name}</span>
                </div>
              </td>
              <td>{guest.hostName}</td>
              <td className="time-cell in">{formatTime(guest.checkInTime)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
