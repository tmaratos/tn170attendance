import { Link } from 'react-router-dom';
import Header from '../components/Header';
import StatCard from '../components/StatCard';
import AttendanceTable from '../components/AttendanceTable';
import GuestTable from '../components/GuestTable';
import ActivityFeed from '../components/ActivityFeed';
import CheckInWizard from '../components/CheckInWizard';
import LocalClock from '../components/LocalClock';
import PrintableAttendanceLog from '../components/PrintableAttendanceLog';
import { isMeetingInProgress, formatMeetingTime } from '../data/mockData';
import { useLocalTime } from '../hooks/useLocalTime';

function ActionIcon({ type }) {
  const common = {
    width: 23,
    height: 23,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  const icons = {
    in: <><path d="M3 12h11" /><path d="m11 8 4 4-4 4" /><path d="M20 4v16" /></>,
    out: <><path d="M21 12H10" /><path d="m13 8-4 4 4 4" /><path d="M4 4v16" /></>,
    list: <><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></>,
    print: <><path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6z" /></>,
  };

  return <svg {...common}>{icons[type]}</svg>;
}

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
  const { shortDateStr } = useLocalTime();

  const checkedInMembers = members.filter((m) => m.status === 'checked-in');
  const checkedOutMembers = members.filter((m) => m.status === 'checked-out');
  const presentGuests = guests.filter((g) => g.status === 'checked-in');
  const meetingActive = isMeetingInProgress(settings);

  const handlePrint = () => window.print();

  return (
    <>
      <PrintableAttendanceLog members={members} guests={guests} settings={settings} />
      <div className="dashboard-page no-print">
        <Header
          title="Welcome!"
          subtitle={<LocalClock />}
        />

      <div className="stats-grid">
        <StatCard
          label="Checked In"
          value={stats.checkedIn}
          color="green"
          linkTo="/admin/members?filter=checked-in"
        />
        <StatCard
          label="Checked Out"
          value={stats.checkedOut}
          color="red"
          linkTo="/admin/members?filter=checked-out"
        />
        <StatCard
          label="Guests Present"
          value={stats.guestsPresent}
          color="gold"
          linkTo="/admin/guests"
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
          <div className="meeting-card-content">
            <div className="meeting-date">{shortDateStr}</div>
            <div className="meeting-row">
              <div className="meeting-time">
                {formatMeetingTime(settings.meetingStart)} - {formatMeetingTime(settings.meetingEnd)}
              </div>
              <span className={`badge ${meetingActive ? 'badge-green' : 'badge-blue'}`}>
                {meetingActive ? 'IN PROGRESS' : 'SCHEDULED'}
              </span>
            </div>
          </div>
        </StatCard>
      </div>

      <div className="dashboard-panels">
        <div className="panel checked-in-panel">
          <div className="panel-header panel-header-blue">
            <h3 className="panel-title panel-title-white">
              Checked In ({checkedInMembers.length})
            </h3>
          </div>
          <div className="panel-body">
            <AttendanceTable members={checkedInMembers.slice(0, 8)} compact />
          </div>
          <div className="panel-footer">
            <Link to="/admin/members?filter=checked-in" className="panel-footer-link">
              View All Checked In <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>

        <div className="panel checked-out-panel">
          <div className="panel-header panel-header-red">
            <h3 className="panel-title panel-title-white">
              Checked Out ({checkedOutMembers.length})
            </h3>
          </div>
          <div className="panel-body">
            <AttendanceTable members={checkedOutMembers.slice(0, 8)} showCheckOut compact />
          </div>
          <div className="panel-footer">
            <Link to="/admin/members?filter=checked-out" className="panel-footer-link">
              View All Checked Out <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>

        <div className="dashboard-col-stack">
          <div className="panel guests-panel">
            <div className="panel-header panel-header-gold">
              <h3 className="panel-title">
                Guests Present ({presentGuests.length})
              </h3>
            </div>
            <div className="panel-body">
              <GuestTable guests={presentGuests} compact />
            </div>
            <div className="panel-footer">
              <Link to="/admin/guests" className="panel-footer-link">
                View All Guests <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          </div>

          <div className="panel activity-panel">
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
          <CheckInWizard
            members={members}
            searchMembers={searchMembers}
            verifyPin={verifyPin}
            onCheckIn={checkInMember}
            onCheckOut={checkOutMember}
            mode="check-in"
            compact
            isFirebase={isFirebase}
            memberHasPin={memberHasPin}
            needsPinSetup={needsPinSetup}
            createMemberPin={createMemberPin}
          />
        </div>

        <div className="quick-actions no-print">
          <h3 className="quick-actions-title">Quick Actions</h3>
          <Link to="/admin/tools?action=check-in" className="btn btn-green">
            <ActionIcon type="in" />
            <span><strong>Force Check In</strong><small>Check in a member</small></span>
          </Link>
          <Link to="/admin/tools?action=check-out" className="btn btn-red">
            <ActionIcon type="out" />
            <span><strong>Force Check Out</strong><small>Check out a member</small></span>
          </Link>
          <Link to="/admin/members" className="btn btn-blue">
            <ActionIcon type="list" />
            <span><strong>View Full List</strong><small>All members and guests</small></span>
          </Link>
          <button type="button" className="btn btn-gray" onClick={handlePrint}>
            <ActionIcon type="print" />
            <span><strong>Print Sign In Sheet</strong><small>Print attendance sheet</small></span>
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
