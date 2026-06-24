'use client';

import { useMemo, useState } from 'react';
import {
  CalendarCheck,
  UserCheck,
  UserPlus,
  Boxes,
  Timer,
  Clock,
  BarChart3,
  Trophy,
} from 'lucide-react';
import { fmtDuration, initials } from '@/lib/salesFormat';
import { VisitRow } from '@/app/supply/client';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Map a UTC ISO timestamp to its IST calendar day key 'YYYY-MM-DD'.
function istDayKey(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const ist = new Date(t + IST_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
}

// Today's IST day key.
function istToday() {
  return istDayKey(new Date().toISOString());
}

// The set of IST day keys belonging to the current week (Mon–Sun, IST).
function istWeekKeys() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  const dow = (ist.getUTCDay() + 6) % 7; // 0 = Monday
  const pad = (n) => String(n).padStart(2, '0');
  const out = [];
  const cur = new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - dow)
  );
  for (let i = 0; i < 7; i++) {
    out.push(`${cur.getUTCFullYear()}-${pad(cur.getUTCMonth() + 1)}-${pad(cur.getUTCDate())}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// Short label for a bar (e.g. "Mon 9").
function dayLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()];
  return { wd, d };
}

const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
];

export default function SalesPerformanceClient({ initial, isAdmin, user }) {
  const [tab, setTab] = useState('week');

  const allDays = initial.days || [];
  const today = istToday();
  const weekSet = useMemo(() => new Set(istWeekKeys()), []);

  // The IST day keys that fall inside the active tab's range.
  const rangeDays = useMemo(() => {
    if (tab === 'today') return [today];
    if (tab === 'week') return allDays.filter((d) => weekSet.has(d));
    return allDays;
  }, [tab, allDays, today, weekSet]);

  const rangeSet = useMemo(() => new Set(rangeDays), [rangeDays]);
  const inRange = (iso) => {
    const k = istDayKey(iso);
    return k != null && rangeSet.has(k);
  };

  // Visits filtered to range.
  const visits = useMemo(
    () => (initial.visits || []).filter((v) => inRange(v.check_in_time)),
    [initial.visits, rangeSet] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── metric aggregates ──
  const metrics = useMemo(() => {
    const onboarded = visits.filter((v) => v.meeting_outcome === 'onboarded').length;
    const registered = (initial.registrations || []).filter((r) => inRange(r.created_at)).length;
    const inventory = (initial.inventory || []).filter((i) => inRange(i.created_at)).length;

    const withDur = visits.filter((v) => (v.duration_seconds || 0) > 0);
    const avgDuration = withDur.length
      ? Math.round(withDur.reduce((s, v) => s + (v.duration_seconds || 0), 0) / withDur.length)
      : 0;

    const clockSeconds = (initial.clockSessions || [])
      .filter((c) => inRange(c.clock_in_time))
      .reduce((s, c) => s + Math.max(0, c.duration_seconds || 0), 0);

    return {
      visits: visits.length,
      onboarded,
      registered,
      inventory,
      avgDuration,
      clockSeconds,
    };
  }, [visits, initial.registrations, initial.inventory, initial.clockSessions, rangeSet]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── bar chart: visits per day across the range ──
  const chart = useMemo(() => {
    const counts = {};
    for (const d of rangeDays) counts[d] = 0;
    for (const v of visits) {
      const k = istDayKey(v.check_in_time);
      if (k != null && k in counts) counts[k] += 1;
    }
    const bars = rangeDays.map((d) => ({ key: d, count: counts[d] || 0 }));
    const max = bars.reduce((m, b) => Math.max(m, b.count), 0);
    return { bars, max };
  }, [rangeDays, visits]);

  // ── admin leaderboard (re-scoped to range) ──
  const leaderboard = useMemo(() => {
    if (!isAdmin) return [];
    const byRep = new Map();
    for (const v of visits) {
      const id = v.sales_rm_id;
      if (!id) continue;
      const cur = byRep.get(id) || {
        id,
        name: v.rm_name || '',
        email: v.rm_email || '',
        visits: 0,
        onboarded: 0,
      };
      cur.visits += 1;
      if (v.meeting_outcome === 'onboarded') cur.onboarded += 1;
      byRep.set(id, cur);
    }
    // Seed names from the server leaderboard (covers reps with 0 visits this range).
    const reg = new Map();
    for (const r of initial.registrations || []) {
      if (inRange(r.created_at) && r.created_by) {
        reg.set(r.created_by, (reg.get(r.created_by) || 0) + 1);
      }
    }
    const rows = [];
    for (const rep of initial.leaderboard || []) {
      const live = byRep.get(rep.id);
      rows.push({
        id: rep.id,
        name: rep.name || '',
        email: rep.email || '',
        image: rep.image || null,
        visits: live ? live.visits : 0,
        onboarded: live ? live.onboarded : 0,
        registered: reg.get(rep.id) || 0,
      });
    }
    rows.sort((a, b) => b.visits - a.visits || b.onboarded - a.onboarded);
    return rows;
  }, [isAdmin, visits, initial.leaderboard, initial.registrations, rangeSet]); // eslint-disable-line react-hooks/exhaustive-deps

  const rangeLabel = TABS.find((t) => t.key === tab)?.label.toLowerCase() || '';

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h1 className="oh-h1">
          {isAdmin ? (
            <>
              Team <em>performance</em>
            </>
          ) : (
            <>
              Your <em>performance</em>
            </>
          )}
        </h1>
        <p className="oh-sub" style={{ margin: 0 }}>
          {isAdmin
            ? 'How the supply team is tracking across the period.'
            : 'A snapshot of your activity across the period.'}
        </p>
      </div>

      {/* Date-range tabs */}
      <div className="sx-chips" style={{ marginBottom: 18 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`sx-chip ${tab === t.key ? 'on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Metric cards */}
      <div className="px-stats">
        <div className="sx-stat">
          <div className="ico">
            <CalendarCheck size={17} />
          </div>
          <div className="v">{metrics.visits}</div>
          <div className="l">Visits</div>
        </div>
        <div className="sx-stat">
          <div className="ico green">
            <UserCheck size={17} />
          </div>
          <div className="v">{metrics.onboarded}</div>
          <div className="l">Onboarded</div>
        </div>
        <div className="sx-stat">
          <div className="ico amber">
            <UserPlus size={17} />
          </div>
          <div className="v">{metrics.registered}</div>
          <div className="l">New partners</div>
        </div>
        <div className="sx-stat">
          <div className="ico">
            <Boxes size={17} />
          </div>
          <div className="v">{metrics.inventory}</div>
          <div className="l">Inventory</div>
        </div>
        <div className="sx-stat">
          <div className="ico amber">
            <Timer size={17} />
          </div>
          <div className="v">
            {metrics.avgDuration > 0 ? fmtDuration(metrics.avgDuration) : '—'}
          </div>
          <div className="l">Avg meeting</div>
        </div>
        <div className="sx-stat">
          <div className="ico green">
            <Clock size={17} />
          </div>
          <div className="v">
            {metrics.clockSeconds > 0 ? fmtDuration(metrics.clockSeconds) : '—'}
          </div>
          <div className="l">Clock hours</div>
        </div>
      </div>

      {/* Visits-per-day bar chart */}
      <section className="sx-section">
        <div className="sx-section-head">
          <h2>Visits per day</h2>
          <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
            {tab === 'today' ? 'today' : `this ${tab}`}
          </span>
        </div>
        {chart.max === 0 ? (
          <div className="sx-empty">
            <div className="ico">
              <BarChart3 size={22} />
            </div>
            <div className="t">No visits {rangeLabel === 'today' ? 'today' : `this ${tab}`}</div>
            <div className="s">Logged visits will chart here once you start the period.</div>
          </div>
        ) : (
          <div className="px-chart">
            {chart.bars.map((b) => {
              const isMax = b.count > 0 && b.count === chart.max;
              const h = chart.max ? Math.round((b.count / chart.max) * 100) : 0;
              const { wd, d } = dayLabel(b.key);
              return (
                <div className="px-bar-col" key={b.key} title={`${b.count} visit${b.count === 1 ? '' : 's'}`}>
                  <div className="px-bar-val">{b.count > 0 ? b.count : ''}</div>
                  <div className="px-bar-track">
                    <div
                      className={`px-bar-fill ${isMax ? 'max' : ''}`}
                      style={{ height: `${b.count > 0 ? Math.max(h, 6) : 0}%` }}
                    />
                  </div>
                  <div className="px-bar-lbl">
                    <span className="wd">{wd}</span>
                    <span className="dn">{d}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Admin leaderboard */}
      {isAdmin && (
        <section className="sx-section">
          <div className="sx-section-head">
            <h2>Leaderboard</h2>
          </div>
          {leaderboard.length === 0 ? (
            <div className="sx-empty">
              <div className="ico">
                <Trophy size={22} />
              </div>
              <div className="t">No reps yet</div>
              <div className="s">Once reps log activity they’ll rank here.</div>
            </div>
          ) : (
            <div className="px-board">
              {leaderboard.map((rep, i) => (
                <div className="px-rep" key={rep.id}>
                  <div className={`px-rank ${i < 3 ? `r${i + 1}` : ''}`}>{i + 1}</div>
                  <div className="px-avatar">{initials(rep.name || rep.email)}</div>
                  <div className="px-who">
                    <div className="nm">{rep.name || rep.email || 'Supply rep'}</div>
                    {rep.name && rep.email ? <div className="em">{rep.email}</div> : null}
                  </div>
                  <div className="px-nums">
                    <div className="n">
                      <strong>{rep.visits}</strong>
                      <span>visits</span>
                    </div>
                    <div className="n">
                      <strong>{rep.onboarded}</strong>
                      <span>onboarded</span>
                    </div>
                    <div className="n">
                      <strong>{rep.registered}</strong>
                      <span>partners</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Recent visits in range */}
      <section className="sx-section">
        <div className="sx-section-head">
          <h2>{isAdmin ? 'Recent team visits' : 'Recent visits'}</h2>
        </div>
        {visits.length === 0 ? (
          <div className="sx-empty">
            <div className="ico">
              <CalendarCheck size={22} />
            </div>
            <div className="t">No visits in range</div>
            <div className="s">Visits logged in this period will appear here.</div>
          </div>
        ) : (
          <div className="sx-list">
            {visits.slice(0, 25).map((v) => (
              <VisitRow key={v.id} v={v} />
            ))}
          </div>
        )}
      </section>

      <style jsx>{`
        .px-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .px-chart {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 18px 16px 12px;
          min-height: 180px;
        }
        .px-bar-col {
          flex: 1 1 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .px-bar-val {
          font-size: 11px;
          font-weight: 700;
          color: var(--ink-2);
          height: 14px;
          line-height: 14px;
        }
        .px-bar-track {
          width: 100%;
          height: 120px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          background: var(--bg);
          border-radius: 8px;
          overflow: hidden;
        }
        .px-bar-fill {
          width: 70%;
          max-width: 28px;
          min-height: 0;
          border-radius: 7px 7px 3px 3px;
          background: var(--accent);
          transition: height 0.25s ease;
        }
        .px-bar-fill.max {
          background: var(--amber);
          box-shadow: 0 4px 12px rgba(var(--amber-rgb), 0.4);
        }
        .px-bar-lbl {
          display: flex;
          flex-direction: column;
          align-items: center;
          line-height: 1.1;
        }
        .px-bar-lbl .wd {
          font-size: 9.5px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--ink-3);
        }
        .px-bar-lbl .dn {
          font-size: 12px;
          font-weight: 600;
          color: var(--ink-2);
        }
        .px-board {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .px-rep {
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 13px 15px;
          box-shadow: var(--shadow-sm);
        }
        .px-rank {
          flex-shrink: 0;
          width: 26px;
          height: 26px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 800;
          background: var(--bg);
          color: var(--ink-3);
        }
        .px-rank.r1 {
          background: rgba(var(--amber-rgb), 0.16);
          color: var(--amber-2, var(--amber));
        }
        .px-rank.r2 {
          background: var(--accent-soft);
          color: var(--accent);
        }
        .px-rank.r3 {
          background: var(--success-soft);
          color: var(--success);
        }
        .px-avatar {
          flex-shrink: 0;
          width: 38px;
          height: 38px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          font-weight: 700;
          background: var(--accent-soft);
          color: var(--accent);
        }
        .px-who {
          flex: 1 1 auto;
          min-width: 0;
        }
        .px-who .nm {
          font-size: 14px;
          font-weight: 600;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .px-who .em {
          font-size: 12px;
          color: var(--ink-3);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .px-nums {
          display: flex;
          gap: 16px;
          flex-shrink: 0;
        }
        .px-nums .n {
          display: flex;
          flex-direction: column;
          align-items: center;
          line-height: 1.1;
        }
        .px-nums .n strong {
          font-size: 16px;
          font-weight: 800;
          color: var(--ink);
        }
        .px-nums .n span {
          font-size: 9.5px;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: var(--ink-3);
          margin-top: 2px;
        }
        @media (max-width: 640px) {
          .px-stats {
            grid-template-columns: repeat(2, 1fr);
          }
          .px-nums {
            gap: 12px;
          }
          .px-bar-lbl .wd {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
