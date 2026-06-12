import { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import StatCard from '../components/StatCard';
import AttendanceTable from '../components/AttendanceTable';
import GuestTable from '../components/GuestTable';
import ActivityFeed from '../components/ActivityFeed';
import CheckInWizard from '../components/CheckInWizard';
import LocalClock from '../components/LocalClock';
import { isMeetingInProgress, formatMeetingTime } from '../data/mockData';

export default function Dashboard({ attendance }) {
  const { members, guests, activity, settings, getStats, checkInMember, checkOutMember, searchMembers, verifyPin } = attendance;
  const stats = getStats();
  const [wizardMode, setWizardMode] = useState('check-in');

  const checkedInMembers = members.filter((m) => m.status === 'checked-in');
  const checkedOutMembers = members.filter((m) => m.status === 'checked-out');
  const presentGuests = guests.filter((g) => g.status === 'checked-in');
  const meetingActive = isMeetingInProgress(settings);

  const handlePrint = () => window.print();

  return (
    <div>
      <Header
        title="Welcome!"
        subtitle={<LocalClock />}
      />

      <div className="stats-grid">
        <StatCard
          icon="✓"
          label="Checked In"
          value={stats.checkedIn}
          color="green"
          linkTo="/attendance?filter=checked-in"
        />
        <StatCard
          icon="✗"
          label="Checked Out"
          value={stats.checkedOut}
          color="red"
          linkTo="/attendance?filter=checked-out"
        />
        <StatCard
          icon="★"
          label="Guests Present"
          value={stats.guestsPresent}
          color="gold"
          linkTo="/guests"
        />
        <StatCard
          icon="👥"
          label="Total Present"
          value={`${stats.totalPresent} of ${stats.totalMembers}`}
          color="blue"
        />
        <StatCard
          icon="📅"
          label="Tonight's Meeting"
          variant="meeting-card"
        >
          <div style={{ marginTop: 8 }}>
            <div>{settings.meetingDay}s • {formatMeetingTime(settings.meetingStart)} – {formatMeetingTime(settings.meetingEnd)}</div>
            <span className={`badge ${meetingActive ? 'badge-green' : 'badge-blue'}`} style={{ marginTop: 8, display: 'inline-block' }}>
              {meetingActive ? 'In Progress' : 'Scheduled'}
            </span>
          </div>
        </StatCard>
      </div>

      <div className="dashboard-panels">
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title text-green">Checked In ({checkedInMembers.length})</h3>
            <Link to="/attendance?filter=checked-in" className="panel-link">View All →</Link>
          </div>
          <AttendanceTable members={checkedInMembers.slice(0, 8)} />
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title text-red">Checked Out ({checkedOutMembers.length})</h3>
            <Link to="/attendance?filter=checked-out" className="panel-link">View All →</Link>
          </div>
          <AttendanceTable members={checkedOutMembers.slice(0, 8)} showCheckOut />
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title text-gold">Guests Present ({presentGuests.length})</h3>
            <Link to="/guests" className="panel-link">View All →</Link>
          </div>
          <GuestTable guests={presentGuests} />
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">Recent Activity</h3>
          </div>
          <ActivityFeed activities={activity} limit={8} />
        </div>
      </div>

      <div className="dashboard-bottom">
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button
              className={`btn ${wizardMode === 'check-in' ? 'btn-green' : 'btn-outline'}`}
              onClick={() => setWizardMode('check-in')}
            >
              Check In
            </button>
            <button
              className={`btn ${wizardMode === 'check-out' ? 'btn-red' : 'btn-outline'}`}
              onClick={() => setWizardMode('check-out')}
            >
              Check Out
            </button>
          </div>
          <div className="kiosk-panel">
            <CheckInWizard
              members={members}
              searchMembers={searchMembers}
              verifyPin={verifyPin}
              onCheckIn={checkInMember}
              onCheckOut={checkOutMember}
              mode={wizardMode}
              compact
            />
          </div>
        </div>

        <div className="quick-actions no-print">
          <h3 className="panel-title" style={{ color: 'var(--white)', marginBottom: 12 }}>
            Quick Actions
          </h3>
          <Link to="/admin?action=check-in" className="btn btn-green">
            Force Check In
          </Link>
          <Link to="/admin?action=check-out" className="btn btn-red">
            Force Check Out
          </Link>
          <Link to="/attendance" className="btn btn-blue">
            View Full List
          </Link>
          <button className="btn btn-gray" onClick={handlePrint}>
            Print Sign In Sheet
          </button>
        </div>
      </div>
    </div>
  );
}
