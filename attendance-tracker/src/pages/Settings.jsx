import { useState } from 'react';
import { DEFAULT_SETTINGS } from '../data/mockData';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Settings({ attendance }) {
  const { settings, updateSettings, resetData, isApiMode } = attendance;
  const [form, setForm] = useState({ ...DEFAULT_SETTINGS, ...settings });
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = (e) => {
    e.preventDefault();
    updateSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    if (confirmReset) {
      resetData();
      setForm({ ...DEFAULT_SETTINGS });
      setConfirmReset(false);
    } else {
      setConfirmReset(true);
    }
  };

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">Configure squadron info, meeting times, and system preferences</p>

      <form onSubmit={handleSave}>
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="settings-section">
            <h3 className="settings-section-title">Squadron Information</h3>
            <div className="settings-grid">
              <div className="form-group">
                <label className="form-label">Squadron Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.squadronName}
                  onChange={(e) => handleChange('squadronName', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Designator</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.squadronDesignator}
                  onChange={(e) => handleChange('squadronDesignator', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Charter Number</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.charterNumber || ''}
                  onChange={(e) => handleChange('charterNumber', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Motto</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.motto}
                  onChange={(e) => handleChange('motto', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Meeting Schedule</h3>
            <div className="settings-grid">
              <div className="form-group">
                <label className="form-label">Meeting Day</label>
                <select
                  className="form-select"
                  value={form.meetingDay}
                  onChange={(e) => handleChange('meetingDay', e.target.value)}
                >
                  {DAYS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Start Time</label>
                <input
                  type="time"
                  className="form-input"
                  value={form.meetingStart}
                  onChange={(e) => handleChange('meetingStart', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">End Time</label>
                <input
                  type="time"
                  className="form-input"
                  value={form.meetingEnd}
                  onChange={(e) => handleChange('meetingEnd', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Security</h3>
            <p className="report-card-desc">
              Attendance, member PINs, and roster changes are stored in the shared TN-170 cloud database.
              An action completed on the iPad appears on every connected laptop and tablet automatically.
            </p>
            <p className="report-card-desc pin-setup-hint">
              Member PINs are verified by the trusted attendance service and are never displayed to operators.
              Admin access requires a senior member CAPID and personal PIN; there is no shared admin PIN.
              {!isApiMode && ' The trusted attendance service is not configured in this build.'}
            </p>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-blue">Save Settings</button>
            {saved && <span className="form-success">Settings saved!</span>}
          </div>
        </div>
      </form>

      <div className="panel">
        <h3 className="settings-section-title" style={{ color: 'var(--red)' }}>Danger Zone</h3>
        <p className="report-card-desc" style={{ marginBottom: 16 }}>
          Clear the signed-in administrator and this device&apos;s display preferences.
          Shared attendance, roster, guest, and PIN records are not deleted.
        </p>
        {confirmReset ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button className="btn btn-red" onClick={handleReset}>
              Confirm Device Reset
            </button>
            <button className="btn btn-outline" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn btn-red" onClick={handleReset}>
            Reset This Device
          </button>
        )}
      </div>
    </div>
  );
}
