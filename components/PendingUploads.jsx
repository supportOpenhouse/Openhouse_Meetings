'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Loader2, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  listLocalRecordings,
  getLocalRecording,
  deleteLocalRecording,
} from '@/lib/localQueue';
import { uploadAndCreateMeeting } from '@/lib/uploadMeeting';
import { fmtDuration } from '@/lib/utils';

// Shows recordings that are saved on this device but haven't been uploaded
// yet. Mounts at the top of the RM dashboard. Each row has a Retry and a
// Discard button. Auto-rechecks the queue on mount and whenever the page
// regains focus (so a successful upload from a different tab is reflected).

export default function PendingUploads({ user }) {
  const router = useRouter();
  const [pending, setPending] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [statusById, setStatusById] = useState({});

  const refresh = useCallback(async () => {
    const rows = await listLocalRecordings();
    setPending(rows);
  }, []);

  useEffect(() => {
    refresh();
    function onFocus() { refresh(); }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  async function retry(id) {
    setBusyId(id);
    setStatusById((s) => ({ ...s, [id]: 'starting' }));
    try {
      const row = await getLocalRecording(id);
      if (!row || !row.blob) {
        throw new Error('Recording missing from local storage');
      }
      await uploadAndCreateMeeting({
        blob: row.blob,
        form: row.form,
        durSec: row.duration_seconds,
        userId: user.id,
        startedAt: row.started_at,
        onStatus: (s) => setStatusById((m) => ({ ...m, [id]: s })),
        onProgress: (pct) => setStatusById((m) => ({ ...m, [id]: `uploading ${pct}%` })),
      });
      await deleteLocalRecording(id);
      await refresh();
      router.refresh();
    } catch (e) {
      setStatusById((m) => ({ ...m, [id]: `failed: ${e?.message || e}` }));
    } finally {
      setBusyId(null);
    }
  }

  async function discard(id) {
    if (!confirm('Throw this recording away? It cannot be recovered.')) return;
    await deleteLocalRecording(id);
    await refresh();
  }

  if (pending.length === 0) return null;

  return (
    <div className="oh-pending-card">
      <div className="oh-pending-head">
        <AlertCircle size={14} />
        <strong>
          {pending.length} {pending.length === 1 ? 'recording' : 'recordings'} saved on this
          device, not yet uploaded
        </strong>
      </div>

      <div className="oh-pending-list">
        {pending.map((r) => {
          const subject = r.form?.is_onboarding
            ? (r.form?.cp_name || 'Prospective CP')
            : (r.form?.cp_code || r.form?.cp_name || 'Untitled');
          const status = statusById[r.id];
          const isBusy = busyId === r.id;
          const failed = status?.startsWith?.('failed');
          return (
            <div key={r.id} className="oh-pending-row">
              <div className="oh-pending-meta">
                <div className="oh-pending-subject">{subject}</div>
                <div className="oh-pending-sub">
                  {r.form?.is_onboarding ? 'onboarding · ' : (r.form?.meeting_type ? `${r.form.meeting_type} · ` : '')}
                  {fmtDuration(r.duration_seconds || 0)} · {Math.round((r.blob_bytes || 0) / 1024)} KB · {relative(r.created_at)}
                </div>
                {status && (
                  <div className={`oh-pending-status ${failed ? 'failed' : ''}`}>
                    {failed
                      ? <><AlertCircle size={11} /> {status.replace('failed: ', '')}</>
                      : <><Loader2 size={11} className="oh-spin" /> {status}</>}
                  </div>
                )}
              </div>
              <div className="oh-pending-actions">
                <button
                  className="oh-btn accent"
                  onClick={() => retry(r.id)}
                  disabled={isBusy}
                  title="Try uploading this recording again"
                >
                  {isBusy ? <Loader2 size={13} className="oh-spin" /> : <Upload size={13} />}
                  {isBusy ? 'Uploading…' : 'Upload now'}
                </button>
                <button
                  className="oh-btn ghost danger"
                  onClick={() => discard(r.id)}
                  disabled={isBusy}
                  title="Throw this recording away"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .oh-pending-card {
          background: rgba(196, 122, 26, 0.05);
          border: 1px solid rgba(196, 122, 26, 0.3);
          border-radius: 12px;
          padding: 14px 18px;
          margin-bottom: 18px;
        }
        .oh-pending-head {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #8a6914;
          font-size: 13.5px;
          margin-bottom: 10px;
        }
        .oh-pending-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .oh-pending-row {
          display: flex;
          gap: 12px;
          align-items: center;
          padding: 10px 12px;
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        .oh-pending-meta {
          flex: 1;
          min-width: 0;
        }
        .oh-pending-subject {
          font-weight: 500;
          color: var(--ink);
          font-size: 14px;
        }
        .oh-pending-sub {
          font-size: 12px;
          color: var(--ink-2);
          margin-top: 2px;
        }
        .oh-pending-status {
          margin-top: 4px;
          font-size: 12px;
          color: var(--ink-2);
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .oh-pending-status.failed {
          color: var(--danger, #b03021);
        }
        .oh-pending-actions {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }
        @media (max-width: 640px) {
          .oh-pending-row { flex-direction: column; align-items: stretch; }
          .oh-pending-actions { justify-content: stretch; }
          .oh-pending-actions :global(.oh-btn) { flex: 1; }
        }
      `}</style>
    </div>
  );
}

function relative(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return `${Math.round(d)}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return new Date(iso).toLocaleString();
}
