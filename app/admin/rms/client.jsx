'use client';

import { useState } from 'react';
import { Plus, Trash2, Shield, User, Mail, X, UserCog } from 'lucide-react';
import Toast from '@/components/Toast';
import { fmtDate } from '@/lib/utils';

export default function RMsClient({ initialRMs, currentUserId }) {
  const [rms, setRMs] = useState(initialRMs);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newRM, setNewRM] = useState({ email: '', name: '', role: 'rm' });
  const [toast, setToast] = useState(null);

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  function roleLabel(role) {
    if (role === 'direct_rm') return 'Direct RM';
    if (role === 'sales_rm') return 'Sales RM';
    return role;
  }

  async function addRM() {
    if (!newRM.email.trim() || !newRM.email.includes('@')) {
      showToast('Valid email required', 'error');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/rms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRM),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add');
      setRMs([data.rm, ...rms]);
      setNewRM({ email: '', name: '', role: 'rm' });
      setShowAdd(false);
      showToast(`Added ${data.rm.email}`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setAdding(false);
    }
  }

  async function toggleActive(rm) {
    try {
      const res = await fetch(`/api/rms/${rm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !rm.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setRMs(rms.map((r) => (r.id === rm.id ? data.rm : r)));
      showToast(`${data.rm.is_active ? 'Activated' : 'Deactivated'} ${data.rm.email}`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function changeRole(rm, role) {
    try {
      const res = await fetch(`/api/rms/${rm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setRMs(rms.map((r) => (r.id === rm.id ? data.rm : r)));
      showToast(`Role updated to ${role}`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function deleteRM(rm) {
    if (!confirm(`Delete ${rm.email}? If they have meetings, this will fail — deactivate instead.`))
      return;
    try {
      const res = await fetch(`/api/rms/${rm.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }
      setRMs(rms.filter((r) => r.id !== rm.id));
      showToast(`Deleted ${rm.email}`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 36,
        }}
      >
        <div>
          <div className="oh-eyebrow">Openhouse · Admin</div>
          <h1 className="oh-h1">
            Manage <em>RMs</em>
          </h1>
        </div>
        {!showAdd && (
          <button className="oh-btn accent" onClick={() => setShowAdd(true)}>
            <Plus size={15} /> Add RM
          </button>
        )}
      </div>

      {showAdd && (
        <div
          className="oh-card"
          style={{ padding: 24, marginBottom: 28, borderLeft: '3px solid var(--accent)' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <h2 className="oh-h2" style={{ margin: 0 }}>
              Invite a new user
            </h2>
            <button
              className="oh-btn ghost"
              style={{ padding: 6 }}
              onClick={() => setShowAdd(false)}
            >
              <X size={14} />
            </button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 18 }}>
            Add the user's Google email here first. They'll then be able to sign in with
            Google.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 12 }}>
            <div className="oh-field">
              <label>
                <Mail size={11} style={{ display: 'inline', marginRight: 4 }} /> Google email
              </label>
              <input
                className="oh-input"
                type="email"
                placeholder="rm@openhouse.in"
                value={newRM.email}
                onChange={(e) => setNewRM({ ...newRM, email: e.target.value })}
                autoFocus
              />
            </div>
            <div className="oh-field">
              <label>
                <User size={11} style={{ display: 'inline', marginRight: 4 }} /> Name (optional)
              </label>
              <input
                className="oh-input"
                placeholder="Display name"
                value={newRM.name}
                onChange={(e) => setNewRM({ ...newRM, name: e.target.value })}
              />
            </div>
            <div className="oh-field">
              <label>
                <UserCog size={11} style={{ display: 'inline', marginRight: 4 }} /> Role
              </label>
              <select
                className="oh-select"
                value={newRM.role}
                onChange={(e) => setNewRM({ ...newRM, role: e.target.value })}
              >
                <option value="rm">RM</option>
                <option value="direct_rm">Direct RM (upload only)</option>
                <option value="sales_rm">Sales RM (field sales)</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="oh-field">
              <label>&nbsp;</label>
              <button
                className="oh-btn primary"
                onClick={addRM}
                disabled={adding || !newRM.email.trim()}
                style={{ padding: '11px 16px' }}
              >
                {adding ? 'Adding…' : 'Add user'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="oh-card" style={{ overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr auto',
            gap: 16,
            padding: '12px 18px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--paper-2)',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--ink-3)',
          }}
        >
          <div>User</div>
          <div>Role</div>
          <div>Status</div>
          <div>Added</div>
          <div></div>
        </div>

        {rms.length === 0 ? (
          <div className="oh-empty">
            <div className="oh-serif">No users yet</div>
            <div>Click "Add RM" to invite your team.</div>
          </div>
        ) : (
          rms.map((rm) => (
            <div
              key={rm.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr auto',
                gap: 16,
                alignItems: 'center',
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {rm.image ? (
                  <img
                    src={rm.image}
                    alt=""
                    style={{ width: 32, height: 32, borderRadius: '50%' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'var(--paper-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      color: 'var(--ink-2)',
                    }}
                  >
                    {(rm.name || rm.email).charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13.5 }}>
                    {rm.name || <em style={{ color: 'var(--ink-3)' }}>(no name yet)</em>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{rm.email}</div>
                </div>
              </div>
              <div>
                {rm.id === currentUserId ? (
                  <span className={`oh-pill ${rm.role === 'admin' ? 'admin' : 'rm'}`}>
                    {rm.role === 'admin' && <Shield size={11} />}
                    {roleLabel(rm.role)} (you)
                  </span>
                ) : (
                  <select
                    className="oh-select"
                    value={rm.role}
                    onChange={(e) => changeRole(rm, e.target.value)}
                    style={{ padding: '6px 10px', fontSize: 12 }}
                  >
                    <option value="rm">RM</option>
                    <option value="direct_rm">Direct RM</option>
                    <option value="sales_rm">Sales RM</option>
                    <option value="admin">Admin</option>
                  </select>
                )}
              </div>
              <div>
                <span className={`oh-pill ${rm.is_active ? 'rm' : 'inactive'}`}>
                  {rm.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {fmtDate(rm.created_at)}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {rm.id !== currentUserId && (
                  <>
                    <button
                      className="oh-btn ghost"
                      style={{ padding: '6px 10px', fontSize: 12 }}
                      onClick={() => toggleActive(rm)}
                    >
                      {rm.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      className="oh-btn danger"
                      style={{ padding: '6px 10px' }}
                      onClick={() => deleteRM(rm)}
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <Toast toast={toast} />
    </div>
  );
}
