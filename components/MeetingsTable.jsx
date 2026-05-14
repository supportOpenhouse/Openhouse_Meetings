'use client';

import { useState } from 'react';
import {
  Search,
  ChevronRight,
  Flame,
  TrendingUp,
  Snowflake,
  Minus,
  Plus,
  Mic,
} from 'lucide-react';
import { fmtDate, fmtDuration } from '@/lib/utils';
import Link from 'next/link';

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

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--ink-3)',
            }}
          />
          <input
            className="oh-input"
            style={{ paddingLeft: 34, width: '100%' }}
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
            style={{ minWidth: 180 }}
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: showRMColumn
                ? '1.4fr 1fr 1fr 0.8fr 0.8fr auto'
                : '1.4fr 1fr 1fr 0.8fr auto',
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
            <MeetingRow
              key={m.id}
              m={m}
              onClick={() => onOpen(m)}
              showRM={showRMColumn}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingRow({ m, onClick, showRM }) {
  const sent = m.summary?.sentiment;
  const pillClass =
    sent === 'hot' ? 'hot' : sent === 'warm' ? 'warm' : sent === 'cold' ? 'cold' : 'neutral';
  const SentIcon =
    sent === 'hot' ? Flame : sent === 'warm' ? TrendingUp : sent === 'cold' ? Snowflake : Minus;

  return (
    <div
      className="oh-meeting-row"
      onClick={onClick}
      style={{
        gridTemplateColumns: showRM ? '1.4fr 1fr 1fr 0.8fr 0.8fr auto' : '1.4fr 1fr 1fr 0.8fr auto',
      }}
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
        <div style={{ fontSize: 13.5 }}>
          {m.rm_name || m.rm_email || '—'}
        </div>
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
