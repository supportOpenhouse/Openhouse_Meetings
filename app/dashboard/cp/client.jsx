'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Users, Loader2, X } from 'lucide-react';

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
  const [statusFilter, setStatusFilter] = useState(null);
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

  // Apply the active status filter (if any) to the flat row list.
  const visibleCps = statusFilter ? data.cps.filter((c) => c.status_key === statusFilter) : data.cps;
  // Monthly totals recomputed to reflect the current filter.
  const visibleTotals = data.months.map((_, i) =>
    visibleCps.reduce((s, c) => s + (c.monthly[i] || 0), 0)
  );

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
          <button
            type="button"
            className={`oh-cp-chip oh-cp-chip-btn ${!statusFilter ? 'active' : ''}`}
            onClick={() => setStatusFilter(null)}
            style={!statusFilter ? activeChipStyle() : neutralChipStyle()}
          >
            All · {data.counts.total}
          </button>
          {Object.entries(data.counts.byStatus).map(([k, n]) =>
            n > 0 ? (
              <button
                key={k}
                type="button"
                className={`oh-cp-chip oh-cp-chip-btn ${statusFilter === k ? 'active' : ''}`}
                onClick={() => setStatusFilter(statusFilter === k ? null : k)}
                style={chipStyle(k, statusFilter === k)}
                title={`Filter to ${k}`}
              >
                {n} {k}
              </button>
            ) : null
          )}
          {statusFilter && (
            <button
              type="button"
              className="oh-cp-clear-filter"
              onClick={() => setStatusFilter(null)}
              title="Clear filter"
            >
              <X size={12} /> clear
            </button>
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
              <th style={{ minWidth: 110 }}>CP code</th>
              {isAdmin && <th style={{ minWidth: 130 }}>RM</th>}
              <th style={{ minWidth: 180 }}>Status</th>
              {data.months.map((m) => (
                <th key={m.key} className="oh-cp-month-col">
                  {m.short}
                </th>
              ))}
              <th className="oh-cp-month-col oh-cp-total-col">Total</th>
            </tr>
          </thead>
          <tbody>
            {visibleCps.length === 0 && (
              <tr>
                <td
                  colSpan={(isAdmin ? 2 : 1) + 1 + data.months.length + 1}
                  style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 24 }}
                >
                  No CPs match this filter.
                </td>
              </tr>
            )}
            {visibleCps.map((cp) => {
              const rowTotal = cp.monthly.reduce((a, b) => a + b, 0);
              return (
                <tr key={cp.cp_code}>
                  <td className="oh-mono">{cp.cp_code}</td>
                  {isAdmin && (
                    <td>
                      {cp.rm_name || <span className="oh-cp-unassigned">unassigned</span>}
                    </td>
                  )}
                  <td>
                    <span className="oh-cp-chip" style={chipStyle(cp.status_key)}>
                      {cp.status}
                    </span>
                  </td>
                  {cp.monthly.map((n, i) => (
                    <td key={i} className={`oh-cp-cell oh-mono ${n === 0 ? 'zero' : ''}`}>
                      {n}
                    </td>
                  ))}
                  <td className="oh-cp-cell oh-mono oh-cp-total-cell">{rowTotal}</td>
                </tr>
              );
            })}
            <tr className="oh-cp-totals-row">
              <td>Totals</td>
              {isAdmin && <td />}
              <td>{statusFilter ? `(${visibleCps.length} CPs filtered)` : `(${visibleCps.length} CPs)`}</td>
              {visibleTotals.map((t, i) => (
                <td key={i} className="oh-cp-cell oh-mono">{t}</td>
              ))}
              <td className="oh-cp-cell oh-mono oh-cp-total-cell">
                {visibleTotals.reduce((a, b) => a + b, 0)}
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
        .oh-cp-chip {
          font-size: 11.5px;
          padding: 3px 8px;
          border-radius: 999px;
          border: 1px solid;
          font-weight: 500;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .oh-cp-chip-btn {
          cursor: pointer;
          transition: transform 80ms ease, box-shadow 80ms ease;
        }
        .oh-cp-chip-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
        }
        .oh-cp-chip-btn.active {
          font-weight: 600;
        }
        .oh-cp-clear-filter {
          all: unset;
          cursor: pointer;
          color: var(--ink-3);
          font-size: 12px;
          padding: 3px 6px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        .oh-cp-clear-filter:hover {
          color: var(--ink);
          background: var(--paper-2);
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
        .oh-cp-table tbody tr:hover td {
          background: rgba(0, 0, 0, 0.02);
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

function chipStyle(key, active = false) {
  const c = STATUS_COLORS[key] || STATUS_COLORS['Dormant'];
  if (active) {
    // Selected filter — darker fill, bolder border so it pops out of the row.
    return {
      background: c.bg.replace(/0\.\d+\)/, '0.22)'),
      borderColor: c.fg,
      color: c.fg,
      borderWidth: '1.5px',
    };
  }
  return { background: c.bg, borderColor: c.border, color: c.fg };
}

function neutralChipStyle() {
  return {
    background: 'var(--paper-2)',
    borderColor: 'var(--border)',
    color: 'var(--ink-2)',
  };
}

function activeChipStyle() {
  return {
    background: 'var(--ink)',
    borderColor: 'var(--ink)',
    color: 'var(--paper)',
  };
}
