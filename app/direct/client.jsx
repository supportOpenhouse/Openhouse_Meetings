'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import {
  LayoutDashboard,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileAudio,
  X,
} from 'lucide-react';
import MeetingsTable from '@/components/MeetingsTable';
import MeetingDetail from '@/components/MeetingDetail';
import Toast from '@/components/Toast';
import { usePollWhileProcessing } from '@/lib/usePollWhileProcessing';

// Reads an audio file's duration (MP3s carry it in the header, so this is
// instant and accurate — no WebM workaround needed).
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
      a.onerror = () => {
        resolve(0);
        URL.revokeObjectURL(url);
      };
      a.src = url;
    } catch {
      resolve(0);
    }
  });
}

export default function DirectClient({ initialMeetings, user }) {
  const router = useRouter();
  const [tab, setTab] = useState('recordings');
  const [meetings, setMeetings] = useState(initialMeetings);
  usePollWhileProcessing(meetings, setMeetings);

  const [openMeeting, setOpenMeeting] = useState(null);
  const [openDetail, setOpenDetail] = useState(null);
  const [toast, setToast] = useState(null);

  // Upload queue — one entry per picked file.
  const [queue, setQueue] = useState([]);
  const [uploading, setUploading] = useState(false);

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function openMeetingFull(m) {
    setOpenMeeting(m);
    try {
      const res = await fetch(`/api/meetings/${m.id}`);
      const data = await res.json();
      if (res.ok) setOpenDetail(data.meeting);
    } catch {
      showToast('Could not load recording', 'error');
    }
  }

  function onPickFiles(e) {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = '';
    if (files.length === 0) return;
    const items = files.map((file, i) => ({
      id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      name: file.name,
      status: 'queued', // queued | uploading | transcribing | done | failed
      pct: 0,
      error: null,
    }));
    setQueue((q) => [...items, ...q]);
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
      const createRes = await fetch('/api/direct/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_url: blob.url,
          filename: item.name,
          last_modified: item.file.lastModified || null,
          duration_seconds: dur,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error || `Server returned ${createRes.status}`);

      // Fire transcription in the background.
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
    // Process sequentially — gentle on the network + the processing functions.
    const pending = queue.filter((x) => x.status === 'queued' || x.status === 'failed');
    for (const item of pending) {
      // eslint-disable-next-line no-await-in-loop
      await uploadOne(item);
    }
    setUploading(false);
    showToast('Uploads finished — transcribing in the background', 'success');
    router.refresh();
  }

  function removeItem(id) {
    setQueue((q) => q.filter((x) => x.id !== id));
  }

  const pendingCount = queue.filter((x) => x.status === 'queued' || x.status === 'failed').length;

  return (
    <div>
      <div className="oh-eyebrow">Openhouse · {user.name}</div>
      <h1 className="oh-h1">
        Call <em>recordings</em>
      </h1>

      <div className="oh-direct-tabs">
        <button
          className={`oh-direct-tab ${tab === 'recordings' ? 'active' : ''}`}
          onClick={() => setTab('recordings')}
        >
          <LayoutDashboard size={14} /> My recordings
        </button>
        <button
          className={`oh-direct-tab ${tab === 'upload' ? 'active' : ''}`}
          onClick={() => setTab('upload')}
        >
          <Upload size={14} /> Upload recordings
        </button>
      </div>

      {tab === 'recordings' && (
        <MeetingsTable
          meetings={meetings}
          showRMColumn={false}
          onOpen={openMeetingFull}
          hideDateFilter={true}
          emptyAction={
            <button
              className="oh-btn primary"
              style={{ marginTop: 16 }}
              onClick={() => setTab('upload')}
            >
              <Upload size={14} /> Upload your first recording
            </button>
          }
        />
      )}

      {tab === 'upload' && (
        <div>
          <p className="oh-sub" style={{ marginTop: 4 }}>
            Pick the call recordings (MP3) from your phone. We read the phone number from each
            file name and generate a transcript. You can select multiple files at once.
          </p>

          <label className="oh-direct-pick">
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
              <div className="oh-direct-queue">
                {queue.map((item) => (
                  <div key={item.id} className="oh-direct-row">
                    <div className="oh-direct-icon">
                      {item.status === 'done' ? (
                        <CheckCircle2 size={16} color="#2f6f2f" />
                      ) : item.status === 'failed' ? (
                        <AlertCircle size={16} color="#b03021" />
                      ) : item.status === 'uploading' || item.status === 'transcribing' ? (
                        <Loader2 size={16} className="oh-spin" />
                      ) : (
                        <FileAudio size={16} color="var(--ink-3)" />
                      )}
                    </div>
                    <div className="oh-direct-info">
                      <div className="oh-direct-name">{item.name}</div>
                      <div className="oh-direct-status">{statusLabel(item)}</div>
                    </div>
                    {(item.status === 'queued' || item.status === 'failed') && !uploading && (
                      <button
                        className="oh-direct-x"
                        onClick={() => removeItem(item.id)}
                        aria-label="Remove"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
                <button
                  className="oh-btn accent"
                  onClick={runQueue}
                  disabled={uploading || pendingCount === 0}
                >
                  {uploading ? (
                    <><Loader2 size={14} className="oh-spin" /> Uploading…</>
                  ) : (
                    <><Upload size={14} /> Upload {pendingCount} {pendingCount === 1 ? 'file' : 'files'}</>
                  )}
                </button>
                {!uploading && queue.some((x) => x.status === 'done') && (
                  <button className="oh-btn ghost" onClick={() => setQueue([])}>
                    Clear finished
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {openMeeting && openDetail && (
        <MeetingDetail
          meeting={openDetail}
          onClose={() => {
            setOpenMeeting(null);
            setOpenDetail(null);
          }}
          onDelete={() => {}}
          canDelete={false}
        />
      )}

      <Toast toast={toast} />

      <style jsx>{`
        .oh-direct-tabs {
          display: flex;
          gap: 4px;
          border-bottom: 1px solid var(--border);
          margin: 16px 0 20px;
        }
        .oh-direct-tab {
          all: unset;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          font-size: 13.5px;
          color: var(--ink-2);
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
        }
        .oh-direct-tab.active {
          color: var(--ink);
          border-bottom-color: var(--accent);
          font-weight: 500;
        }
        .oh-direct-pick {
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
        .oh-direct-pick:hover {
          border-color: var(--accent);
          background: rgba(184, 52, 28, 0.03);
        }
        .oh-direct-queue {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .oh-direct-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: 9px;
          background: var(--paper);
        }
        .oh-direct-icon { flex-shrink: 0; display: flex; }
        .oh-direct-info { flex: 1; min-width: 0; }
        .oh-direct-name {
          font-size: 13.5px;
          color: var(--ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .oh-direct-status { font-size: 12px; color: var(--ink-3); margin-top: 1px; }
        .oh-direct-x {
          all: unset;
          cursor: pointer;
          padding: 4px;
          border-radius: 5px;
          color: var(--ink-3);
          flex-shrink: 0;
        }
        .oh-direct-x:hover { background: var(--paper-2); color: var(--ink); }
      `}</style>
    </div>
  );
}

function statusLabel(item) {
  switch (item.status) {
    case 'queued': return 'Ready to upload';
    case 'uploading': return `Uploading… ${item.pct}%`;
    case 'transcribing': return 'Uploaded — transcribing in background';
    case 'done': return 'Done — transcript processing';
    case 'failed': return `Failed: ${item.error}`;
    default: return '';
  }
}
