'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  LogIn,
  LogOut,
  Mic,
  Pause,
  Play,
  Trash2,
  Upload,
  AlertCircle,
  RefreshCw,
  Users,
  CheckCircle2,
  XCircle,
  FileText,
  Activity,
  Sparkles,
} from 'lucide-react';
import { fmtDate } from '@/lib/utils';

const EVENT_GROUPS = [
  { key: '', label: 'All events' },
  { key: 'auth.', label: 'Auth (login / logout)' },
  { key: 'recording.', label: 'Recording lifecycle' },
  { key: 'upload.', label: 'Upload events' },
  { key: 'meeting.', label: 'Meeting processing' },
  { key: 'cp.', label: 'CP feature' },
  { key: 'insight.', label: 'Insights' },
  { key: 'error', label: 'Errors' },
];

// Icon + colour + short label per event type. Keeps the timeline scannable.
const EVENT_META = {
  'auth.login': { Icon: LogIn, tone: 'ok', label: 'Logged in' },
  'auth.logout': { Icon: LogOut, tone: 'neutral', label: 'Logged out' },
  'meeting.created': { Icon: Mic, tone: 'ok', label: 'Meeting created' },
  'meeting.processing.started': { Icon: Activity, tone: 'neutral', label: 'Processing started' },
  'meeting.processing.succeeded': { Icon: CheckCircle2, tone: 'ok', label: 'Processed' },
  'meeting.processing.failed': { Icon: XCircle, tone: 'bad', label: 'Processing failed' },
  'meeting.resummarized': { Icon: RefreshCw, tone: 'neutral', label: 'Summary regenerated' },
  'meeting.deleted': { Icon: Trash2, tone: 'bad', label: 'Meeting deleted' },
  'recording.started': { Icon: Mic, tone: 'ok', label: 'Recording started' },
  'recording.paused': { Icon: Pause, tone: 'neutral', label: 'Recording paused' },
  'recording.resumed': { Icon: Play, tone: 'neutral', label: 'Recording resumed' },
  'recording.discarded': { Icon: Trash2, tone: 'bad', label: 'Recording discarded' },
  'recording.finalized': { Icon: CheckCircle2, tone: 'ok', label: 'Recording finalized' },
  'upload.started': { Icon: Upload, tone: 'neutral', label: 'Upload started' },
  'upload.failed': { Icon: XCircle, tone: 'bad', label: 'Upload failed' },
  'upload.stalled': { Icon: AlertCircle, tone: 'warn', label: 'Upload stalled' },
  'upload.retried': { Icon: RefreshCw, tone: 'neutral', label: 'Upload retried' },
  'cp.assignment_changed': { Icon: Users, tone: 'neutral', label: 'CP reassigned' },
  'cp.sync_triggered': { Icon: RefreshCw, tone: 'ok', label: 'CP sync triggered' },
  'cp.sync_failed': { Icon: XCircle, tone: 'bad', label: 'CP sync failed' },
  'insight.generated': { Icon: Sparkles, tone: 'ok', label: 'Insight generated' },
  'error': { Icon: AlertCircle, tone: 'bad', label: 'Error' },
};

function metaFor(eventType) {
  return EVENT_META[eventType] || { Icon: FileText, tone: 'neutral', label: eventType };
}

function relativeTime(iso) {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return fmtDate(iso);
}

export default function LogsClient({ initialActivity, initialOnline, users }) {
  const [activity, setActivity] = useState(initialActivity);
  const [online, setOnline] = useState(initialOnline);
  const [eventFilter, setEventFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (eventFilter) params.set('event', eventFilter);
      if (userFilter) params.set('user', userFilter);
      const r = await fetch(`/api/admin/logs?${params}`);
      if (!r.ok) return;
      const j = await r.json();
      setActivity(j.activity);
      setOnline(j.online);
    } finally {
      setRefreshing(false);
    }
  }, [eventFilter, userFilter]);

  // Refresh whenever filters change.
  useEffect(() => { refresh(); }, [refresh]);

  // Background auto-refresh every 15s so admins see live activity without
  // hitting the button. Cleared if the user toggles it off.
  const lastRefreshRef = useRef(refresh);
  lastRefreshRef.current = refresh;
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => { lastRefreshRef.current(); }, 15_000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  return (
    <div className="oh-page" style={{ maxWidth: 1200 }}>
      <div className="oh-eyebrow">Admin · Activity</div>
      <h1 className="oh-h1">
        Activity <em>logs</em>
      </h1>
      <p className="oh-sub">
        Auth events, recording lifecycle, uploads, processing, CP assignment changes, errors. Auto-refreshes every 15s.
      </p>

      <OnlinePanel online={online} />

      <div className="oh-logs-toolbar">
        <select
          className="oh-input"
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          style={{ maxWidth: 240 }}
        >
          {EVENT_GROUPS.map((g) => (
            <option key={g.key} value={g.key}>{g.label}</option>
          ))}
        </select>
        <select
          className="oh-input"
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          style={{ maxWidth: 220 }}
        >
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name || u.email}</option>
          ))}
        </select>
        <button
          className="oh-btn ghost"
          onClick={refresh}
          disabled={refreshing}
          title="Refresh now"
        >
          <RefreshCw size={13} className={refreshing ? 'oh-spin' : ''} />
          Refresh
        </button>
        <label className="oh-logs-auto">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          auto-refresh
        </label>
      </div>

      <div className="oh-logs-list">
        {activity.length === 0 && (
          <div className="oh-logs-empty">No activity matches the current filters.</div>
        )}
        {activity.map((e) => (
          <LogRow key={e.id} entry={e} />
        ))}
      </div>

      <style jsx>{`
        .oh-logs-toolbar {
          display: flex;
          gap: 10px;
          align-items: center;
          margin: 18px 0 14px;
          flex-wrap: wrap;
        }
        .oh-logs-auto {
          font-size: 13px;
          color: var(--ink-2);
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-left: auto;
        }
        .oh-logs-list {
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--paper);
          overflow: hidden;
        }
        .oh-logs-empty {
          padding: 32px;
          text-align: center;
          color: var(--ink-3);
        }
      `}</style>
    </div>
  );
}

function OnlinePanel({ online }) {
  return (
    <div className="oh-online-panel">
      <div className="oh-online-head">
        <div className="oh-eyebrow">Online recently</div>
        <span className="oh-online-count">{online.length}</span>
      </div>
      {online.length === 0 ? (
        <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>
          Nobody is online right now (no heartbeat in the last 5 min).
        </div>
      ) : (
        <div className="oh-online-grid">
          {online.map((u) => (
            <div key={u.id} className="oh-online-card">
              <Circle size={8} fill="#2f6f2f" stroke="#2f6f2f" />
              <div style={{ minWidth: 0 }}>
                <div className="name">{u.name || u.email}</div>
                <div className="meta">{u.role} · last seen {relativeTime(u.last_seen_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <style jsx>{`
        .oh-online-panel {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px 18px;
          margin-bottom: 18px;
        }
        .oh-online-head {
          display: flex;
          align-items: baseline;
          gap: 10px;
          margin-bottom: 10px;
        }
        .oh-online-count {
          font-family: 'Instrument Serif', serif;
          font-size: 22px;
          color: var(--ink);
        }
        .oh-online-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 8px;
        }
        .oh-online-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          background: var(--paper-2);
          border-radius: 8px;
          font-size: 13px;
        }
        .oh-online-card .name {
          font-weight: 500;
          color: var(--ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .oh-online-card .meta {
          font-size: 11px;
          color: var(--ink-3);
          margin-top: 1px;
        }
      `}</style>
    </div>
  );
}

function LogRow({ entry }) {
  const meta = metaFor(entry.event_type);
  const Icon = meta.Icon;
  return (
    <div className={`oh-log-row tone-${meta.tone}`}>
      <div className={`oh-log-icon tone-${meta.tone}`}>
        <Icon size={14} />
      </div>
      <div className="oh-log-body">
        <div className="oh-log-top">
          <strong>{meta.label}</strong>
          <span className="oh-log-event-tag">{entry.event_type}</span>
        </div>
        <div className="oh-log-meta">
          <span className="oh-log-user">
            {entry.user_name || entry.user_email || <em>system</em>}
          </span>
          {entry.cp_code && <><span className="oh-log-dot">·</span><span className="oh-mono">{entry.cp_code}</span></>}
          {entry.meeting_id && <><span className="oh-log-dot">·</span><span className="oh-mono oh-log-mid">meeting {entry.meeting_id.slice(0, 8)}</span></>}
          <span className="oh-log-dot">·</span>
          <span title={fmtDate(entry.created_at)}>{relativeTime(entry.created_at)}</span>
          {entry.ip && <><span className="oh-log-dot">·</span><span>{entry.ip}</span></>}
        </div>
        {entry.payload && Object.keys(entry.payload).length > 0 && (
          <pre className="oh-log-payload">{JSON.stringify(entry.payload, null, 0)}</pre>
        )}
      </div>

      <style jsx>{`
        .oh-log-row {
          display: grid;
          grid-template-columns: 36px 1fr;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
        }
        .oh-log-row:last-child { border-bottom: none; }
        .oh-log-icon {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--paper-2);
          color: var(--ink-2);
          border: 1px solid var(--border);
          margin-top: 1px;
        }
        .oh-log-icon.tone-ok { background: rgba(34, 139, 34, 0.10); color: #2f6f2f; border-color: rgba(34, 139, 34, 0.25); }
        .oh-log-icon.tone-bad { background: rgba(192, 57, 43, 0.10); color: #b03021; border-color: rgba(192, 57, 43, 0.25); }
        .oh-log-icon.tone-warn { background: rgba(217, 165, 32, 0.10); color: #8a6914; border-color: rgba(217, 165, 32, 0.25); }
        .oh-log-icon.tone-neutral { background: var(--paper-2); color: var(--ink-2); }
        .oh-log-body { min-width: 0; }
        .oh-log-top {
          display: flex;
          align-items: baseline;
          gap: 10px;
          font-size: 14px;
          color: var(--ink);
          margin-bottom: 2px;
        }
        .oh-log-event-tag {
          font-family: 'Geist Mono', monospace;
          font-size: 10.5px;
          color: var(--ink-3);
          background: var(--paper-2);
          padding: 1px 6px;
          border-radius: 4px;
        }
        .oh-log-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          font-size: 12.5px;
          color: var(--ink-2);
          align-items: center;
        }
        .oh-log-dot { color: var(--ink-3); }
        .oh-log-user { font-weight: 500; }
        .oh-log-mid { font-size: 11.5px; color: var(--ink-3); }
        .oh-log-payload {
          font-family: 'Geist Mono', monospace;
          font-size: 11.5px;
          background: var(--paper-2);
          padding: 6px 8px;
          margin-top: 6px;
          border-radius: 6px;
          color: var(--ink-2);
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-all;
        }
      `}</style>
    </div>
  );
}
