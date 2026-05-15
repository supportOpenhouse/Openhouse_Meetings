'use client';

import { useState } from 'react';
import {
  Search,
  ChevronRight,
  Flame,
  TrendingUp,
  Snowflake,
  Minus,
  Clock,
  Phone,
} from 'lucide-react';
import { fmtDate, fmtDuration } from '@/lib/utils';

export default function MeetingsTable({
  meetings,
  rms,
  onOpen,
  showRMColumn = true,
  emptyAction,
}) {
  const [rmFilter, setRMFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = meetings.filter((m) => {
    if (rmFilter !== 'all' && m.rm_id !== rmFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !m.cp_code?.toLowerCase().includes(s) &&
        !m.cp_mobile?.includes(s) &&
        !(m.rm_name || '').toLowerCase().includes(s) &&
        !(m.rm_email || '').toLowerCase().includes(s)
      )
        return false;
    }
    return true;
  });

  const cols = showRMColumn ? '1.4fr 1fr 1fr 0.8fr 0.8fr auto' : '1.4fr 1fr 1fr 0.8fr auto';

  return (
    <div>
      <div className="oh-table-filters">
        <div className="oh-search">
          <span className="icon">
            <Search size={14} />
          </span>
          <input
            className="oh-input"
            placeholder="Search CP code, mobile, or RM…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {showRMColumn && rms && rms.length > 0 && (
          <select
            className="oh-select"
            value={rmFilter}
            onChange={(e) => setRMFilter(e.target.value)}
          >
            <option value="all">All RMs</option>
            {rms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name || r.email}
              </option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="oh-card oh-empty">
          <div className="oh-serif">
            {meetings.length === 0 ? 'No meetings yet' : 'No meetings match your filter'}
          </div>
          {meetings.length === 0 && emptyAction}
        </div>
      ) : (
        <div className="oh-card" style={{ overflow: 'hidden' }}>
          {/* Desktop column header */}
          <div
            className="oh-meeting-header"
            style={{
              display: 'grid',
              gridTemplateColumns: cols,
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
            <div>CP / Date</div>
            {showRMColumn && <div>RM</div>}
            <div>Mobile</div>
            <div>Length</div>
            <div>Sentiment</div>
            <div></div>
          </div>

          {filtered.map((m) => (
            <div key={m.id}>
              {/* Desktop grid row */}
              <DesktopRow m={m} showRM={showRMColumn} cols={cols} onClick={() => onOpen(m)} />
              {/* Mobile card */}
              <MobileCard m={m} showRM={showRMColumn} onClick={() => onOpen(m)} />
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

function DesktopRow({ m, showRM, cols, onClick }) {
  const sent = m.summary?.sentiment;
  const { pillClass, SentIcon } = getSentVisuals(sent);
  return (
    <div
      className="oh-meeting-row"
      onClick={onClick}
      style={{ gridTemplateColumns: cols }}
    >
      <div>
        <div style={{ fontWeight: 500, fontFamily: "'Geist Mono', monospace", fontSize: 13.5 }}>
          {m.cp_code}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
          {fmtDate(m.started_at)}
        </div>
      </div>
      {showRM && (
        <div style={{ fontSize: 13.5 }}>{m.rm_name || m.rm_email || '—'}</div>
      )}
      <div className="oh-mono" style={{ fontSize: 13 }}>
        {m.cp_mobile}
      </div>
      <div className="oh-mono" style={{ fontSize: 13 }}>
        {fmtDuration(m.duration_seconds)}
      </div>
      <div>
        <span className={`oh-pill ${pillClass}`}>
          <SentIcon size={11} />
          {sent || 'n/a'}
        </span>
      </div>
      <ChevronRight size={16} color="var(--ink-3)" />
    </div>
  );
}

function MobileCard({ m, showRM, onClick }) {
  const sent = m.summary?.sentiment;
  const { pillClass, SentIcon } = getSentVisuals(sent);
  return (
    <div className="oh-meeting-card" onClick={onClick}>
      <div className="top">
        <div className="code">{m.cp_code}</div>
        <span className={`oh-pill ${pillClass}`}>
          <SentIcon size={11} />
          {sent || 'n/a'}
        </span>
      </div>
      <div className="meta">
        <span>{fmtDate(m.started_at)}</span>
        <span className="dot">·</span>
        <span><Phone size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />{m.cp_mobile}</span>
        <span className="dot">·</span>
        <span><Clock size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />{fmtDuration(m.duration_seconds)}</span>
        {showRM && (m.rm_name || m.rm_email) && (
          <>
            <span className="dot">·</span>
            <span>{m.rm_name || m.rm_email}</span>
          </>
        )}
      </div>
    </div>
  );
}

function getSentVisuals(sent) {
  const pillClass =
    sent === 'hot' ? 'hot' : sent === 'warm' ? 'warm' : sent === 'cold' ? 'cold' : 'neutral';
  const SentIcon =
    sent === 'hot' ? Flame : sent === 'warm' ? TrendingUp : sent === 'cold' ? Snowflake : Minus;
  return { pillClass, SentIcon };
}
