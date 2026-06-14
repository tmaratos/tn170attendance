import { useMemo, useState } from 'react';
import { formatTime } from '../data/mockData';
import { buildAttendanceCsv, downloadReportContent, exportAndDownload } from '../services/reportService';

function exportCSVLocal(members, guests) {
  downloadReportContent({
    content: buildAttendanceCsv(members, guests),
    filename: `tn170-attendance-${new Date().toISOString().split('T')[0]}.csv`,
    mimeType: 'text/csv',
  });
}

export default function Reports({ attendance }) {
  const {
    members,
    guests,
    getStats,
    isFirebase,
    isCloudBackend,
    meeting,
    seniorSession,
    addActivity,
  } = attendance;
  const stats = getStats();
  const [exportCapid, setExportCapid] = useState(seniorSession?.capid || '');
  const [exportPin, setExportPin] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);

  const cadetStats = useMemo(() => {
    const cadets = members.filter((m) => m.role === 'Cadet');
    const present = cadets.filter((m) => m.status === 'checked-in').length;
    return { total: cadets.length, present };
  }, [members]);

  const seniorStats = useMemo(() => {
    const seniors = members.filter((m) => m.role === 'Senior Member');
    const present = seniors.filter((m) => m.status === 'checked-in').length;
    return { total: seniors.length, present };
  }, [members]);

  const handleAuthorizedExport = async (format) => {
    if (!exportCapid.trim() || exportPin.length !== 4) {
      setExportError('Enter your CAPID and 4-digit PIN to export.');
      return;
    }
    setExporting(true);
    setExportError('');
    try {
      const result = await exportAndDownload({
        actorCapid: exportCapid.trim(),
        actorPin: exportPin,
        meetingId: meeting?.id,
        format,
        members,
        guests,
      });
      if (addActivity) {
        addActivity(
          `Attendance report exported (${format.toUpperCase()}) by ${result.exportedBy || exportCapid.trim()}`,
          'report-export'
        );
      }
    } catch (err) {
      setExportError(err.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Reports</h1>
      <p className="page-subtitle">Meeting attendance summaries and exports</p>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h3 className="panel-title" style={{ marginBottom: 16 }}>Tonight&apos;s Summary</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div className="report-card">
            <div className="report-card-title">Total Present</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--blue)' }}>
              {stats.totalPresent}
            </div>
            <div className="report-card-desc">Members + guests checked in</div>
          </div>
          <div className="report-card">
            <div className="report-card-title">Cadets</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--gold-dark)' }}>
              {cadetStats.present}/{cadetStats.total}
            </div>
            <div className="report-card-desc">Cadets present tonight</div>
          </div>
          <div className="report-card">
            <div className="report-card-title">Senior Members</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--blue-dark)' }}>
              {seniorStats.present}/{seniorStats.total}
            </div>
            <div className="report-card-desc">Senior members present tonight</div>
          </div>
          <div className="report-card">
            <div className="report-card-title">Guests</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--gold)' }}>
              {stats.guestsPresent}
            </div>
            <div className="report-card-desc">Guests signed in tonight</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3 className="panel-title" style={{ marginBottom: 16 }}>Export & Reports</h3>

        {isFirebase && (
          <div className="report-card" style={{ marginBottom: 16 }}>
            <div className="report-card-title">Senior Member Authorization</div>
            <div className="report-card-desc">
              Enter your CAPID and PIN to export tonight&apos;s attendance report.
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-input"
                placeholder="CAPID"
                value={exportCapid}
                onChange={(e) => setExportCapid(e.target.value.replace(/\D/g, ''))}
                style={{ maxWidth: 160 }}
              />
              <input
                type="password"
                className="form-input"
                placeholder="4-digit PIN"
                maxLength={4}
                value={exportPin}
                onChange={(e) => setExportPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                style={{ maxWidth: 160 }}
              />
            </div>
            {exportError && <p style={{ color: 'var(--red)', marginBottom: 12 }}>{exportError}</p>}
          </div>
        )}

        <div className="report-card">
          <div className="report-card-title">Full Attendance CSV</div>
          <div className="report-card-desc">
            Export all member and guest attendance records for tonight&apos;s meeting.
          </div>
          <button
            className="btn btn-blue"
            disabled={exporting}
            onClick={() =>
              isFirebase
                ? handleAuthorizedExport('csv')
                : exportCSVLocal(members, guests)
            }
          >
            {exporting ? 'Exporting...' : 'Download CSV'}
          </button>
        </div>

        {isCloudBackend && (
          <div className="report-card">
            <div className="report-card-title">PDF / DOCX / Excel (Scaffold)</div>
            <div className="report-card-desc">
              Additional export formats return structured JSON until full document generation is added.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['pdf', 'docx', 'xlsx'].map((fmt) => (
                <button
                  key={fmt}
                  className="btn btn-outline"
                  disabled={exporting}
                  onClick={() => handleAuthorizedExport(fmt)}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="report-card">
          <div className="report-card-title">Checked-In Roster</div>
          <div className="report-card-desc">
            {stats.checkedIn} members currently checked in.
          </div>
          <div className="table-scroll" style={{ maxHeight: 200 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Grade</th>
                  <th>Check-In</th>
                </tr>
              </thead>
              <tbody>
                {members
                  .filter((m) => m.status === 'checked-in')
                  .map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>{m.grade}</td>
                      <td>{formatTime(m.checkInTime)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="report-card">
          <div className="report-card-title">Absent Members</div>
          <div className="report-card-desc">
            Members who have not checked in tonight.
          </div>
          <div className="table-scroll" style={{ maxHeight: 200 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Grade</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {members
                  .filter((m) => m.status !== 'checked-in')
                  .map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>{m.grade}</td>
                      <td>{m.role}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
