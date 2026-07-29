import { Link } from 'react-router-dom';
import ActivityFeed from '../components/ActivityFeed';
import AttendanceTable from '../components/AttendanceTable';
import BadgeScannerPanel from '../components/BadgeScannerPanel';
import GuestTable from '../components/GuestTable';
import LocalClock from '../components/LocalClock';
import PrintableAttendanceLog from '../components/PrintableAttendanceLog';
import { formatMeetingTime, isMeetingInProgress } from '../data/mockData';
import { useLocalTime } from '../hooks/useLocalTime';

function Icon({ name }) {
  const paths = {
    kiosk: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>,
    attendance: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
    tools: <><path d="m14.7 6.3 3-3a4.2 4.2 0 0 1-5.4 5.4l-6.6 6.6a2.1 2.1 0 1 0 3 3l6.6-6.6a4.2 4.2 0 0 1 5.4-5.4l-3 3" /></>,
    roster: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">{paths[name]}</svg>;
}

export default function Dashboard({ attendance }) {
  const { members, guests, activity, settings, getStats, seniorSession } = attendance;
  const stats = getStats();
  const { shortDateStr } = useLocalTime();
  const meetingActive = isMeetingInProgress(settings);
  const checkedInMembers = members.filter((member) => member.status === 'checked-in');
  const presentGuests = guests.filter((guest) => guest.status === 'checked-in');
  const operatorName = seniorSession?.displayName || seniorSession?.fullName || 'meeting operator';

  return (
    <>
      <PrintableAttendanceLog members={members} guests={guests} settings={settings} />
      <div className="operator-dashboard no-print">
        <section className="operator-hero">
          <div>
            <div className="eyebrow">Meeting operator home</div>
            <h1>Everything needed to run tonight’s attendance</h1>
            <p>
              Signed in as {operatorName}. Start the public kiosk for normal member use,
              or start the badge scanner for a faster check-in line.
            </p>
          </div>
          <div className="meeting-summary">
            <span>{shortDateStr}</span>
            <strong>{formatMeetingTime(settings.meetingStart)}–{formatMeetingTime(settings.meetingEnd)}</strong>
            <em className={meetingActive ? 'active' : ''}>{meetingActive ? 'Meeting in progress' : 'Meeting scheduled'}</em>
            <small><LocalClock /></small>
          </div>
        </section>

        <section className="operator-steps" aria-label="Meeting workflow">
          <div className="operator-step">
            <span>1</span><div><strong>Choose check-in method</strong><small>Public kiosk or badge scanner</small></div>
          </div>
          <div className="operator-step">
            <span>2</span><div><strong>Watch attendance</strong><small>Confirm the present count increases</small></div>
          </div>
          <div className="operator-step">
            <span>3</span><div><strong>Fix exceptions</strong><small>Use Manual Corrections when needed</small></div>
          </div>
        </section>

        <div className="operator-primary-grid">
          <section className="operator-card start-card">
            <div className="eyebrow">Standard setup</div>
            <h2>Run the public kiosk</h2>
            <p>Best when members will find their own name and use their PIN. Opens the large touch-friendly screen used on iPad.</p>
            <Link to="/" className="operator-primary-button"><Icon name="kiosk" />Open public kiosk</Link>
            <p className="operator-tip"><strong>Before members arrive:</strong> keep the iPad awake, connected to power, and on the kiosk home screen.</p>
          </section>

          <BadgeScannerPanel attendance={attendance} />
        </div>

        <section className="live-overview" aria-labelledby="live-heading">
          <div className="section-heading">
            <div><div className="eyebrow">Live meeting</div><h2 id="live-heading">Attendance at a glance</h2></div>
            <Link to="/admin/members">View full attendance →</Link>
          </div>
          <div className="operator-stats">
            <Link to="/admin/members?filter=checked-in" className="operator-stat present"><span>Members present</span><strong>{stats.checkedIn}</strong></Link>
            <Link to="/admin/guests" className="operator-stat guests"><span>Guests present</span><strong>{stats.guestsPresent}</strong></Link>
            <div className="operator-stat total"><span>Total people present</span><strong>{stats.totalPresent}</strong></div>
            <div className="operator-stat absent"><span>Not currently present</span><strong>{Math.max(0, stats.totalMembers - stats.checkedIn)}</strong></div>
          </div>
        </section>

        <section className="operator-actions" aria-labelledby="help-heading">
          <div className="section-heading"><div><div className="eyebrow">When something goes wrong</div><h2 id="help-heading">Common operator tasks</h2></div></div>
          <div className="operator-action-grid">
            <Link to="/admin/members" className="operator-action"><Icon name="attendance" /><div><strong>See who is here</strong><span>Full member attendance list</span></div></Link>
            <Link to="/admin/tools" className="operator-action"><Icon name="tools" /><div><strong>Manual corrections</strong><span>Force check-in, check-out, or reset a PIN</span></div></Link>
            <Link to="/admin/roster" className="operator-action"><Icon name="roster" /><div><strong>Manage members</strong><span>Add, edit, disable, or restore someone</span></div></Link>
          </div>
        </section>

        <div className="operator-detail-grid">
          <section className="operator-card">
            <div className="section-heading compact"><h2>Currently checked in ({checkedInMembers.length})</h2></div>
            <AttendanceTable members={checkedInMembers.slice(0, 8)} compact meetingEnd={settings.meetingEnd} />
          </section>
          <section className="operator-card">
            <div className="section-heading compact"><h2>Guests present ({presentGuests.length})</h2></div>
            <GuestTable guests={presentGuests.slice(0, 8)} compact meetingEnd={settings.meetingEnd} />
          </section>
          <section className="operator-card activity-card">
            <div className="section-heading compact"><h2>Recent activity</h2></div>
            <ActivityFeed activities={activity} limit={8} />
          </section>
        </div>
      </div>
    </>
  );
}
