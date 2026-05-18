'use client';

import { Fragment, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, RefreshCw, Users, Loader2 } from 'lucide-react';

const STATUS_COLORS = {
  'Consistently Active': { bg: 'rgba(34, 139, 34, 0.10)', border: 'rgba(34, 139, 34, 0.25)', fg: '#2f6f2f' },
  'Active (recent)': { bg: 'rgba(34, 139, 34, 0.07)', border: 'rgba(34, 139, 34, 0.18)', fg: '#3a7a3a' },
  'Active (waning)': { bg: 'rgba(217, 165, 32, 0.10)', border: 'rgba(217, 165, 32, 0.25)', fg: '#8a6914' },
  'New': { bg: 'rgba(59, 130, 246, 0.10)', border: 'rgba(59, 130, 246, 0.25)', fg: '#1f6ad4' },
  'Churned': { bg: 'rgba(192, 57, 43, 0.10)', border: 'rgba(192, 57, 43, 0.25)', fg: '#b03021' },
  'Ghosted': { bg: 'rgba(120, 120, 120, 0.10)', border: 'rgba(120, 120, 120, 0.25)', fg: '#6a6a6a' },
  'Dormant': { bg: 'rgba(120, 120, 120, 0.06)', border: 'rgba(120, 120, 120, 0.18)', fg: '#7a7a7a' },
};

export default function CpDashboardClient({ initialData, initialMonths, isAdmin, user }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState(initialData);
  const [monthsToShow, setMonthsToShow] = useState(initialMonths);
  const [collapsed, setCollapsed] = useState({}); // status_key → bool
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  function toggleAllMonths() {
    const next = monthsToShow === 'all' ? 4 : 'all';
    setMonthsToShow(next);
    startTransition(() => {
      router.push(`/dashboard/cp?months=${next}`);
      router.refresh();
    });
  }

  async function syncNow() {
    if (!isAdmin) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await fetch('/api/cp/sync', { method: 'POST' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Sync failed');
      setSyncMsg(`Synced ${j.rowCount} rows in ${Math.round(j.durationMs / 100) / 10}s`);
      // Reload dashboard data after sync.
      router.refresh();
    } catch (e) {
      setSyncMsg('Error: ' + e.message);
    } finally {
      setSyncing(false);
    }
  }

  // Group CPs by status_key while preserving the server-side order.
  const groups = [];
  {
    let current = null;
    for (const cp of data.cps) {
      if (!current || current.key !== cp.status_key) {
        current = { key: cp.status_key, label: cp.status, items: [] };
        groups.push(current);
      }
      current.items.push(cp);
    }
  }

  return (
    <div className="oh-page">
      <div className="oh-eyebrow">CP visits {isAdmin ? '· all RMs' : `· ${user.name}`}</div>
      <h1 className="oh-h1">
        Channel partner <em>visits</em>
      </h1>
      <p className="oh-sub">
        Monthly visit counts pulled from the shared sheet. {monthsToShow === 'all' ? 'Showing all available months.' : 'Showing the most recent 4 months.'}
        {isAdmin && ' Tap “Sync now” to force-refresh from the sheet.'}
      </p>

      <div className="oh-cp-toolbar">
        <div className="oh-cp-counts">
          <span className="oh-cp-total">{data.counts.total} CPs</span>
          {Object.entries(data.counts.byStatus).map(([k, n]) =>
            n > 0 ? (
              <span key={k} className="oh-cp-chip" style={chipStyle(k)}>
                {n} {k}
              </span>
            ) : null
          )}
        </div>
        <div style={{ flex: 1 }} />
        <button className="oh-btn ghost" onClick={toggleAllMonths} disabled={pending}>
          {pending ? <Loader2 size={14} className="oh-spin" /> : null}
          {monthsToShow === 'all' ? 'Show recent 4 months' : 'View all months'}
        </button>
        {isAdmin && (
          <>
            <button className="oh-btn ghost" onClick={syncNow} disabled={syncing}>
              {syncing ? <Loader2 size={14} className="oh-spin" /> : <RefreshCw size={14} />}
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            <a className="oh-btn" href="/admin/cp-assignments">
              <Users size={14} /> Manage assignments
            </a>
          </>
        )}
      </div>
      {syncMsg && <div className="oh-cp-sync-msg">{syncMsg}</div>}

      <div className="oh-cp-table-wrap">
        <table className="oh-cp-table">
          <thead>
            <tr>
              <th style={{ minWidth: 130 }}>CP code</th>
              {isAdmin && <th style={{ minWidth: 140 }}>RM</th>}
              {data.months.map((m) => (
                <th key={m.key} className="oh-cp-month-col">
                  {m.short}
                </th>
              ))}
              <th className="oh-cp-month-col oh-cp-total-col">Total</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const isCollapsed = collapsed[g.key];
              return (
                <Fragment key={g.key}>
                  <tr className="oh-cp-group-row">
                    <td colSpan={(isAdmin ? 2 : 1) + data.months.length + 1}>
                      <button
                        className="oh-cp-group-toggle"
                        onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !isCollapsed }))}
                      >
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        <span className="oh-cp-chip" style={chipStyle(g.key)}>
                          {g.label}
                        </span>
                        <span className="oh-cp-group-count">{g.items.length}</span>
                      </button>
                    </td>
                  </tr>
                  {!isCollapsed &&
                    g.items.map((cp) => {
                      const rowTotal = cp.monthly.reduce((a, b) => a + b, 0);
                      return (
                        <tr key={cp.cp_code}>
                          <td className="oh-mono">{cp.cp_code}</td>
                          {isAdmin && <td>{cp.rm_name || <span className="oh-cp-unassigned">unassigned</span>}</td>}
                          {cp.monthly.map((n, i) => (
                            <td key={i} className={`oh-cp-cell oh-mono ${n === 0 ? 'zero' : ''}`}>
                              {n}
                            </td>
                          ))}
                          <td className="oh-cp-cell oh-mono oh-cp-total-cell">{rowTotal}</td>
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
            <tr className="oh-cp-totals-row">
              <td>Totals</td>
              {isAdmin && <td />}
              {data.totals.map((t, i) => (
                <td key={i} className="oh-cp-cell oh-mono">{t}</td>
              ))}
              <td className="oh-cp-cell oh-mono oh-cp-total-cell">
                {data.totals.reduce((a, b) => a + b, 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .oh-cp-toolbar {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin: 18px 0 12px;
        }
        .oh-cp-counts {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }
        .oh-cp-total {
          font-size: 13px;
          color: var(--ink-2);
          padding-right: 6px;
          border-right: 1px solid var(--border);
          margin-right: 4px;
        }
        .oh-cp-chip {
          font-size: 11.5px;
          padding: 3px 8px;
          border-radius: 999px;
          border: 1px solid;
          font-weight: 500;
          white-space: nowrap;
        }
        .oh-cp-sync-msg {
          font-size: 13px;
          color: var(--ink-2);
          background: var(--paper-2);
          padding: 8px 12px;
          border-radius: 8px;
          margin-bottom: 12px;
        }
        .oh-cp-table-wrap {
          overflow-x: auto;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--paper);
        }
        .oh-cp-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13.5px;
        }
        .oh-cp-table th,
        .oh-cp-table td {
          padding: 8px 12px;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }
        .oh-cp-table thead th {
          font-weight: 500;
          color: var(--ink-2);
          background: var(--paper-2);
          font-size: 12px;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .oh-cp-month-col {
          text-align: right !important;
          width: 72px;
        }
        .oh-cp-total-col,
        .oh-cp-total-cell {
          border-left: 1px solid var(--border);
          font-weight: 500;
        }
        .oh-cp-cell {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .oh-cp-cell.zero {
          color: var(--ink-3);
        }
        .oh-cp-group-row td {
          background: var(--paper-2);
          padding: 0 !important;
        }
        .oh-cp-group-toggle {
          all: unset;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          width: 100%;
          cursor: pointer;
        }
        .oh-cp-group-toggle:hover {
          background: rgba(0, 0, 0, 0.03);
        }
        .oh-cp-group-count {
          font-size: 12px;
          color: var(--ink-3);
          margin-left: 4px;
        }
        .oh-cp-unassigned {
          color: var(--ink-3);
          font-style: italic;
          font-size: 12.5px;
        }
        .oh-cp-totals-row {
          background: var(--paper-2);
          font-weight: 500;
        }
        .oh-cp-totals-row td {
          border-top: 2px solid var(--border-strong);
        }
        @media (max-width: 768px) {
          .oh-cp-toolbar :global(.oh-btn) {
            font-size: 12.5px;
            padding: 6px 10px;
          }
        }
      `}</style>
    </div>
  );
}

function chipStyle(key) {
  const c = STATUS_COLORS[key] || STATUS_COLORS['Dormant'];
  return { background: c.bg, borderColor: c.border, color: c.fg };
}
