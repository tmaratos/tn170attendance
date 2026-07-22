import { useMemo, useState } from 'react';
import { getInitials } from '../data/mockData';
import GradeRankSelect from '../components/GradeRankSelect';
import { getCallableError } from '../services/errors';

const EMPTY_FORM = { capid: '', firstName: '', middleName: '', lastName: '', grade: 'CADET' };
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'cadets', label: 'Cadets' },
  { key: 'seniors', label: 'Senior Members' },
];

export default function Roster({ attendance }) {
  const {
    members,
    searchMembers,
    seniorSession,
    createMember,
    updateMember,
    deactivateMember,
    reactivateMember,
    isFirebase,
  } = attendance;

  const canManage = isFirebase && seniorSession?.canManageMembers && createMember && updateMember;

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mode, setMode] = useState('create');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reactivateCapid, setReactivateCapid] = useState('');

  const rows = useMemo(() => {
    let list = members;
    if (filter === 'cadets') list = list.filter((m) => m.role === 'Cadet');
    else if (filter === 'seniors') list = list.filter((m) => m.role === 'Senior Member');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) => m.name.toLowerCase().includes(q) || String(m.capid).includes(q) || m.grade.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [members, filter, search]);

  const openCreate = () => {
    setMode('create');
    setForm(EMPTY_FORM);
    setEditId('');
    setError('');
    setMessage('');
    setDrawerOpen(true);
  };

  const openEdit = (m) => {
    setMode('edit');
    setEditId(String(m.capidRaw || m.id));
    setForm({
      capid: String(m.capidRaw || m.id),
      firstName: m.firstName || m.name.split(' ')[0] || '',
      middleName: m.middleName || '',
      lastName: m.lastName || m.name.split(' ').slice(-1)[0] || '',
      grade: m.grade || 'CADET',
    });
    setError('');
    setMessage('');
    setPin('');
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setPin('');
  };

  const run = async (action) => {
    if (pin.length !== 4) {
      setError('Enter your 4-digit authorization PIN.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(getCallableError(err) || err.message || 'Action failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () =>
    run(async () => {
      const res = await createMember(
        {
          capid: form.capid.trim(),
          firstName: form.firstName.trim(),
          middleName: form.middleName.trim(),
          lastName: form.lastName.trim(),
          grade: form.grade,
        },
        pin
      );
      setMessage(`Created ${res.displayName} (CAPID ${res.capid}).`);
      closeDrawer();
    });

  const handleUpdate = () =>
    run(async () => {
      const res = await updateMember(
        {
          capid: editId,
          firstName: form.firstName.trim(),
          middleName: form.middleName.trim(),
          lastName: form.lastName.trim(),
          grade: form.grade,
        },
        pin
      );
      setMessage(`Updated ${res.displayName} (CAPID ${res.capid}).`);
      closeDrawer();
    });

  const handleDeactivate = (m) => {
    const enteredPin = window.prompt(`Enter your 4-digit PIN to deactivate ${m.name}:`);
    if (!enteredPin) return;
    setLoading(true);
    setError('');
    deactivateMember(m.id, enteredPin, 'Deactivated via roster')
      .then(() => setMessage(`${m.name} deactivated.`))
      .catch((err) => setError(getCallableError(err) || err.message || 'Deactivate failed.'))
      .finally(() => setLoading(false));
  };

  const createDisabled =
    loading || !form.capid.trim() || !form.firstName.trim() || !form.lastName.trim() || !form.grade || pin.length !== 4;

  return (
    <div>
      {message && <div className="banner-success">{message}</div>}
      {error && !drawerOpen && <div className="banner-error">{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header" style={{ flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-input"
              style={{ minWidth: 240 }}
              placeholder="Search by name or CAPID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="seg">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={filter === f.key ? 'active' : ''}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {canManage && (
            <button type="button" className="btn btn-blue" onClick={openCreate}>
              + Add member
            </button>
          )}
        </div>

        <div style={{ padding: '10px 22px', color: 'var(--gray-500)', fontWeight: 600, fontSize: '0.85rem' }}>
          {rows.length} member{rows.length === 1 ? '' : 's'}
        </div>

        <div className="table-scroll-lg">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Grade</th>
                <th>CAPID</th>
                <th>Status</th>
                <th>PIN status</th>
                {canManage && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="member-cell">
                      <div className="avatar">{getInitials(m.name)}</div>
                      <span className="member-name">{m.name}</span>
                    </div>
                  </td>
                  <td><span className={`pill ${m.role === 'Senior Member' ? 'pill-blue' : 'pill-gold'}`}>{m.grade}</span></td>
                  <td style={{ fontFamily: 'monospace' }}>{m.capid}</td>
                  <td><span className="pill pill-green">Active</span></td>
                  <td>
                    {m.hasPin ? (
                      <span className="pill pill-green">PIN set</span>
                    ) : (
                      <span className="pill pill-gold">No PIN yet</span>
                    )}
                  </td>
                  {canManage && (
                    <td>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" className="icon-btn" title="Edit" onClick={() => openEdit(m)} aria-label={`Edit ${m.name}`}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                        </button>
                        <button type="button" className="icon-btn" title="Deactivate" onClick={() => handleDeactivate(m)} aria-label={`Deactivate ${m.name}`}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty-state">No members match this filter.</div>}
        </div>
      </div>

      {canManage && (
        <div className="card card-pad" style={{ maxWidth: 520 }}>
          <h3 className="panel-title" style={{ marginBottom: 6 }}>Reactivate a member</h3>
          <p className="report-card-desc" style={{ marginBottom: 12 }}>
            Enter a former member&apos;s CAPID to restore them. Use your authorization PIN in the prompt.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              className="form-input"
              placeholder="CAPID"
              value={reactivateCapid}
              onChange={(e) => setReactivateCapid(e.target.value.replace(/\D/g, ''))}
              style={{ maxWidth: 160 }}
            />
            <button
              type="button"
              className="btn btn-green"
              disabled={!/^\d{6,8}$/.test(reactivateCapid) || loading}
              onClick={() => {
                const enteredPin = window.prompt('Enter your 4-digit PIN to reactivate:');
                if (!enteredPin) return;
                setLoading(true);
                setError('');
                reactivateMember(reactivateCapid, enteredPin)
                  .then(() => { setMessage(`CAPID ${reactivateCapid} reactivated.`); setReactivateCapid(''); })
                  .catch((err) => setError(getCallableError(err) || err.message || 'Reactivate failed.'))
                  .finally(() => setLoading(false));
              }}
            >
              Reactivate
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit drawer */}
      <div className={`drawer-overlay ${drawerOpen ? 'open' : ''}`} onClick={closeDrawer} />
      <aside className={`drawer ${drawerOpen ? 'open' : ''}`} aria-hidden={!drawerOpen}>
        <div className="drawer-header">
          <h2>{mode === 'create' ? 'Add member' : `Edit member`}</h2>
          <button type="button" className="drawer-close" onClick={closeDrawer} aria-label="Close">×</button>
        </div>
        <div className="drawer-body">
          {error && drawerOpen && <div className="banner-error" style={{ marginBottom: 14 }}>{error}</div>}

          {mode === 'create' && (
            <div className="form-group">
              <label className="form-label">CAPID</label>
              <input
                type="text"
                className="form-input"
                inputMode="numeric"
                placeholder="6–8 digit CAPID"
                value={form.capid}
                onChange={(e) => setForm((p) => ({ ...p, capid: e.target.value.replace(/\D/g, '') }))}
              />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">First name</label>
            <input type="text" className="form-input" value={form.firstName}
              onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Middle name (optional)</label>
            <input type="text" className="form-input" value={form.middleName}
              onChange={(e) => setForm((p) => ({ ...p, middleName: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Last name</label>
            <input type="text" className="form-input" value={form.lastName}
              onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Grade / rank</label>
            <GradeRankSelect value={form.grade} onChange={(e) => setForm((p) => ({ ...p, grade: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Your authorization PIN</label>
            <input
              type="password"
              className="form-input"
              maxLength={4}
              inputMode="numeric"
              placeholder="4-digit PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
          <div className="info-note">New members create their own PIN at their first check-in.</div>
        </div>
        <div className="drawer-footer">
          <button type="button" className="btn btn-outline" onClick={closeDrawer}>Cancel</button>
          {mode === 'create' ? (
            <button type="button" className="btn btn-blue" disabled={createDisabled} onClick={handleCreate}>
              {loading ? 'Creating…' : 'Create member'}
            </button>
          ) : (
            <button type="button" className="btn btn-gold"
              disabled={loading || !form.firstName.trim() || !form.lastName.trim() || pin.length !== 4}
              onClick={handleUpdate}>
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
