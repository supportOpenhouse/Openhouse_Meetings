'use client';

import { useMemo, useState } from 'react';
import {
  Search,
  ChevronRight,
  Flame,
  TrendingUp,
  Snowflake,
  Minus,
  Clock,
  Phone,
  Download,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { fmtDate, fmtDuration, normalizeCpCode } from '@/lib/utils';

export default function MeetingsTable({
  meetings,
  rms,
  cities = [],
  onOpen,
  showRMColumn = true,
  emptyAction,
  // When provided, renders an "Export to CSV" button that receives the active filter set.
  onExport,
  // Admin owns the date range globally — hide the table's local date inputs so we
  // don't have two competing filters on the same page.
  hideDateFilter = false,
}) {
  const [rmFilter, setRMFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [sentimentFilter, setSentimentFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');

  // Derive cities from meetings if the caller didn't pass an authoritative list.
  const cityOptions = useMemo(() => {
    if (cities && cities.length) return cities;
    const set = new Set();
    for (const m of meetings) if (m.cp_city) set.add(m.cp_city);
    return Array.from(set).sort();
  }, [cities, meetings]);

  const filters = { rmFilter, cityFilter, sentimentFilter, search, since, until };

  const filtered = meetings.filter((m) => {
    if (rmFilter !== 'all' && m.rm_id !== rmFilter) return false;
    if (cityFilter !== 'all' && m.cp_city !== cityFilter) return false;
    if (sentimentFilter !== 'all' && (getSentiment(m) || 'n/a') !== sentimentFilter) return false;

    if (since) {
      const d = new Date(since);
      if (!isNaN(d) && new Date(m.started_at) < d) return false;
    }
    if (until) {
      // Treat "until" as inclusive end-of-day.
      const d = new Date(until);
      if (!isNaN(d)) {
        const end = new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1);
        if (new Date(m.started_at) > end) return false;
      }
    }

    if (search) {
      const s = search.toLowerCase();
      // CP code match is special: case-insensitive AND space/hyphen-agnostic,
      // so "cp 1284" / "CP-1284" / "cp1284" all match the same row.
      const sCpCode = normalizeCpCode(search);
      const rowCpCode = normalizeCpCode(m.cp_code || '');
      if (
        !(sCpCode && rowCpCode.includes(sCpCode)) &&
        !m.cp_mobile?.includes(s) &&
        !(m.cp_name || '').toLowerCase().includes(s) &&
        !(m.cp_city || '').toLowerCase().includes(s) &&
        !(m.rm_name || '').toLowerCase().includes(s) &&
        !(m.rm_email || '').toLowerCase().includes(s)
      )
        return false;
    }
    return true;
  });

  const hasActive = rmFilter !== 'all' || cityFilter !== 'all' || sentimentFilter !== 'all' || search || since || until;

  function clearAll() {
    setRMFilter('all');
    setCityFilter('all');
    setSentimentFilter('all');
    setSearch('');
    setSince('');
    setUntil('');
  }

  const cols = showRMColumn ? '1.4fr 1fr 1fr 0.8fr 0.8fr auto' : '1.4fr 1fr 1fr 0.8fr auto';

  return (
    <div>
      <div className="oh-filters-wrap">
        <div className="oh-table-filters">
          <div className="oh-search">
            <span className="icon">
              <Search size={14} />
            </span>
            <input
              className="oh-input"
              placeholder="Search CP code, name, mobile, city, or RM…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {onExport && (
            <button
              type="button"
              className="oh-btn ghost"
              onClick={() => onExport(filters)}
              title="Download a CSV of the currently filtered meetings (opens in Excel)."
            >
              <Download size={14} /> Export CSV
            </button>
          )}
        </div>

        <div className="oh-filter-row">
          {showRMColumn && rms && rms.length > 0 && (
            <select
              className="oh-select"
              value={rmFilter}
              onChange={(e) => setRMFilter(e.target.value)}
              aria-label="Filter by RM"
            >
              <option value="all">All RMs</option>
              {rms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name || r.email}
                </option>
              ))}
            </select>
          )}

          {cityOptions.length > 0 && (
            <select
              className="oh-select"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              aria-label="Filter by city"
            >
              <option value="all">All cities</option>
              {cityOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          <select
            className="oh-select"
            value={sentimentFilter}
            onChange={(e) => setSentimentFilter(e.target.value)}
            aria-label="Filter by sentiment"
          >
            <option value="all">All sentiments</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="cold">Cold</option>
            <option value="n/a">No sentiment</option>
          </select>

          {!hideDateFilter && (
            <>
              <input
                className="oh-input oh-date"
                type="date"
                value={since}
                onChange={(e) => setSince(e.target.value)}
                aria-label="From date"
              />
              <span className="oh-date-sep">to</span>
              <input
                className="oh-input oh-date"
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                aria-label="To date"
              />
            </>
          )}

          {hasActive && (
            <button type="button" className="oh-btn ghost oh-clear-btn" onClick={clearAll}>
              <X size={13} /> Clear
            </button>
          )}
        </div>

        <div className="oh-filter-count">
          Showing <strong>{filtered.length}</strong> of {meetings.length} meetings
        </div>
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
        {m.cp_name && (
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 2 }}>
            {m.cp_name}
          </div>
        )}
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
        <StatusOrSentimentPill meeting={m} />
      </div>
      <ChevronRight size={16} color="var(--ink-3)" />
    </div>
  );
}

function MobileCard({ m, showRM, onClick }) {
  return (
    <div className="oh-meeting-card" onClick={onClick}>
      <div className="top">
        <div className="code">
          {m.cp_code}
          {m.cp_name && <span className="cp-name"> · {m.cp_name}</span>}
        </div>
        <StatusOrSentimentPill meeting={m} />
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
      <style jsx>{`
        .cp-name {
          font-weight: 400;
          color: var(--ink-2);
          font-family: var(--font-sans, system-ui);
          font-size: 13.5px;
          margin-left: 2px;
        }
      `}</style>
    </div>
  );
}

// Single source of truth for the right-side pill: lifecycle state wins over sentiment
// until the meeting reaches `ready`, then we show the Claude sentiment.
function StatusOrSentimentPill({ meeting }) {
  const status = meeting.status || 'ready';
  if (status === 'processing') {
    return (
      <span className="oh-pill processing">
        <Loader2 size={11} className="oh-spin" /> processing
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="oh-pill failed" title={meeting.error_message || 'Processing failed'}>
        <AlertCircle size={11} /> failed
      </span>
    );
  }
  const sent = getSentiment(meeting);
  const { pillClass, SentIcon } = getSentVisuals(sent);
  return (
    <span className={`oh-pill ${pillClass}`}>
      <SentIcon size={11} />
      {sent || 'n/a'}
    </span>
  );
}

function getSentVisuals(sent) {
  const pillClass =
    sent === 'hot' ? 'hot' : sent === 'warm' ? 'warm' : sent === 'cold' ? 'cold' : 'neutral';
  const SentIcon =
    sent === 'hot' ? Flame : sent === 'warm' ? TrendingUp : sent === 'cold' ? Snowflake : Minus;
  return { pillClass, SentIcon };
}

// New-shape summaries put the temperature under summary.score.classification.
// Legacy summaries had it at summary.sentiment.
function getSentiment(meeting) {
  return meeting.summary?.score?.classification || meeting.summary?.sentiment || null;
}
