'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Phone, Clock, Home, Building2 } from 'lucide-react';
import { fmtDate, fmtDuration } from '@/lib/utils';
import { MeetingTypePill, SourcePill, StatusOrSentimentPill } from './MeetingsTable';

// Collapsible grouped list view. Used to:
//   - cluster direct-RM call recordings by phone number (cp_mobile)
//   - cluster RM site visits by the scheduled-visit id (cp_visit_id)
// so multiple recordings of the same conversation/visit live under one card
// instead of repeating across many rows.
//
// Props:
//   meetings: array
//   groupBy: 'cp_mobile' | 'cp_visit_id'
//   onOpen: (meeting) => void
//   getHeader(meetingsInGroup): { title, sub } — controls the group card label
//   keepUngroupedFlat: bool (default true) — singletons that don't share the
//     key with anyone show as a normal expanded card with one meeting
export default function GroupedMeetings({ meetings, groupBy, onOpen, getHeader }) {
  const groups = useMemo(() => groupMeetings(meetings || [], groupBy), [meetings, groupBy]);
  if (!groups.length) {
    return <div className="oh-gm-empty">No recordings yet.</div>;
  }
  return (
    <div className="oh-gm">
      {groups.map((g) => (
        <Group key={g.key} group={g} onOpen={onOpen} getHeader={getHeader} />
      ))}
      <style jsx>{`
        .oh-gm { display: flex; flex-direction: column; gap: 10px; }
        .oh-gm-empty {
          font-size: 13px;
          color: var(--ink-3);
          padding: 24px 0;
          text-align: center;
        }
      `}</style>
    </div>
  );
}

function Group({ group, onOpen, getHeader }) {
  // Singletons expand by default — feels weird to make the RM tap to open
  // a card that holds exactly one row.
  const [open, setOpen] = useState(group.items.length === 1);
  const hdr = getHeader ? getHeader(group.items) : defaultHeader(group, group.items);
  const isCluster = group.items.length > 1;
  return (
    <div className={`oh-gm-card ${isCluster ? 'cluster' : ''}`}>
      <button
        type="button"
        className="oh-gm-head"
        onClick={() => isCluster && setOpen((v) => !v)}
        disabled={!isCluster}
      >
        <div className="oh-gm-head-main">
          <div className="oh-gm-title">{hdr.title}</div>
          {hdr.sub && <div className="oh-gm-sub">{hdr.sub}</div>}
        </div>
        <div className="oh-gm-head-right">
          {isCluster && (
            <span className="oh-gm-count">
              {group.items.length} recordings
            </span>
          )}
          {isCluster && (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
        </div>
      </button>

      {open && (
        <div className="oh-gm-body">
          {group.items.map((m) => (
            <button
              type="button"
              key={m.id}
              className="oh-gm-row"
              onClick={() => onOpen?.(m)}
            >
              <div className="oh-gm-row-main">
                <div className="oh-gm-row-top">
                  <MeetingTypePill type={m.meeting_type} small />
                  <SourcePill meeting={m} small />
                  <span className="oh-gm-row-date">{fmtDate(m.started_at)}</span>
                </div>
                <div className="oh-gm-row-meta">
                  <span><Clock size={11} /> {fmtDuration(m.duration_seconds)}</span>
                  {m.cp_code && <span className="oh-mono">CP {m.cp_code}</span>}
                  {m.rm_name && <span>{m.rm_name}</span>}
                </div>
              </div>
              <div className="oh-gm-row-right">
                <StatusOrSentimentPill meeting={m} />
                <ChevronRight size={14} color="var(--ink-3)" />
              </div>
            </button>
          ))}
        </div>
      )}

      <style jsx>{`
        .oh-gm-card {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }
        .oh-gm-card.cluster {
          border-color: var(--ink-3);
        }
        .oh-gm-head {
          all: unset;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          width: 100%;
          box-sizing: border-box;
          cursor: pointer;
        }
        .oh-gm-head:disabled { cursor: default; }
        .oh-gm-head:hover:not(:disabled) { background: var(--paper-2, #fafafa); }
        .oh-gm-head-main { flex: 1; min-width: 0; }
        .oh-gm-title {
          font-weight: 600;
          font-size: 14px;
          color: var(--ink);
        }
        .oh-gm-sub {
          font-size: 12.5px;
          color: var(--ink-2);
          margin-top: 2px;
        }
        .oh-gm-head-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
          color: var(--ink-3);
        }
        .oh-gm-count {
          font-size: 12px;
          color: var(--ink-2);
          background: var(--paper-2, #fafafa);
          border: 1px solid var(--border);
          padding: 2px 8px;
          border-radius: 999px;
        }
        .oh-gm-body {
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
        }
        .oh-gm-row {
          all: unset;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 14px;
          width: 100%;
          box-sizing: border-box;
          cursor: pointer;
          border-bottom: 1px solid var(--border-soft, var(--border));
        }
        .oh-gm-row:last-child { border-bottom: none; }
        .oh-gm-row:hover { background: var(--paper-2, #fafafa); }
        .oh-gm-row-main { flex: 1; min-width: 0; }
        .oh-gm-row-top {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .oh-gm-row-date { font-size: 12.5px; color: var(--ink-3); }
        .oh-gm-row-meta {
          display: flex;
          gap: 12px;
          font-size: 12.5px;
          color: var(--ink-2);
          margin-top: 4px;
          flex-wrap: wrap;
        }
        .oh-gm-row-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}

function defaultHeader(group, items) {
  const lead = items[0];
  if (group.groupBy === 'cp_mobile') {
    return {
      title: lead.cp_mobile || lead.cp_name || '(no phone)',
      sub: lead.cp_name && lead.cp_mobile ? lead.cp_name : null,
    };
  }
  if (group.groupBy === 'cp_visit_id') {
    const m = lead.cp_visit_meta || {};
    const t = m.buyer_name || lead.cp_name || lead.cp_code || 'Visit';
    const s = [m.society_name, m.city].filter(Boolean).join(' · ') || null;
    return { title: t, sub: s };
  }
  return { title: group.key || 'Recording', sub: null };
}

// Bucket meetings by the given key. Falsy keys (no mobile / no cp_visit_id)
// each get their own singleton bucket using the meeting's id, so they still
// show in the list but never accidentally get clustered together.
function groupMeetings(meetings, groupBy) {
  const map = new Map();
  for (const m of meetings) {
    const raw = m[groupBy];
    const key = raw && String(raw).trim() ? `k:${raw}` : `solo:${m.id}`;
    if (!map.has(key)) map.set(key, { key, groupBy, items: [] });
    map.get(key).items.push(m);
  }
  // Order each group's items by recency (newest first).
  for (const g of map.values()) {
    g.items.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  }
  // Order groups by the newest item they contain.
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.items[0].started_at) - new Date(a.items[0].started_at)
  );
}
