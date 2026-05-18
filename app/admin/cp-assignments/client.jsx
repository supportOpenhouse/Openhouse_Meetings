'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, ShieldCheck, Loader2 } from 'lucide-react';

export default function CpAssignmentsClient({ initialAssignments, rms }) {
  const [search, setSearch] = useState('');
  const [rmFilter, setRmFilter] = useState('all');
  const [assignments, setAssignments] = useState(initialAssignments);
  const [savingCp, setSavingCp] = useState(null);
  const [msg, setMsg] = useState(null);

  const rmsById = useMemo(() => Object.fromEntries(rms.map((r) => [r.id, r])), [rms]);

  // Debounced fetch when search/filter changes.
  useEffect(() => {
    const t = setTimeout(async () => {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (rmFilter !== 'all') params.set('rm', rmFilter);
      const r = await fetch(`/api/cp/assignments?${params}`);
      if (r.ok) {
        const j = await r.json();
        setAssignments(j.assignments);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search, rmFilter]);

  async function setAssignment(cp_code, rm_id) {
    setSavingCp(cp_code);
    setMsg(null);
    try {
      const r = await fetch(`/api/cp/assignments/${cp_code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rm_id: rm_id || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Update failed');
      setAssignments((prev) =>
        prev.map((a) =>
          a.cp_code === cp_code
            ? {
                ...a,
                rm_id: j.assignment.rm_id,
                is_admin_override: true,
                rm_name: j.assignment.rm_id ? rmsById[j.assignment.rm_id]?.name : null,
                rm_email: j.assignment.rm_id ? rmsById[j.assignment.rm_id]?.email : null,
              }
            : a
        )
      );
      setMsg(`Updated ${cp_code}`);
    } catch (e) {
      setMsg('Error: ' + e.message);
    } finally {
      setSavingCp(null);
    }
  }

  return (
    <div className="oh-page">
      <div className="oh-eyebrow">Admin</div>
      <h1 className="oh-h1">
        CP <em>assignments</em>
      </h1>
      <p className="oh-sub">
        Reassign channel partners to RMs. Admin overrides take precedence over the gsheet — once you change a row here, future syncs won&rsquo;t touch it.
      </p>

      <div className="oh-cp-asgn-toolbar">
        <div className="oh-cp-asgn-search">
          <Search size={14} />
          <input
            className="oh-input"
            placeholder="Search by CP code or RM name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
        <select
          className="oh-input"
          value={rmFilter}
          onChange={(e) => setRmFilter(e.target.value)}
          style={{ maxWidth: 240 }}
        >
          <option value="all">All RMs</option>
          <option value="unassigned">Unassigned</option>
          {rms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {msg && <div className="oh-cp-sync-msg">{msg}</div>}

      <div className="oh-cp-table-wrap">
        <table className="oh-cp-table">
          <thead>
            <tr>
              <th style={{ width: 140 }}>CP code</th>
              <th>RM</th>
              <th style={{ width: 130 }}>Source</th>
            </tr>
          </thead>
          <tbody>
            {assignments.length === 0 && (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 24 }}>
                  No matches.
                </td>
              </tr>
            )}
            {assignments.map((a) => (
              <tr key={a.cp_code}>
                <td className="oh-mono">{a.cp_code}</td>
                <td>
                  <select
                    className="oh-input"
                    value={a.rm_id || ''}
                    onChange={(e) => setAssignment(a.cp_code, e.target.value || null)}
                    disabled={savingCp === a.cp_code}
                    style={{ maxWidth: 280 }}
                  >
                    <option value="">— Unassigned —</option>
                    {rms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  {savingCp === a.cp_code && (
                    <Loader2 size={13} className="oh-spin" style={{ marginLeft: 8, verticalAlign: 'middle' }} />
                  )}
                </td>
                <td>
                  {a.is_admin_override ? (
                    <span className="oh-cp-override-chip">
                      <ShieldCheck size={12} /> admin
                    </span>
                  ) : (
                    <span className="oh-cp-source-chip">{a.source}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .oh-cp-asgn-toolbar {
          display: flex;
          gap: 10px;
          margin: 16px 0 12px;
          flex-wrap: wrap;
        }
        .oh-cp-asgn-search {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 220px;
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0 10px;
        }
        .oh-cp-asgn-search :global(svg) { color: var(--ink-3); }
        .oh-cp-asgn-search :global(input) { border: none; padding: 8px 0; background: transparent; }
        .oh-cp-override-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11.5px;
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(34, 139, 34, 0.10);
          border: 1px solid rgba(34, 139, 34, 0.25);
          color: #2f6f2f;
          font-weight: 500;
        }
        .oh-cp-source-chip {
          font-size: 11.5px;
          padding: 3px 8px;
          border-radius: 999px;
          background: var(--paper-2);
          color: var(--ink-3);
          border: 1px solid var(--border);
        }
        .oh-cp-sync-msg {
          font-size: 13px;
          color: var(--ink-2);
          background: var(--paper-2);
          padding: 8px 12px;
          border-radius: 8px;
          margin-bottom: 12px;
        }
      `}</style>
    </div>
  );
}
