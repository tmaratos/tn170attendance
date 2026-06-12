import { formatTime } from '../data/mockData';

export default function GuestTable({ guests, compact = false }) {
  if (!guests.length) {
    return <div className="empty-state">No guests present</div>;
  }

  return (
    <div className={compact ? 'table-scroll-sm' : 'table-scroll'}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Guest Name</th>
            <th>Hosted By</th>
            <th>Check In</th>
          </tr>
        </thead>
        <tbody>
          {guests.map((guest) => (
            <tr key={guest.id}>
              <td>
                <span className="member-name">{guest.name}</span>
              </td>
              <td>{guest.hostName}</td>
              <td className="time-cell">{formatTime(guest.checkInTime)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
