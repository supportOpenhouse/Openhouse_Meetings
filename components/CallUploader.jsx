'use client';

import { useState } from 'react';
import { upload } from '@vercel/blob/client';
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileAudio,
  X,
} from 'lucide-react';

// Shared multi-file audio uploader used by the direct-RM screen and the RM
// "Upload recording" screen. Handles: file picking, duplicate pre-check,
// per-file upload to Vercel Blob, the create call, and firing transcription.
//
// Props:
//   user          — { id } (drives the blob path namespace)
//   uploadEndpoint — POST endpoint that creates the meeting row
//   getExtraBody  — optional () => object, merged into each create POST body
//                   (e.g. { meeting_type } for the RM uploader)
//   onBatchDone   — optional callback after a batch finishes

// MP3 / M4A files carry duration in the header — instant + accurate.
function readDuration(file) {
  return new Promise((resolve) => {
    try {
      const a = document.createElement('audio');
      a.preload = 'metadata';
      const url = URL.createObjectURL(file);
      a.onloadedmetadata = () => {
        resolve(isFinite(a.duration) ? Math.round(a.duration) : 0);
        URL.revokeObjectURL(url);
      };
      a.onerror = () => { resolve(0); URL.revokeObjectURL(url); };
      a.src = url;
    } catch {
      resolve(0);
    }
  });
}

export default function CallUploader({ user, uploadEndpoint, getExtraBody, onBatchDone }) {
  const [queue, setQueue] = useState([]);
  const [uploading, setUploading] = useState(false);

  async function onPickFiles(e) {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = '';
    if (files.length === 0) return;

    const inQueue = new Set(queue.map((x) => x.name));
    const fresh = files.filter((f) => !inQueue.has(f.name));
    const items = fresh.map((file, i) => ({
      id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      name: file.name,
      status: 'queued', // queued | uploading | transcribing | done | failed | duplicate
      pct: 0,
      error: null,
    }));
    setQueue((q) => [...items, ...q]);

    // Pre-check which filenames this user already uploaded — skip those so we
    // don't waste an upload or an ElevenLabs transcription.
    try {
      const r = await fetch('/api/direct/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: fresh.map((f) => f.name) }),
      });
      if (r.ok) {
        const { existing } = await r.json();
        const dupSet = new Set(existing || []);
        if (dupSet.size > 0) {
          setQueue((q) =>
            q.map((x) =>
              dupSet.has(x.name) && x.status === 'queued' ? { ...x, status: 'duplicate' } : x
            )
          );
        }
      }
    } catch {
      // Server-side guard still catches dups.
    }
  }

  async function uploadOne(item) {
    const patch = (p) => setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, ...p } : x)));
    try {
      patch({ status: 'uploading', pct: 0 });
      const dur = await readDuration(item.file);
      const safe = item.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `meetings/${user.id}/${Date.now()}-${safe}`;

      const blob = await upload(path, item.file, {
        access: 'public',
        handleUploadUrl: '/api/upload-url',
        contentType: item.file.type || 'audio/mpeg',
        onUploadProgress: (e) => patch({ pct: Math.round(e.percentage || 0) }),
      });

      patch({ status: 'transcribing', pct: 100 });
      const createRes = await fetch(uploadEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_url: blob.url,
          filename: item.name,
          last_modified: item.file.lastModified || null,
          duration_seconds: dur,
          ...(getExtraBody ? getExtraBody() : {}),
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error || `Server returned ${createRes.status}`);

      if (created.duplicate) {
        patch({ status: 'duplicate' });
        return;
      }

      try {
        fetch(`/api/meetings/${created.id}/process`, { method: 'POST', keepalive: true });
      } catch {}
      patch({ status: 'done' });
    } catch (e) {
      patch({ status: 'failed', error: e?.message || 'Upload failed' });
    }
  }

  async function runQueue() {
    setUploading(true);
    const pending = queue.filter((x) => x.status === 'queued' || x.status === 'failed');
    for (const item of pending) {
      // eslint-disable-next-line no-await-in-loop
      await uploadOne(item);
    }
    setUploading(false);
    onBatchDone && onBatchDone();
  }

  function removeItem(id) {
    setQueue((q) => q.filter((x) => x.id !== id));
  }

  const pendingCount = queue.filter((x) => x.status === 'queued' || x.status === 'failed').length;

  return (
    <div>
      <label className="oh-cu-pick">
        <FileAudio size={18} />
        <span>Choose recordings from your phone</span>
        <input
          type="file"
          accept="audio/*,.mp3,.m4a,.amr,.aac,.wav,.ogg"
          multiple
          style={{ display: 'none' }}
          onChange={onPickFiles}
        />
      </label>

      {queue.length > 0 && (
        <>
          <div className="oh-cu-queue">
            {queue.map((item) => (
              <div key={item.id} className="oh-cu-row">
                <div className="oh-cu-icon">
                  {item.status === 'done' ? (
                    <CheckCircle2 size={16} color="#2f6f2f" />
                  ) : item.status === 'duplicate' ? (
                    <CheckCircle2 size={16} color="var(--ink-3)" />
                  ) : item.status === 'failed' ? (
                    <AlertCircle size={16} color="#b03021" />
                  ) : item.status === 'uploading' || item.status === 'transcribing' ? (
                    <Loader2 size={16} className="oh-spin" />
                  ) : (
                    <FileAudio size={16} color="var(--ink-3)" />
                  )}
                </div>
                <div className="oh-cu-info">
                  <div className="oh-cu-name">{item.name}</div>
                  <div className="oh-cu-status">{statusLabel(item)}</div>
                </div>
                {(item.status === 'queued' || item.status === 'failed') && !uploading && (
                  <button className="oh-cu-x" onClick={() => removeItem(item.id)} aria-label="Remove">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
            <button className="oh-btn accent" onClick={runQueue} disabled={uploading || pendingCount === 0}>
              {uploading ? (
                <><Loader2 size={14} className="oh-spin" /> Uploading…</>
              ) : (
                <><Upload size={14} /> Upload {pendingCount} {pendingCount === 1 ? 'file' : 'files'}</>
              )}
            </button>
            {!uploading && queue.some((x) => x.status === 'done' || x.status === 'duplicate') && (
              <button
                className="oh-btn ghost"
                onClick={() =>
                  setQueue((q) => q.filter((x) => x.status !== 'done' && x.status !== 'duplicate'))
                }
              >
                Clear finished
              </button>
            )}
          </div>
        </>
      )}

      <style jsx>{`
        .oh-cu-pick {
          display: flex;
          align-items: center;
          gap: 10px;
          justify-content: center;
          cursor: pointer;
          padding: 22px;
          border: 1.5px dashed var(--border-strong, var(--border));
          border-radius: 12px;
          background: var(--paper);
          color: var(--ink);
          font-size: 14px;
          font-weight: 500;
          transition: all 0.15s;
        }
        .oh-cu-pick:hover {
          border-color: var(--accent);
          background: rgba(184, 52, 28, 0.03);
        }
        .oh-cu-queue {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .oh-cu-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: 9px;
          background: var(--paper);
        }
        .oh-cu-icon { flex-shrink: 0; display: flex; }
        .oh-cu-info { flex: 1; min-width: 0; }
        .oh-cu-name {
          font-size: 13.5px;
          color: var(--ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .oh-cu-status { font-size: 12px; color: var(--ink-3); margin-top: 1px; }
        .oh-cu-x {
          all: unset;
          cursor: pointer;
          padding: 4px;
          border-radius: 5px;
          color: var(--ink-3);
          flex-shrink: 0;
        }
        .oh-cu-x:hover { background: var(--paper-2); color: var(--ink); }
      `}</style>
    </div>
  );
}

function statusLabel(item) {
  switch (item.status) {
    case 'queued': return 'Ready to upload';
    case 'uploading': return `Uploading… ${item.pct}%`;
    case 'transcribing': return 'Uploaded — processing in background';
    case 'done': return 'Done — processing';
    case 'duplicate': return 'Already uploaded earlier — skipped';
    case 'failed': return `Failed: ${item.error}`;
    default: return '';
  }
}
