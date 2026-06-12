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
import { useLocalTime } from '../hooks/useLocalTime';

export default function Dashboard({ attendance }) {
  const {
    members,
    guests,
    activity,
    settings,
    getStats,
    checkInMember,
    checkOutMember,
    searchMembers,
    verifyPin,
    isFirebase,
    memberHasPin,
    needsPinSetup,
    createMemberPin,
  } = attendance;
  const stats = getStats();
  const [wizardMode, setWizardMode] = useState('check-in');
  const { shortDateStr } = useLocalTime();

  const checkedInMembers = members.filter((m) => m.status === 'checked-in');
  const checkedOutMembers = members.filter((m) => m.status === 'checked-out');
  const presentGuests = guests.filter((g) => g.status === 'checked-in');
  const meetingActive = isMeetingInProgress(settings);

  const handlePrint = () => window.print();

  return (
    <div className="dashboard-page">
      <Header
        title="Welcome!"
        subtitle={<LocalClock />}
      />

      <div className="stats-grid">
        <StatCard
          label="Checked In"
          value={stats.checkedIn}
          color="green"
          linkTo="/attendance?filter=checked-in"
        />
        <StatCard
          label="Checked Out"
          value={stats.checkedOut}
          color="red"
          linkTo="/attendance?filter=checked-out"
        />
        <StatCard
          label="Guests Present"
          value={stats.guestsPresent}
          color="gold"
          linkTo="/guests"
        />
        <StatCard
          label="Total Present"
          value={stats.totalPresent}
          subtext={`of ${stats.totalMembers} Members`}
          color="blue"
        />
        <StatCard
          label="Tonight's Meeting"
          variant="meeting-card"
        >
          <div className="meeting-date">{shortDateStr}</div>
          <div className="meeting-time">
            {formatMeetingTime(settings.meetingStart)} – {formatMeetingTime(settings.meetingEnd)}
          </div>
          <span className={`badge ${meetingActive ? 'badge-green' : 'badge-blue'}`} style={{ marginTop: 8, display: 'inline-block' }}>
            {meetingActive ? 'IN PROGRESS' : 'SCHEDULED'}
          </span>
        </StatCard>
      </div>

      <div className="dashboard-panels">
        <div className="panel">
          <div className="panel-header panel-header-blue">
            <h3 className="panel-title panel-title-white">
              Checked In ({checkedInMembers.length})
            </h3>
          </div>
          <div className="panel-body">
            <AttendanceTable members={checkedInMembers.slice(0, 8)} compact />
          </div>
          <div className="panel-footer">
            <Link to="/attendance?filter=checked-in" className="panel-footer-link">
              View All Checked In →
            </Link>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header panel-header-red">
            <h3 className="panel-title panel-title-white">
              Checked Out ({checkedOutMembers.length})
            </h3>
          </div>
          <div className="panel-body">
            <AttendanceTable members={checkedOutMembers.slice(0, 8)} showCheckOut compact />
          </div>
          <div className="panel-footer">
            <Link to="/attendance?filter=checked-out" className="panel-footer-link">
              View All Checked Out →
            </Link>
          </div>
        </div>

        <div className="dashboard-col-stack">
          <div className="panel">
            <div className="panel-header panel-header-gold">
              <h3 className="panel-title">
                Guests Present ({presentGuests.length})
              </h3>
            </div>
            <div className="panel-body">
              <GuestTable guests={presentGuests} compact />
            </div>
            <div className="panel-footer">
              <Link to="/guests" className="panel-footer-link">
                View All Guests →
              </Link>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header panel-header-dark">
              <h3 className="panel-title panel-title-white">Recent Activity</h3>
            </div>
            <div className="panel-body">
              <ActivityFeed activities={activity} limit={6} showFooter />
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-bottom">
        <div className="dashboard-wizard-wrap">
          <div className="wizard-mode-toggle no-print">
            <button
              type="button"
              className={`btn ${wizardMode === 'check-in' ? 'btn-green' : 'btn-outline'}`}
              onClick={() => setWizardMode('check-in')}
            >
              Check In
            </button>
            <button
              type="button"
              className={`btn ${wizardMode === 'check-out' ? 'btn-red' : 'btn-outline'}`}
              onClick={() => setWizardMode('check-out')}
            >
              Check Out
            </button>
          </div>
          <CheckInWizard
            key={wizardMode}
            members={members}
            searchMembers={searchMembers}
            verifyPin={verifyPin}
            onCheckIn={checkInMember}
            onCheckOut={checkOutMember}
            mode={wizardMode}
            compact
            isFirebase={isFirebase}
            memberHasPin={memberHasPin}
            needsPinSetup={needsPinSetup}
            createMemberPin={createMemberPin}
          />
        </div>

        <div className="quick-actions no-print">
          <h3 className="quick-actions-title">Quick Actions</h3>
          <Link to="/admin?action=check-in" className="btn btn-green">
            Force Check In
          </Link>
          <Link to="/admin?action=check-out" className="btn btn-red">
            Force Check Out
          </Link>
          <Link to="/attendance" className="btn btn-blue">
            View Full List
          </Link>
          <button type="button" className="btn btn-gray" onClick={handlePrint}>
            Print Sign In Sheet
          </button>
        </div>
      </div>
    </div>
  );
}
