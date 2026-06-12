import { formatTime } from '../data/mockData';

export default function GuestTable({ guests }) {
  if (!guests.length) {
    return <div className="empty-state">No guests present</div>;
  }

  return (
    <div className="table-scroll">
      <table className="data-table">
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
                <span className="member-name">{guest.name}</span>
              </td>
              <td>{guest.hostName}</td>
              <td>{formatTime(guest.checkInTime)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
