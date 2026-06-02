'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, AlertCircle, Clock, Volume2, FileText, Sparkles, User } from 'lucide-react';
import { fmtDate, fmtDuration } from '@/lib/utils';
import WebmAudio from './WebmAudio';

// Stacked detail view for visit recordings sharing the same cp_visit_id.
// The list page collapses these into one row (with a "+N more" badge); on
// click we land here with the full set of meetings, fetch each one's
// transcript + summary in parallel, and render them top to bottom so the
// admin sees the entire visit as one document.
export default function MeetingThreadDetail({ meetings, onClose }) {
  const [details, setDetails] = useState({}); // id → full meeting
  const [loadingIds, setLoadingIds] = useState(new Set(meetings.map((m) => m.id)));
  const [errorIds, setErrorIds] = useState(new Set());

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.all(
        meetings.map(async (m) => {
          try {
            const r = await fetch(`/api/meetings/${m.id}`);
            const j = await r.json();
            if (cancelled) return;
            if (r.ok && j.meeting) {
              setDetails((d) => ({ ...d, [m.id]: j.meeting }));
            } else {
              setErrorIds((s) => new Set(s).add(m.id));
            }
          } catch {
            if (!cancelled) setErrorIds((s) => new Set(s).add(m.id));
          } finally {
            if (!cancelled) {
              setLoadingIds((s) => {
                const next = new Set(s);
                next.delete(m.id);
                return next;
              });
            }
          }
        })
      );
    })();
    return () => { cancelled = true; };
  }, [meetings]);

  // The shared visit metadata is the same on every meeting in the thread —
  // pick from the first that has it. For direct-RM phone-call threads (no
  // cp_visit_meta) we fall back to the lead's cp_name/cp_mobile so the
  // header still identifies the buyer.
  const lead = meetings[0];
  const visitMeta = lead?.cp_visit_meta || meetings.find((m) => m.cp_visit_meta)?.cp_visit_meta || null;
  const headerTitle =
    visitMeta?.buyer_name || lead?.cp_name || lead?.cp_mobile || 'Recordings';
  const societyName = visitMeta?.society_name;
  const totalDur = meetings.reduce((s, m) => s + (m.duration_seconds || 0), 0);

  return (
    <div className="oh-modal-bg" onClick={onClose}>
      <div className="oh-modal" onClick={(e) => e.stopPropagation()}>
        <div className="oh-modal-header">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="oh-eyebrow oh-truncate">
              {meetings.length} recordings · {fmtDuration(totalDur)} total
            </div>
            <h2 className="oh-detail-title">{headerTitle}</h2>
            {(societyName || lead?.cp_mobile) && (
              <div className="oh-detail-meta">
                {societyName && <span>{societyName}</span>}
                {visitMeta?.city && <span>· {visitMeta.city}</span>}
                {visitMeta?.selected_date && <span>· {visitMeta.selected_date}</span>}
                {!visitMeta && lead?.cp_mobile && <span>{lead.cp_mobile}</span>}
              </div>
            )}
          </div>
          <button className="oh-btn ghost oh-close-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="oh-modal-body">
          {visitMeta && <SharedVisitPanel meta={visitMeta} />}

          {meetings.map((m, i) => (
            <ThreadEntry
              key={m.id}
              index={i + 1}
              total={meetings.length}
              base={m}
              detail={details[m.id]}
              loading={loadingIds.has(m.id)}
              errored={errorIds.has(m.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SharedVisitPanel({ meta }) {
  const rows = [
    { label: 'Buyer', value: meta.buyer_name },
    { label: 'Buyer phone', value: meta.buyer_contact },
    { label: 'Society', value: meta.society_name },
    { label: 'Broker', value: meta.broker_name },
    { label: 'Broker phone', value: meta.broker_contact },
    { label: 'City', value: meta.city },
    { label: 'Scheduled time', value: meta.selected_time },
    { label: 'Lead status', value: meta.lead_status },
  ].filter((r) => r.value && String(r.value).trim());
  if (rows.length === 0) return null;
  return (
    <div className="oh-thread-meta">
      <div className="oh-eyebrow" style={{ marginBottom: 8 }}>Visit details (from scheduled sheet)</div>
      <div className="oh-thread-meta-grid">
        {rows.map((r) => (
          <div key={r.label} className="oh-thread-meta-row">
            <span className="l">{r.label}</span>
            <span className="v">{r.value}</span>
          </div>
        ))}
      </div>
      <style jsx>{`
        .oh-thread-meta {
          background: var(--paper-2, #fafafa);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 12px 14px;
          margin-bottom: 18px;
        }
        .oh-thread-meta-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 6px 16px;
        }
        .oh-thread-meta-row { display: flex; flex-direction: column; font-size: 12.5px; }
        .l { color: var(--ink-3); font-size: 11px; }
        .v { color: var(--ink); }
      `}</style>
    </div>
  );
}

function ThreadEntry({ index, total, base, detail, loading, errored }) {
  return (
    <section className="oh-thread-entry">
      <header className="oh-thread-entry-head">
        <div className="oh-thread-entry-num">Recording {index} of {total}</div>
        <div className="oh-thread-entry-meta">
          <span>{fmtDate(base.started_at)}</span>
          <span><Clock size={11} /> {fmtDuration(base.duration_seconds)}</span>
          {base.rm_name && <span><User size={11} /> {base.rm_name}</span>}
        </div>
      </header>

      {loading && (
        <div className="oh-thread-loading">
          <Loader2 size={14} className="oh-spin" /> Loading recording…
        </div>
      )}

      {errored && (
        <div className="oh-thread-error">
          <AlertCircle size={14} /> Couldn&rsquo;t load this recording.
        </div>
      )}

      {detail && (
        <>
          {detail.audio_url && (
            <div className="oh-thread-block">
              <div className="oh-eyebrow"><Volume2 size={11} /> Recording</div>
              <WebmAudio src={detail.audio_url} />
            </div>
          )}

          <SummaryBlock summary={detail.summary} type={detail.meeting_type} />

          {detail.transcript_text && (
            <div className="oh-thread-block">
              <div className="oh-eyebrow"><FileText size={11} /> Transcript</div>
              <pre className="oh-thread-transcript">{detail.transcript_text}</pre>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .oh-thread-entry {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 14px;
          background: var(--paper);
        }
        .oh-thread-entry-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 14px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border);
          flex-wrap: wrap;
        }
        .oh-thread-entry-num {
          font-size: 13px;
          font-weight: 600;
          color: var(--ink);
        }
        .oh-thread-entry-meta {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: var(--ink-3);
          flex-wrap: wrap;
        }
        .oh-thread-loading,
        .oh-thread-error {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--ink-2);
          padding: 12px 0;
        }
        .oh-thread-error { color: var(--danger, #b03021); }
        .oh-thread-block { margin-bottom: 14px; }
        .oh-thread-block:last-child { margin-bottom: 0; }
        .oh-thread-block :global(.oh-eyebrow) { margin-bottom: 6px; }
        .oh-thread-transcript {
          white-space: pre-wrap;
          font-family: inherit;
          font-size: 13px;
          color: var(--ink);
          background: var(--paper-2, #fafafa);
          padding: 12px 14px;
          border-radius: 8px;
          border: 1px solid var(--border);
          max-height: 320px;
          overflow-y: auto;
          margin: 0;
        }
      `}</style>
    </section>
  );
}

// Lightweight summary renderer — flatten any of the visit/engagement/
// onboarding/call shapes into a list of label: value rows. We deliberately
// don't reuse MeetingDetail's full tabbed renderer here: in the thread view
// we want a compact, scannable summary, not the score panel + tabs UI.
function SummaryBlock({ summary, type }) {
  const flat = flattenSummary(summary, type);
  if (!flat.length) {
    return (
      <div className="oh-thread-block">
        <div className="oh-eyebrow"><Sparkles size={11} /> Summary</div>
        <div className="oh-thread-summary-empty">No summary yet.</div>
        <style jsx>{`
          .oh-thread-summary-empty {
            font-size: 13px;
            color: var(--ink-3);
            font-style: italic;
          }
        `}</style>
      </div>
    );
  }
  return (
    <div className="oh-thread-block">
      <div className="oh-eyebrow"><Sparkles size={11} /> Summary</div>
      <dl className="oh-thread-summary">
        {flat.map(({ key, value }) => (
          <div key={key} className="row">
            <dt>{prettyKey(key)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <style jsx>{`
        .oh-thread-summary {
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .row {
          display: grid;
          grid-template-columns: 180px 1fr;
          gap: 12px;
          font-size: 13px;
          padding: 6px 0;
          border-bottom: 1px dashed var(--border);
        }
        .row:last-child { border-bottom: none; }
        dt {
          color: var(--ink-3);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin: 0;
        }
        dd { color: var(--ink); margin: 0; }
        @media (max-width: 640px) {
          .row { grid-template-columns: 1fr; gap: 2px; }
        }
      `}</style>
    </div>
  );
}

function flattenSummary(summary, type) {
  if (!summary || typeof summary !== 'object') return [];
  // Find the nested body — schema stores it under one of these keys depending
  // on meeting_type, but legacy rows put it flat.
  const body = summary[type] || summary.visit || summary.engagement || summary.onboarding || summary.call || summary;
  if (!body || typeof body !== 'object') return [];
  const out = [];
  for (const [k, v] of Object.entries(body)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      out.push({ key: k, value: v.join(', ') });
    } else if (typeof v === 'object') {
      // Nested object — render as JSON; rare for our schema.
      out.push({ key: k, value: JSON.stringify(v) });
    } else {
      const s = String(v).trim();
      if (!s || s === 'Not discussed') continue;
      out.push({ key: k, value: s });
    }
  }
  return out;
}

function prettyKey(k) {
  return String(k).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
