import { useState } from 'react';
import {
  buildAttendanceCsv,
  downloadReportContent,
  exportAndDownload,
} from '../services/reportService';

function downloadLocalCsv(members, guests) {
  downloadReportContent({
    content: buildAttendanceCsv(members, guests),
    filename: `tn170-attendance-${new Date().toISOString().split('T')[0]}.csv`,
    mimeType: 'text/csv;charset=utf-8;',
  });
}

export default function AttendanceCsvExport({
  members,
  guests,
  isFirebase,
  meeting,
  seniorSession,
  addActivity,
  title = 'Export Attendance CSV',
  description = 'Download the full roster with check-in/out times and guest records.',
  buttonClassName = 'btn btn-blue',
  showAuth = true,
}) {
  const [exportCapid, setExportCapid] = useState(seniorSession?.capid || '');
  const [exportPin, setExportPin] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (isFirebase) {
      if (!exportCapid.trim() || exportPin.length !== 4) {
        setExportError('Enter your CAPID and 4-digit PIN to export.');
        return;
      }
    }

    setExporting(true);
    setExportError('');
    try {
      if (!isFirebase) {
        downloadLocalCsv(members, guests);
        return;
      }

      const result = await exportAndDownload({
        actorCapid: exportCapid.trim(),
        actorPin: exportPin,
        meetingId: meeting?.id,
        format: 'csv',
        members,
        guests,
      });
      if (addActivity) {
        addActivity(
          `Attendance report exported (CSV) by ${result.exportedBy || exportCapid.trim()}`,
          'report-export'
        );
      }
    } catch (err) {
      setExportError(err.message || 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="report-card">
      <div className="report-card-title">{title}</div>
      <div className="report-card-desc">{description}</div>

      {isFirebase && showAuth && (
        <>
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
        </>
      )}

      {exportError && <p style={{ color: 'var(--red)', marginBottom: 12 }}>{exportError}</p>}

      <button
        type="button"
        className={buttonClassName}
        disabled={exporting}
        onClick={handleExport}
      >
        {exporting ? 'Exporting...' : 'Download CSV'}
      </button>
    </div>
  );
}
