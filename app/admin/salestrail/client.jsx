'use client';

import { useState, useEffect } from 'react';
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
} from 'lucide-react';

// Admin Call-sync screen — status + manual control for the Salestrail pull.
export default function SalestrailClient({ initial }) {
  const router = useRouter();
  const { state, counts, configured } = initial;
  const paused = !!state?.paused;
  const [busy, setBusy] = useState(null); // 'sync' | 'pause' | 'rescan30' | 'rescan90'
  const [flash, setFlash] = useState(null); // { ok, text }
  // Dates are formatted client-side only — formatting on the server (UTC) and
  // re-formatting in the browser (IST) would produce a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
        setFlash({
          ok: true,
          text:
            `Pass done — ${j.processed} transcribed, ${j.imported} newly queued. ` +
            (j.pending > 0
              ? `${j.pending.toLocaleString('en-IN')} still queued — draining continues automatically in the background.`
              : 'Queue is clear. 🎉'),
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
        with a smart summary. Once started, the sync <strong>drains the whole queue on its
        own</strong>, one batch chaining the next, until nothing is left.
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
      <div className={`st-status ${paused ? 'paused' : pending > 0 ? 'draining' : 'idle'}`}>
        {paused ? (
          <><Pause size={15} /> Draining is <strong>paused</strong>.</>
        ) : pending > 0 ? (
          <><Loader2 size={15} className="oh-spin" /> Draining — <strong>{pending.toLocaleString('en-IN')}</strong> recordings still queued.</>
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
        <strong>Sync now</strong> starts the drain and it keeps going by itself — refresh this
        page to watch the queue fall. <strong>Pause</strong> stops it after the current batch.
        A rescan rewinds the cursor to re-check for missed calls.
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

      <style jsx>{`
        .st-warn {
          display: flex;
          gap: 9px;
          align-items: flex-start;
          background: rgba(184, 52, 28, 0.06);
          border: 1px solid rgba(184, 52, 28, 0.25);
          color: var(--ink);
          border-radius: 10px;
          padding: 11px 13px;
          font-size: 13px;
          margin-bottom: 16px;
        }
        .st-warn code {
          font-family: 'Geist Mono', monospace;
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
          background: rgba(184, 52, 28, 0.07);
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
        @media (max-width: 620px) {
          .st-cards {
            grid-template-columns: repeat(2, 1fr);
          }
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
      <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 22, color }}>
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
