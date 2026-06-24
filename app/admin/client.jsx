'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Users, X, Calendar } from 'lucide-react';
import MeetingsTable from '@/components/MeetingsTable';
import MeetingDetail from '@/components/MeetingDetail';
import MeetingThreadDetail from '@/components/MeetingThreadDetail';
import Toast from '@/components/Toast';
import { fmtDate } from '@/lib/utils';
import { usePollWhileProcessing } from '@/lib/usePollWhileProcessing';
import { collapseVisitThreads } from '@/lib/collapseVisits';

// One global date filter at the top of the admin page. Activity windows become
// clickable presets that set this filter; Per-RM cards, the meetings table, and
// the CSV export all read from the same filtered set.
const PRESETS = [
  { key: 'today', label: 'Today', days: 1 },
  { key: 'week', label: 'Last 7 days', days: 7 },
  { key: 'month', label: 'Last 30 days', days: 30 },
  { key: 'ninety', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
];

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return toLocalDateValue(d);
}
function nDaysAgoISO(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (n - 1));
  return toLocalDateValue(d);
}
// `<input type="date">` expects YYYY-MM-DD in local time.
function toLocalDateValue(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AdminOverviewClient({ initialMeetings, rms, cities = [] }) {
  const [meetings, setMeetings] = useState(initialMeetings);
  usePollWhileProcessing(meetings, setMeetings);
  const [openMeeting, setOpenMeeting] = useState(null);
  const [openDetail, setOpenDetail] = useState(null);
  const [openThread, setOpenThread] = useState(null);
  const [toast, setToast] = useState(null);

  // Global date range filter — shared by stats, Per-RM cards, table, and export.
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');

  // RM filter — driven by the clickable Per-RM cards, shared with the table.
  const [rmFilter, setRmFilter] = useState('all');
  const tableRef = useRef(null);

  // Clicking an RM card filters the table to that RM (clicking it again clears).
  function selectRm(id) {
    setRmFilter((cur) => (cur === id ? 'all' : id));
    if (tableRef.current) {
      tableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  function applyPreset(key) {
    if (key === 'all') {
      setSince('');
      setUntil('');
      return;
    }
    if (key === 'today') {
      const t = startOfTodayISO();
      setSince(t);
      setUntil(t);
      return;
    }
    const preset = PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setSince(nDaysAgoISO(preset.days));
    setUntil(toLocalDateValue(new Date()));
  }

  // Identify which preset (if any) the current range matches, so the active card lights up.
  const activePresetKey = useMemo(() => {
    if (!since && !until) return 'all';
    if (since && until && since === until && since === startOfTodayISO()) return 'today';
    const today = toLocalDateValue(new Date());
    if (until !== today) return null;
    for (const p of PRESETS) {
      if (p.days && since === nDaysAgoISO(p.days)) return p.key;
    }
    return null;
  }, [since, until]);

  // Filtered meeting list — single source of truth for stats + table.
  // since/until are YYYY-MM-DD. We append an explicit local time so the
  // browser parses them in the user's timezone — `new Date('2026-05-21')`
  // alone is parsed as UTC midnight, which made "Today" start 5.5h late
  // for IST and drop early-morning meetings.
  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      const t = new Date(m.started_at);
      if (since) {
        const start = new Date(`${since}T00:00:00`);
        if (t < start) return false;
      }
      if (until) {
        const end = new Date(`${until}T23:59:59.999`);
        if (t > end) return false;
      }
      return true;
    });
  }, [meetings, since, until]);

  // Activity-window counts are computed from the UNFILTERED list — they stay as quick
  // reference points regardless of the current selection. The user told us they want
  // the windows to be "affected by" the filter; we interpret that as: clicking a window
  // sets the filter, and the rest of the page reflects it.
  const stats = useMemo(() => computeWindowStats(meetings), [meetings]);

  // Per-RM cards reflect whatever date range is currently selected.
  const perRm = useMemo(() => computePerRm(filteredMeetings, rms), [filteredMeetings, rms]);

  // Total for the currently filtered range — shown next to the date pickers.
  const filteredTotal = useMemo(() => {
    let secs = 0;
    for (const m of filteredMeetings) secs += m.duration_seconds || 0;
    return { count: filteredMeetings.length, minutes: Math.round(secs / 60) };
  }, [filteredMeetings]);

  async function openMeetingFull(m) {
    setOpenMeeting(m);
    try {
      const res = await fetch(`/api/meetings/${m.id}`);
      const data = await res.json();
      if (res.ok) setOpenDetail(data.meeting);
    } catch (e) {
      showToast('Could not load meeting', 'error');
    }
  }

  function handleExport(tableFilters) {
    // Date range comes from the parent (us); the rest comes from MeetingsTable.
    const params = new URLSearchParams();
    if (tableFilters.rmFilter && tableFilters.rmFilter !== 'all') params.set('rm', tableFilters.rmFilter);
    if (tableFilters.cityFilter && tableFilters.cityFilter !== 'all') params.set('city', tableFilters.cityFilter);
    if (tableFilters.search) params.set('search', tableFilters.search);
    if (since) params.set('start', since);
    if (until) {
      const u = new Date(until);
      if (!isNaN(u)) {
        u.setHours(23, 59, 59, 999);
        params.set('end', u.toISOString());
      }
    }
    window.location.href = `/api/admin/export?${params.toString()}`;
  }

  async function handleDelete() {
    if (!openMeeting) return;
    if (!confirm('Delete this meeting? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/meetings/${openMeeting.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setMeetings(meetings.filter((m) => m.id !== openMeeting.id));
      setOpenMeeting(null);
      setOpenDetail(null);
      showToast('Meeting deleted', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  const hasRange = since || until;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 28,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div className="oh-eyebrow">Openhouse · Admin</div>
          <h1 className="oh-h1">
            Team <em>overview</em>
          </h1>
        </div>
        <Link href="/admin/rms" className="oh-btn primary">
          <Users size={15} /> Manage RMs
        </Link>
      </div>

      {/* Global date filter (drives stats, table, export) */}
      <div className="oh-date-bar">
        <div className="oh-date-bar-label">Date range</div>
        <div className="oh-date-bar-controls">
          <label className="oh-date-field">
            <span className="oh-date-field-label">
              <Calendar size={12} /> From
            </span>
            <input
              className="oh-input oh-date"
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              aria-label="From date"
            />
          </label>
          <label className="oh-date-field">
            <span className="oh-date-field-label">
              <Calendar size={12} /> To
            </span>
            <input
              className="oh-input oh-date"
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              aria-label="To date"
            />
          </label>
          {hasRange && (
            <button
              type="button"
              className="oh-btn ghost oh-clear-btn"
              onClick={() => { setSince(''); setUntil(''); }}
            >
              <X size={13} /> Clear
            </button>
          )}
        </div>
        <div className="oh-date-bar-total">
          <strong>{filteredTotal.count}</strong> meeting{filteredTotal.count === 1 ? '' : 's'}
          <span style={{ color: 'var(--ink-3)' }}> · {filteredTotal.minutes} min</span>
        </div>
      </div>

      {/* Activity windows — click to set the date range */}
      <h2 className="oh-h2">Activity windows</h2>
      <div className="oh-activity-grid">
        <Preset
          label="Today"
          stat={stats.day}
          active={activePresetKey === 'today'}
          onClick={() => applyPreset('today')}
        />
        <Preset
          label="Last 7 days"
          stat={stats.week}
          active={activePresetKey === 'week'}
          onClick={() => applyPreset('week')}
        />
        <Preset
          label="Last 30 days"
          stat={stats.month}
          active={activePresetKey === 'month'}
          onClick={() => applyPreset('month')}
        />
        <Preset
          label="Last 90 days"
          stat={stats.ninety}
          active={activePresetKey === 'ninety'}
          onClick={() => applyPreset('ninety')}
        />
        <Preset
          label="All time"
          stat={stats.total}
          active={activePresetKey === 'all'}
          onClick={() => applyPreset('all')}
        />
      </div>

      {/* Per-RM cards — reflect the current date filter */}
      {perRm.length > 0 && (
        <>
          <h2 className="oh-h2" style={{ marginTop: 32 }}>
            Per RM{' '}
            <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 400 }}>
              {hasRange ? '· filtered · ' : '· '}tap a card to filter the table
            </span>
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 12,
              marginBottom: 40,
            }}
          >
            {perRm
              .sort((a, b) => new Date(b.last_meeting || 0) - new Date(a.last_meeting || 0))
              .map((r) => (
                <div
                  key={r.rm_id}
                  className={`oh-rm-card oh-rm-card-btn ${rmFilter === r.rm_id ? 'active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectRm(r.rm_id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectRm(r.rm_id);
                    }
                  }}
                  title={`Filter the meetings table by ${r.rm_name || r.rm_email}`}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="name">{r.rm_name || r.rm_email}</div>
                    <div className="email">
                      {r.last_meeting ? `last: ${fmtDate(r.last_meeting)}` : 'no meetings in range'}
                    </div>
                  </div>
                  <div className="stats">
                    <div>
                      <strong>{r.count}</strong>
                      meetings
                    </div>
                    <div>
                      <strong>{r.minutes}</strong>
                      min
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      <div ref={tableRef}>
        <h2 className="oh-h2">All meetings</h2>
        <MeetingsTable
          meetings={collapseVisitThreads(filteredMeetings)}
          rms={rms}
          cities={cities}
          onOpen={openMeetingFull}
          onOpenThread={(items) => setOpenThread(items)}
          showRMColumn={true}
          onExport={handleExport}
          hideDateFilter={true}
          rmFilter={rmFilter}
          onRmFilterChange={setRmFilter}
        />
      </div>

      {openMeeting && openDetail && (
        <MeetingDetail
          meeting={openDetail}
          onClose={() => {
            setOpenMeeting(null);
            setOpenDetail(null);
          }}
          onDelete={handleDelete}
          canDelete={true}
        />
      )}

      {openThread && (
        <MeetingThreadDetail
          meetings={openThread}
          onClose={() => setOpenThread(null)}
        />
      )}

      <Toast toast={toast} />

      <style jsx>{`
        .oh-rm-card-btn {
          cursor: pointer;
          transition: border-color 0.12s, background 0.12s;
        }
        .oh-rm-card-btn:hover {
          border-color: var(--ink-2);
        }
        .oh-rm-card-btn.active {
          border-color: var(--accent);
          background: rgba(var(--accent-rgb), 0.05);
        }
      `}</style>
    </div>
  );
}

function Preset({ label, stat, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`oh-card oh-stat oh-preset ${active ? 'active' : ''}`}
    >
      <div className="l">{label}</div>
      <div className="v">{stat.count}</div>
      <div className="sub">{stat.minutes} min</div>
    </button>
  );
}

// ---------- Pure derivations ----------

function computeWindowStats(meetings) {
  // Calendar-aligned windows (local timezone), so the cards match the date
  // presets exactly. "Today" = since local midnight — NOT a rolling 24h
  // window, which previously over-counted by pulling in late-yesterday.
  // IST calendar midnight, computed deterministically (independent of the
  // server's runtime timezone) so SSR and the client agree → no hydration
  // mismatch (#422) and "today" means IST-today everywhere.
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  const dayMs = 24 * 60 * 60 * 1000;
  const todayCut =
    Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - IST_OFFSET_MS;
  const week = todayCut - 6 * dayMs; // 7 calendar days incl. today
  const month = todayCut - 29 * dayMs; // 30 calendar days
  const ninety = todayCut - 89 * dayMs; // 90 calendar days

  const acc = (cutoff) => {
    let count = 0;
    let secs = 0;
    for (const m of meetings) {
      const t = new Date(m.started_at).getTime();
      if (cutoff === null || t >= cutoff) {
        count += 1;
        secs += m.duration_seconds || 0;
      }
    }
    return { count, minutes: Math.round(secs / 60) };
  };

  return {
    day: acc(todayCut),
    week: acc(week),
    month: acc(month),
    ninety: acc(ninety),
    total: acc(null),
  };
}

function computePerRm(meetings, rms) {
  const byId = new Map();
  for (const m of meetings) {
    const key = m.rm_id;
    if (!key) continue;
    const row = byId.get(key) || {
      rm_id: key,
      rm_name: m.rm_name,
      rm_email: m.rm_email,
      count: 0,
      secs: 0,
      last_meeting: null,
    };
    row.count += 1;
    row.secs += m.duration_seconds || 0;
    const t = m.started_at;
    if (!row.last_meeting || new Date(t) > new Date(row.last_meeting)) row.last_meeting = t;
    byId.set(key, row);
  }
  return Array.from(byId.values()).map((r) => ({
    ...r,
    minutes: Math.round(r.secs / 60),
  }));
}
