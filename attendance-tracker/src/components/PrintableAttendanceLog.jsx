import { formatDuration, formatTime } from '../data/mockData';
import { useLocalTime } from '../hooks/useLocalTime';

function statusLabel(status) {
  if (status === 'checked-in') return 'Checked In';
  if (status === 'checked-out') return 'Checked Out';
  return 'Not Present';
}

function forceLabel(record) {
  if (!record.forceAction || !record.forceNote) return '';
  const type = record.forceType === 'system' ? 'System force logout' : 'Admin force logout';
  return `${type}: ${record.forceNote}`;
}

export default function PrintableAttendanceLog({ members, guests, settings }) {
  const { shortDateStr, shortTimeStr } = useLocalTime();
  const checkedIn = members.filter((member) => member.status === 'checked-in').length;
  const checkedOut = members.filter((member) => member.status === 'checked-out').length;
  const guestsPresent = guests.filter((guest) => guest.status === 'checked-in').length;

  return (
    <section className="print-attendance-log" aria-label="Printable attendance log">
      <header className="print-log-header">
        <div>
          <h1>{settings.squadronName}</h1>
          <p>{settings.squadronDesignator} Attendance Log</p>
        </div>
        <div>
          <strong>{shortDateStr}</strong>
          <span>Printed {shortTimeStr}</span>
        </div>
      </header>

      <div className="print-log-summary">
        <span>Checked In: {checkedIn}</span>
        <span>Checked Out: {checkedOut}</span>
        <span>Guests Present: {guestsPresent}</span>
        <span>Total Members: {members.length}</span>
      </div>

      <h2>Members</h2>
      <table className="print-log-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Grade</th>
            <th>CAPID</th>
            <th>Role</th>
            <th>Status</th>
            <th>Check In</th>
            <th>Check Out</th>
            <th>Duration</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id}>
              <td>{member.name}</td>
              <td>{member.grade}</td>
              <td>{member.capid}</td>
              <td>{member.role}</td>
              <td>{statusLabel(member.status)}</td>
              <td>{formatTime(member.checkInTime)}</td>
              <td>{formatTime(member.checkOutTime)}</td>
              <td>{formatDuration(member.checkInTime, member.checkOutTime)}</td>
              <td>{forceLabel(member)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Guests</h2>
      <table className="print-log-table">
        <thead>
          <tr>
            <th>Guest Name</th>
            <th>Host</th>
            <th>Status</th>
            <th>Check In</th>
            <th>Check Out</th>
            <th>Duration</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {guests.length === 0 ? (
            <tr>
              <td colSpan="7">No guest records.</td>
            </tr>
          ) : (
            guests.map((guest) => (
              <tr key={guest.id}>
                <td>{guest.name}</td>
                <td>{guest.hostName}</td>
                <td>{guest.status === 'checked-in' ? 'Present' : 'Signed Out'}</td>
                <td>{formatTime(guest.checkInTime)}</td>
                <td>{formatTime(guest.checkOutTime)}</td>
                <td>{formatDuration(guest.checkInTime, guest.checkOutTime)}</td>
                <td>{forceLabel(guest)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
