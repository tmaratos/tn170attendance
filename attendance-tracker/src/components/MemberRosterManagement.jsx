import { useMemo, useState } from 'react';
import { getInitials } from '../data/mockData';
import GradeRankSelect from './GradeRankSelect';
import { getCallableError } from '../services/errors';

const EMPTY_FORM = {
  capid: '',
  firstName: '',
  middleName: '',
  lastName: '',
  grade: 'CADET',
};

export default function MemberRosterManagement({
  seniorSession,
  searchMembers,
  createMember,
  updateMember,
  deactivateMember,
  reactivateMember,
}) {
  const [mgmtPin, setMgmtPin] = useState('');
  const [mode, setMode] = useState('create');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editCapid, setEditCapid] = useState('');
  const [editSearch, setEditSearch] = useState('');
  const [statusSearch, setStatusSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const editResults = useMemo(
    () => (editSearch.trim() ? searchMembers(editSearch) : []),
    [editSearch, searchMembers]
  );
  const statusResults = useMemo(
    () => (statusSearch.trim() ? searchMembers(statusSearch) : []),
    [statusSearch, searchMembers]
  );

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditCapid('');
    setMode('create');
  };

  const runAction = async (action) => {
    if (mgmtPin.length !== 4) {
      setError('Enter your 4-digit PIN to authorize.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (err) {
      setError(getCallableError(err) || err.message || 'Action failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () =>
    runAction(async () => {
      const result = await createMember(
        {
          capid: form.capid.trim(),
          firstName: form.firstName.trim(),
          middleName: form.middleName.trim(),
          lastName: form.lastName.trim(),
          grade: form.grade,
        },
        mgmtPin
      );
      setMessage(`Created ${result.displayName} (CAPID ${result.capid}).`);
      resetForm();
    });

  const handleUpdate = () =>
    runAction(async () => {
      const result = await updateMember(
        {
          capid: editCapid,
          firstName: form.firstName.trim(),
          middleName: form.middleName.trim(),
          lastName: form.lastName.trim(),
          grade: form.grade,
        },
        mgmtPin
      );
      setMessage(`Updated ${result.displayName} (CAPID ${result.capid}).`);
      resetForm();
    });

  const loadMemberForEdit = (member) => {
    setMode('edit');
    setEditCapid(String(member.capidRaw || member.id));
    setForm({
      capid: String(member.capidRaw || member.id),
      firstName: member.firstName || member.name.split(' ')[0] || '',
      middleName: member.middleName || '',
      lastName: member.lastName || member.name.split(' ').slice(-1)[0] || '',
      grade: member.grade || 'CADET',
    });
    setEditSearch('');
    setMessage('');
    setError('');
  };

  const createDisabled =
    loading ||
    !form.capid.trim() ||
    !form.firstName.trim() ||
    !form.lastName.trim() ||
    !form.grade;

  return (
    <div className="panel" style={{ marginTop: 24 }}>
      <h3 className="panel-title" style={{ marginBottom: 8 }}>Roster Management</h3>
      <p className="report-card-desc" style={{ marginBottom: 16 }}>
        Create or edit squadron members using the roster schema (CAPID, name, grade/rank).
        PIN setup still happens at first check-in. Deactivate members instead of deleting them.
        {seniorSession?.displayName ? ` Signed in as ${seniorSession.displayName}.` : ''}
      </p>

      {message && (
        <div style={{ marginBottom: 12, color: 'var(--green-dark)', fontWeight: 600 }}>{message}</div>
      )}
      {error && <div style={{ marginBottom: 12, color: 'var(--red)' }}>{error}</div>}

      <div className="form-group" style={{ maxWidth: 200, marginBottom: 20 }}>
        <label className="form-label">Your PIN (required for all actions)</label>
        <input
          type="password"
          className="form-input"
          maxLength={4}
          value={mgmtPin}
          onChange={(e) => setMgmtPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="4-digit PIN"
        />
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <button
          type="button"
          className={`btn ${mode === 'create' ? 'btn-blue' : 'btn-outline'}`}
          onClick={() => {
            resetForm();
            setMode('create');
          }}
        >
          Create New Member
        </button>
        <button
          type="button"
          className={`btn ${mode === 'edit' ? 'btn-gold' : 'btn-outline'}`}
          onClick={() => {
            setMode('edit');
            setMessage('');
            setError('');
          }}
        >
          Edit Member
        </button>
      </div>

      <div className="settings-grid" style={{ marginBottom: 24 }}>
        <div className="report-card">
          <div className="report-card-title">
            {mode === 'create' ? 'Create New Member' : `Edit Member${editCapid ? ` — CAPID ${editCapid}` : ''}`}
          </div>

          {mode === 'create' && (
            <div className="form-group">
              <label className="form-label">CAPID</label>
              <input
                type="text"
                className="form-input"
                inputMode="numeric"
                placeholder="6–8 digit CAPID"
                value={form.capid}
                onChange={(e) => setForm((prev) => ({ ...prev, capid: e.target.value.replace(/\D/g, '') }))}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">First name</label>
            <input
              type="text"
              className="form-input"
              value={form.firstName}
              onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Middle name (optional)</label>
            <input
              type="text"
              className="form-input"
              value={form.middleName}
              onChange={(e) => setForm((prev) => ({ ...prev, middleName: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Last name</label>
            <input
              type="text"
              className="form-input"
              value={form.lastName}
              onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Grade / rank</label>
            <GradeRankSelect
              value={form.grade}
              onChange={(e) => setForm((prev) => ({ ...prev, grade: e.target.value }))}
            />
          </div>

          {mode === 'create' ? (
            <button
              type="button"
              className="btn btn-blue"
              disabled={createDisabled || mgmtPin.length !== 4}
              onClick={handleCreate}
            >
              Create Member
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-gold"
              disabled={loading || !editCapid || !form.firstName.trim() || !form.lastName.trim() || mgmtPin.length !== 4}
              onClick={handleUpdate}
            >
              Save Changes
            </button>
          )}
        </div>

        {mode === 'edit' && (
          <div className="report-card">
            <div className="report-card-title">Select member to edit</div>
            <div className="form-group">
              <input
                type="text"
                className="form-input"
                placeholder="Search by name or CAPID..."
                value={editSearch}
                onChange={(e) => setEditSearch(e.target.value)}
              />
            </div>
            <div className="admin-search-results">
              {editResults.slice(0, 8).map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="admin-member-row"
                  style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                  onClick={() => loadMemberForEdit(member)}
                >
                  <div className="member-cell">
                    <div className="avatar">{getInitials(member.name)}</div>
                    <div className="member-info">
                      <span className="member-name">{member.name}</span>
                      <span className="member-meta">{member.grade} • CAPID {member.capid}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="form-group" style={{ maxWidth: 400 }}>
        <label className="form-label">Search member to deactivate/reactivate</label>
        <input
          type="text"
          className="form-input"
          placeholder="Name or CAPID..."
          value={statusSearch}
          onChange={(e) => setStatusSearch(e.target.value)}
        />
      </div>
      <div className="admin-search-results">
        {statusResults.slice(0, 8).map((member) => (
          <div key={`status-${member.id}`} className="admin-member-row">
            <div className="member-cell">
              <div className="avatar">{getInitials(member.name)}</div>
              <div className="member-info">
                <span className="member-name">{member.name}</span>
                <span className="member-meta">{member.grade} • CAPID {member.capid}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{ minHeight: 'auto', padding: '6px 12px', fontSize: '0.85rem' }}
                disabled={loading || mgmtPin.length !== 4}
                onClick={() =>
                  runAction(async () => {
                    await deactivateMember(member.id, mgmtPin, 'Deactivated via roster management');
                    setMessage(`${member.name} deactivated.`);
                  })
                }
              >
                Deactivate
              </button>
              <button
                type="button"
                className="btn btn-green"
                style={{ minHeight: 'auto', padding: '6px 12px', fontSize: '0.85rem' }}
                disabled={loading || mgmtPin.length !== 4}
                onClick={() =>
                  runAction(async () => {
                    await reactivateMember(member.id, mgmtPin);
                    setMessage(`${member.name} reactivated.`);
                  })
                }
              >
                Reactivate
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
