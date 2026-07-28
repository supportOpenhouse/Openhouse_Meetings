'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Cloud,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  History,
  Pause,
  Play,
  ListFilter,
  ChevronDown,
  ChevronRight,
  Phone,
} from 'lucide-react';
import MeetingDetail from '@/components/MeetingDetail';

const SUPPLY_ROLES = ['supply_rm', 'supply_manager'];
const isSupply = (role) => SUPPLY_ROLES.includes(role);
const STATUS_LABEL = { ready: 'Ready', fetching: 'Queued', failed: 'Failed', no_recording: 'No recording' };

// Admin Call-sync screen — status + manual control for the Salestrail pull.
export default function SalestrailClient({ initial }) {
  const router = useRouter();
  const {
    state,
    counts,
    configured,
    persons = [],
    defaultSinceDays = 14,
  } = initial;
  const paused = !!state?.paused;

  // ── Pulled-recordings browser (filters + foldable date groups) ──────────
  // Fetched client-side (can be thousands of rows) — see the mount effect below.
  const RECORDINGS_LIMIT = 5000;
  const [recs, setRecs] = useState([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsLoaded, setRecsLoaded] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [person, setPerson] = useState('all');
  const [division, setDivision] = useState('all');
  const [expanded, setExpanded] = useState(() => new Set());

  const groups = useMemo(() => groupByPerson(recs), [recs]);
  // Busiest person open by default; re-applied whenever the result set changes.
  useEffect(() => {
    setExpanded(new Set(groups.length ? [groups[0].key] : []));
  }, [groups]);

  // Fetch the filtered recordings. Runs once the mount effect has set the dates
  // (skipped while fromDate is empty), then on every filter change (debounced).
  useEffect(() => {
    if (!fromDate) return undefined;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setRecsLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set('since', `${fromDate}T00:00:00`);
        if (toDate) qs.set('until', `${toDate}T23:59:59`);
        if (person !== 'all') qs.set('rm', person);
        if (division !== 'all') qs.set('division', division);
        const r = await fetch(`/api/admin/salestrail/recordings?${qs}`, { signal: ctrl.signal });
        if (r.ok) {
          setRecs((await r.json()).recordings || []);
          setRecsLoaded(true);
        }
      } catch {
        /* aborted or failed — keep last */
      } finally {
        setRecsLoading(false);
      }
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [fromDate, toDate, person, division]);

  function toggleGroup(key) {
    setExpanded((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }

  // Open a ready call's full recording + transcript + summary (same detail view
  // the dashboard/insights use). Only 'ready' rows have content to show.
  const [detail, setDetail] = useState(null);
  const [detailLoadingId, setDetailLoadingId] = useState(null);
  async function openDetail(id) {
    setDetailLoadingId(id);
    try {
      const r = await fetch(`/api/meetings/${id}`);
      const j = await r.json();
      if (r.ok && j.meeting) setDetail(j.meeting);
    } catch {
      /* ignore — the row stays put */
    } finally {
      setDetailLoadingId(null);
    }
  }
  const [busy, setBusy] = useState(null); // 'sync' | 'pause' | 'rescan30' | 'rescan90'
  const [flash, setFlash] = useState(null); // { ok, text }
  // Dates + night-window check are computed client-side only — formatting on
  // the server (UTC) and re-checking in the browser (IST) would otherwise
  // hydration-mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // Default the date filters to the same window the server pre-loaded (IST).
    const now = Date.now();
    setToDate(istDateKey(now));
    setFromDate(istDateKey(now - defaultSinceDays * 86400000));
  }, [defaultSinceDays]);
  const inNightWindow = mounted ? isNightWindowIST() : true;

  async function run(label, body) {
    setBusy(label);
    setFlash(null);
    try {
      const r = await fetch('/api/salestrail/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || `Server returned ${r.status}`);
      if (j.paused) {
        setFlash({ ok: true, text: 'Continuous draining paused.' });
      } else if (j.skipped) {
        setFlash({ ok: true, text: j.reason || 'Sync already running.' });
      } else {
        const tail =
          j.pending > 0
            ? j.chained
              ? `${j.pending.toLocaleString('en-IN')} still queued — draining continues automatically.`
              : `${j.pending.toLocaleString('en-IN')} still queued — auto-drain resumes at 10 PM IST.`
            : 'Queue is clear. 🎉';
        setFlash({
          ok: true,
          text: `Pass done — ${j.processed} transcribed, ${j.imported} newly queued. ${tail}`,
        });
      }
      router.refresh();
    } catch (e) {
      setFlash({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  }

  const last = state?.last_result || null;
  const pending = counts.pending || 0;

  return (
    <div className="oh-page" style={{ maxWidth: 760 }}>
      <div className="oh-eyebrow">Openhouse · Admin</div>
      <h1 className="oh-h1">
        Call <em>sync</em>
      </h1>
      <p className="oh-sub">
        Phone-call recordings are pulled automatically from Salestrail — only{' '}
        <strong>Monday &amp; Friday</strong> calls by regular RMs, saved as engagement meetings
        with a smart summary. The automatic drain runs nightly{' '}
        <strong>10 PM – 6 AM IST</strong> so it doesn't interfere with daytime uploads.{' '}
        <strong>Sync now</strong> below runs one pass anytime.
      </p>

      {!configured && (
        <div className="st-warn">
          <AlertCircle size={15} />
          <div>
            Salestrail credentials are not set. Add <code>SALESTRAIL_API_USERNAME</code>,{' '}
            <code>SALESTRAIL_API_PASSWORD</code> and <code>CRON_SECRET</code> in Vercel, then
            redeploy. <code>CRON_SECRET</code> is required for the continuous drain to chain.
          </div>
        </div>
      )}

      {/* Live status line */}
      <div className={`st-status ${paused ? 'paused' : pending > 0 ? (inNightWindow ? 'draining' : 'waiting') : 'idle'}`}>
        {paused ? (
          <><Pause size={15} /> Draining is <strong>paused</strong>.</>
        ) : pending > 0 && inNightWindow ? (
          <><Loader2 size={15} className="oh-spin" /> Draining — <strong>{pending.toLocaleString('en-IN')}</strong> recordings still queued.</>
        ) : pending > 0 ? (
          <><Pause size={15} /> <strong>{pending.toLocaleString('en-IN')}</strong> queued — auto-drain resumes at <strong>10 PM IST</strong>.</>
        ) : (
          <><CheckCircle2 size={15} /> Queue is clear.</>
        )}
      </div>

      <div className="st-cards">
        <Stat label="Imported & ready" value={counts.ready} tone="good" />
        <Stat label="Queued" value={counts.pending} tone="muted" />
        <Stat label="No recording" value={counts.no_recording} tone="muted" />
        <Stat label="Failed" value={counts.failed} tone={counts.failed ? 'bad' : 'muted'} />
      </div>

      <div className="st-actions">
        <button className="oh-btn accent" disabled={!!busy} onClick={() => run('sync')}>
          {busy === 'sync' ? <Loader2 size={14} className="oh-spin" /> : paused ? <Play size={14} /> : <RefreshCw size={14} />}
          {busy === 'sync' ? 'Starting…' : paused ? 'Resume draining' : 'Sync now'}
        </button>
        {!paused && (
          <button className="oh-btn ghost" disabled={!!busy} onClick={() => run('pause', { action: 'pause' })}>
            {busy === 'pause' ? <Loader2 size={14} className="oh-spin" /> : <Pause size={14} />}
            Pause draining
          </button>
        )}
        <button
          className="oh-btn ghost"
          disabled={!!busy}
          onClick={() => run('rescan30', { rescanDays: 30 })}
        >
          {busy === 'rescan30' ? <Loader2 size={14} className="oh-spin" /> : <History size={14} />}
          Rescan 30 days
        </button>
        <button
          className="oh-btn ghost"
          disabled={!!busy}
          onClick={() => run('rescan90', { rescanDays: 90 })}
        >
          {busy === 'rescan90' ? <Loader2 size={14} className="oh-spin" /> : <History size={14} />}
          Rescan 90 days
        </button>
      </div>
      <p className="st-hint">
        <strong>10 PM – 6 AM IST:</strong> the drain runs continuously, batch after batch, until
        the queue empties. <strong>Daytime:</strong> Sync now runs one immediate pass (no
        chaining) so it doesn't fight live uploads. <strong>Pause</strong> stops the next
        chained run. A rescan rewinds the cursor to re-check for missed calls.
      </p>

      {flash && (
        <div className={`st-flash ${flash.ok ? 'ok' : 'err'}`}>
          {flash.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {flash.text}
        </div>
      )}

      <div className="st-section">
        <div className="st-section-head">
          <Cloud size={14} /> Last run
        </div>
        {!state?.last_run_at ? (
          <div className="st-empty">The sync has not run yet.</div>
        ) : (
          <div className="st-lastrun">
            <Row k="When" v={mounted ? fmt(state.last_run_at) : '—'} />
            <Row
              k="Synced up to"
              v={!state.cursor_at ? 'not started' : mounted ? fmt(state.cursor_at) : '—'}
            />
            {last?.window && (
              <Row
                k="Last window"
                v={mounted ? `${fmtShort(last.window.from)} → ${fmtShort(last.window.to)}` : '—'}
              />
            )}
            {last && (
              <Row
                k="Result"
                v={
                  last.error
                    ? `Error: ${last.error}`
                    : `${last.batches || 0} batch(es) · ${last.processed} transcribed · ${last.imported} newly queued · ${last.no_recording} no recording · ${last.failed} failed`
                }
              />
            )}
          </div>
        )}
      </div>

      {mounted && (
        <div className="st-section">
          <div className="st-section-head">
            <ListFilter size={14} /> Pulled recordings
          </div>

          <div className="rec-filters">
            <label className="rec-field">
              <span>From</span>
              <input
                className="oh-input"
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </label>
            <label className="rec-field">
              <span>To</span>
              <input
                className="oh-input"
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => setToDate(e.target.value)}
              />
            </label>
            <label className="rec-field">
              <span>Person</span>
              <select className="oh-input" value={person} onChange={(e) => setPerson(e.target.value)}>
                <option value="all">Everyone</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.email}
                    {isSupply(p.role) ? ' · Supply' : ''} ({p.n})
                  </option>
                ))}
              </select>
            </label>
            <div className="rec-seg" role="group" aria-label="Division">
              {[['all', 'All'], ['supply', 'Supply'], ['demand', 'Demand']].map(([v, l]) => (
                <button key={v} type="button" className={division === v ? 'on' : ''} onClick={() => setDivision(v)}>
                  {l}
                </button>
              ))}
            </div>
            {recsLoading && <Loader2 size={15} className="oh-spin" style={{ color: 'var(--ink-3)' }} />}
          </div>

          <div className="rec-summary">
            <strong>{recs.length.toLocaleString('en-IN')}</strong> call{recs.length === 1 ? '' : 's'} ·{' '}
            {groups.length} {groups.length === 1 ? 'person' : 'people'}
            {recs.length >= RECORDINGS_LIMIT && (
              <span className="rec-cap"> · showing the most recent {RECORDINGS_LIMIT.toLocaleString('en-IN')} — narrow the range for older</span>
            )}
          </div>
          <div className="rec-note">
            <strong>Ready</strong> calls are clickable — open the recording, transcript &amp; summary.{' '}
            <strong>No recording</strong> means Salestrail has no audio for that call: usually a
            missed / unanswered call, or one the recorder didn&apos;t capture.
          </div>

          {!recsLoaded && recsLoading ? (
            <div className="st-empty" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={15} className="oh-spin" /> Loading recordings…
            </div>
          ) : groups.length === 0 ? (
            <div className="st-empty">No recordings match these filters.</div>
          ) : (
            <div className="rec-groups">
              {groups.map((g) => {
                const open = expanded.has(g.key);
                return (
                  <div key={g.key} className="rec-group">
                    <button
                      type="button"
                      className="rec-ghead"
                      onClick={() => toggleGroup(g.key)}
                      aria-expanded={open}
                    >
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <span className="rec-date">{g.label}</span>
                      <span className={`rec-div ${isSupply(g.role) ? 'supply' : 'demand'}`}>
                        {isSupply(g.role) ? 'Supply' : 'Demand'}
                      </span>
                      <span className="rec-gmeta">
                        {g.count} call{g.count === 1 ? '' : 's'} · {g.recorded} rec / {g.noRec} no-rec ·{' '}
                        {fmtMinutes(g.totalDuration)}
                        {g.failed ? ` · ${g.failed} failed` : ''}
                      </span>
                    </button>
                    {open && (
                      <div className="rec-rows">
                        {g.items.map((r) => {
                          const openable = r.status === 'ready';
                          return (
                            <div
                              key={r.id}
                              className={`rec-row ${openable ? 'clickable' : ''}`}
                              onClick={openable ? () => openDetail(r.id) : undefined}
                              role={openable ? 'button' : undefined}
                              tabIndex={openable ? 0 : undefined}
                              onKeyDown={
                                openable
                                  ? (e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        openDetail(r.id);
                                      }
                                    }
                                  : undefined
                              }
                            >
                              <span className="rec-when">{istDateTime(r.started_at)}</span>
                              <span className="rec-num">
                                <Phone size={11} /> {r.cp_mobile || '—'}
                              </span>
                              <span className="rec-dur">{fmtDur(r.duration_seconds)}</span>
                              <span className={`rec-status s-${r.status}`}>
                                {STATUS_LABEL[r.status] || r.status}
                              </span>
                              <span className="rec-go">
                                {detailLoadingId === r.id ? (
                                  <Loader2 size={14} className="oh-spin" />
                                ) : openable ? (
                                  <ChevronRight size={14} />
                                ) : null}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {detail && <MeetingDetail meeting={detail} onClose={() => setDetail(null)} />}

      <style jsx>{`
        .st-warn {
          display: flex;
          gap: 9px;
          align-items: flex-start;
          background: rgba(var(--accent-rgb), 0.06);
          border: 1px solid rgba(var(--accent-rgb), 0.25);
          color: var(--ink);
          border-radius: 10px;
          padding: 11px 13px;
          font-size: 13px;
          margin-bottom: 16px;
        }
        .st-warn code {
          font-family: var(--font-mono), monospace;
          font-size: 11.5px;
          background: var(--paper-2);
          padding: 1px 5px;
          border-radius: 4px;
        }
        .st-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13.5px;
          border-radius: 10px;
          padding: 10px 13px;
          margin: 16px 0 4px;
        }
        .st-status.draining {
          background: rgba(79, 70, 160, 0.07);
          color: #4f46a0;
          border: 1px solid rgba(79, 70, 160, 0.22);
        }
        .st-status.waiting {
          background: rgba(74, 107, 122, 0.08);
          color: #4a6b7a;
          border: 1px solid rgba(74, 107, 122, 0.25);
        }
        .st-status.paused {
          background: rgba(196, 122, 26, 0.09);
          color: #b97417;
          border: 1px solid rgba(196, 122, 26, 0.28);
        }
        .st-status.idle {
          background: rgba(47, 111, 47, 0.08);
          color: #2f6f2f;
          border: 1px solid rgba(47, 111, 47, 0.2);
        }
        .st-cards {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin: 14px 0;
        }
        .st-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 6px;
        }
        .st-hint {
          font-size: 12px;
          color: var(--ink-3);
          margin-top: 9px;
          line-height: 1.55;
        }
        .st-flash {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;
          border-radius: 9px;
          padding: 9px 12px;
          margin-top: 12px;
        }
        .st-flash.ok {
          background: rgba(47, 111, 47, 0.08);
          color: #2f6f2f;
        }
        .st-flash.err {
          background: rgba(var(--accent-rgb), 0.07);
          color: #b03021;
        }
        .st-section {
          margin-top: 26px;
        }
        .st-section-head {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-3);
          font-weight: 600;
          margin-bottom: 10px;
        }
        .st-empty {
          font-size: 13px;
          color: var(--ink-3);
          background: var(--paper-2);
          border-radius: 9px;
          padding: 12px 14px;
        }
        .st-lastrun {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 11px;
          padding: 6px 16px;
        }
        .rec-filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; margin-bottom: 12px; }
        .rec-field { display: flex; flex-direction: column; gap: 4px; font-size: 10.5px; color: var(--ink-3); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
        .rec-field .oh-input { min-width: 130px; }
        .rec-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; align-self: flex-end; }
        .rec-seg button { all: unset; cursor: pointer; padding: 8px 14px; font-size: 12.5px; color: var(--ink-2); }
        .rec-seg button + button { border-left: 1px solid var(--border); }
        .rec-seg button.on { background: var(--accent); color: #fff; }
        .rec-summary { font-size: 12.5px; color: var(--ink-3); margin-bottom: 6px; }
        .rec-summary strong { color: var(--ink); }
        .rec-cap { color: #b97417; }
        .rec-note { font-size: 11.5px; color: var(--ink-3); line-height: 1.55; margin-bottom: 12px; }
        .rec-note strong { color: var(--ink-2); font-weight: 600; }
        .rec-groups { display: flex; flex-direction: column; gap: 8px; }
        .rec-group { border: 1px solid var(--border); border-radius: 11px; overflow: hidden; background: var(--paper); }
        .rec-ghead { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; align-items: center; gap: 9px; padding: 12px 14px; }
        .rec-ghead:hover { background: var(--paper-2); }
        .rec-date { font-weight: 600; font-size: 13.5px; color: var(--ink); }
        .rec-gmeta { font-size: 12px; color: var(--ink-3); margin-left: auto; text-align: right; }
        .rec-rows { border-top: 1px solid var(--border); }
        .rec-row { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-bottom: 1px solid var(--border); font-size: 12.5px; flex-wrap: wrap; }
        .rec-row:last-child { border-bottom: none; }
        .rec-row.clickable { cursor: pointer; }
        .rec-row.clickable:hover { background: var(--paper-2); }
        .rec-go { display: inline-flex; align-items: center; color: var(--ink-3); width: 14px; }
        .rec-name { font-weight: 600; color: var(--ink); }
        .rec-div { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 6px; border-radius: 5px; }
        .rec-div.supply { background: rgba(var(--accent-rgb), 0.1); color: var(--accent); }
        .rec-div.demand { background: var(--paper-2); color: var(--ink-2); }
        .rec-when { color: var(--ink-2); min-width: 118px; }
        .rec-num { color: var(--ink-2); display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-mono), monospace; font-size: 11.5px; }
        .rec-dur { color: var(--ink-3); font-family: var(--font-mono), monospace; margin-left: auto; }
        .rec-status { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 7px; border-radius: 5px; }
        .rec-status.s-ready { background: rgba(47, 111, 47, 0.1); color: #2f6f2f; }
        .rec-status.s-fetching { background: rgba(196, 122, 26, 0.12); color: #b97417; }
        .rec-status.s-failed { background: rgba(176, 48, 33, 0.1); color: #b03021; }
        .rec-status.s-no_recording { background: var(--paper-2); color: var(--ink-3); }
        @media (max-width: 620px) {
          .st-cards {
            grid-template-columns: repeat(2, 1fr);
          }
          .rec-field, .rec-field .oh-input { min-width: 0; }
          .rec-field { flex: 1; }
          .rec-dur { margin-left: 0; }
          .rec-gmeta { font-size: 11px; }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const color =
    tone === 'good' ? '#2f6f2f' : tone === 'bad' ? '#b03021' : 'var(--ink)';
  return (
    <div
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--border)',
        borderRadius: 11,
        padding: '12px 14px',
      }}
    >
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 22, color }}>
        {(value ?? 0).toLocaleString('en-IN')}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
        fontSize: 13,
      }}
    >
      <div style={{ width: 120, flexShrink: 0, color: 'var(--ink-3)' }}>{k}</div>
      <div style={{ color: 'var(--ink)', minWidth: 0, wordBreak: 'break-word' }}>{v}</div>
    </div>
  );
}

function fmt(iso) {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return String(iso);
  }
}

function fmtShort(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return String(iso);
  }
}

// 'YYYY-MM-DD' in IST — a stable group/sort key (accepts ms or ISO string).
function istDateKey(v) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(v));
}

// "27 Jul, 7:45 pm" in IST — shown per row now that grouping is by person.
function istDateTime(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function fmtDur(s) {
  const n = Math.max(0, Math.round(s || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

// Total talk time as minutes / hours (per-person totals get large).
function fmtMinutes(s) {
  const min = Math.round((s || 0) / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

// Group DESC-ordered recordings by the person (RM) who made the call — busiest
// person first; each person's calls stay newest-first.
function groupByPerson(recs) {
  const map = new Map();
  for (const r of recs) {
    const key = r.rm_id || r.rm_email || 'unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  const groups = [...map.entries()].map(([key, items]) => ({
    key,
    label: items[0].rm_name || items[0].rm_email || 'Unknown',
    role: items[0].rm_role,
    items,
    count: items.length,
    totalDuration: items.reduce((a, i) => a + (i.duration_seconds || 0), 0),
    recorded: items.filter((i) => i.status === 'ready').length,
    noRec: items.filter((i) => i.status === 'no_recording').length,
    failed: items.filter((i) => i.status === 'failed').length,
  }));
  groups.sort((a, b) => b.count - a.count);
  return groups;
}

// IST night window for the continuous drain — must mirror the server-side
// constants in lib/salestrail.js (SYNC_START_HOUR_IST / SYNC_END_HOUR_IST).
function isNightWindowIST() {
  const utc = new Date();
  const istH = new Date(utc.getTime() + 5.5 * 60 * 60 * 1000).getUTCHours();
  return istH >= 22 || istH < 6;
}
