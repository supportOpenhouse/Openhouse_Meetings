'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import {
  ArrowLeft,
  Mic,
  User,
  Hash,
  Phone,
  Briefcase,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import Recorder from '@/components/Recorder';
import Toast from '@/components/Toast';

// If no upload progress is observed for this long, surface a "looks stalled"
// message instead of leaving the user staring at "0%".
const STALL_WARN_MS = 12_000;
// Total time we allow upload to make no forward progress before failing fast.
const STALL_FAIL_MS = 45_000;

export default function NewMeetingClient({ user }) {
  const router = useRouter();
  const [step, setStep] = useState('form'); // form | record | process
  const [form, setForm] = useState({
    cp_code: '',
    cp_mobile: '',
    cp_name: '',
    purpose: '',
  });
  const [startedAt, setStartedAt] = useState(null);
  const [stage, setStage] = useState({
    uploading: 'pending',
    transcribing: 'pending',
    summarizing: 'pending',
  });
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadStatus, setUploadStatus] = useState(null); // null | 'starting' | 'progress' | 'stalled' | 'failed'
  const [error, setError] = useState(null);
  const [errorHint, setErrorHint] = useState(null);
  const [toast, setToast] = useState(null);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedDuration, setRecordedDuration] = useState(0);

  // Refs for the stall watchdog
  const lastProgressAtRef = useRef(0);
  const watchdogRef = useRef(null);
  const abortedRef = useRef(false);

  useEffect(() => () => {
    if (watchdogRef.current) clearInterval(watchdogRef.current);
  }, []);

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  function startRecording() {
    setStartedAt(Date.now());
    setStep('record');
  }

  function clearWatchdog() {
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
  }

  async function preflightToken() {
    try {
      const r = await fetch('/api/upload-url', { method: 'GET' });
      if (!r.ok) return { ok: false, reason: `Preflight returned ${r.status}` };
      const j = await r.json();
      if (!j.ok) {
        return {
          ok: false,
          reason:
            'Server is not configured for uploads (BLOB_READ_WRITE_TOKEN missing). Ask an admin to set it in Vercel → Project → Settings → Environment Variables.',
        };
      }
      return { ok: true, info: j.token };
    } catch (e) {
      return { ok: false, reason: e?.message || 'Preflight failed' };
    }
  }

  async function onRecorded(blob, durSec) {
    setRecordedBlob(blob);
    setRecordedDuration(durSec);
    runUpload(blob, durSec);
  }

  async function runUpload(blob, durSec) {
    abortedRef.current = false;
    setStep('process');
    setStage({ uploading: 'active', transcribing: 'pending', summarizing: 'pending' });
    setUploadPct(0);
    setUploadStatus('starting');
    setError(null);
    setErrorHint(null);

    const pre = await preflightToken();
    if (!pre.ok) {
      setUploadStatus('failed');
      setError(pre.reason);
      setErrorHint('upload-config');
      showToast('Upload not configured', 'error');
      return;
    }

    lastProgressAtRef.current = Date.now();
    clearWatchdog();
    watchdogRef.current = setInterval(() => {
      const since = Date.now() - lastProgressAtRef.current;
      if (since > STALL_FAIL_MS) {
        // Hard fail: stop waiting on @vercel/blob's silent retry loop.
        abortedRef.current = true;
        clearWatchdog();
        setUploadStatus('failed');
        setError(
          'Upload failed: no progress for ' +
            Math.round(STALL_FAIL_MS / 1000) +
            's. The browser is being blocked by Vercel Blob (likely an invalid BLOB_READ_WRITE_TOKEN or a deleted/disconnected blob store).'
        );
        setErrorHint('upload-stalled');
      } else if (since > STALL_WARN_MS && uploadStatus !== 'stalled') {
        setUploadStatus('stalled');
      }
    }, 1000);

    try {
      const safeCode = (form.cp_code || 'cp').replace(/[^a-zA-Z0-9_-]/g, '');
      const filename = `meetings/${user.id}/${Date.now()}-${safeCode}.webm`;

      const newBlob = await upload(filename, blob, {
        access: 'public',
        handleUploadUrl: '/api/upload-url',
        contentType: blob.type || 'audio/webm',
        onUploadProgress: (e) => {
          lastProgressAtRef.current = Date.now();
          setUploadStatus('progress');
          setUploadPct(Math.round(e.percentage || 0));
        },
      });

      if (abortedRef.current) return;
      clearWatchdog();

      setStage((s) => ({ ...s, uploading: 'done', transcribing: 'active' }));

      const res = await fetch('/api/process-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_url: newBlob.url,
          cp_code: form.cp_code,
          cp_mobile: form.cp_mobile,
          cp_name: form.cp_name,
          purpose: form.purpose,
          duration_seconds: durSec,
          started_at: new Date(startedAt).toISOString(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned ${res.status}`);
      }

      setStage({ uploading: 'done', transcribing: 'done', summarizing: 'done' });
      showToast('Meeting saved', 'success');
      setTimeout(() => router.push('/dashboard'), 600);
    } catch (e) {
      if (abortedRef.current) return;
      clearWatchdog();
      console.error(e);
      setUploadStatus('failed');
      setError(e.message);
      // Heuristic: CORS / network errors from @vercel/blob almost always mean a token/store problem.
      if (/cors|failed to fetch|network|400/i.test(e.message || '')) {
        setErrorHint('upload-token');
      }
      showToast(e.message, 'error');
    }
  }

  function retryUpload() {
    if (!recordedBlob) return;
    runUpload(recordedBlob, recordedDuration);
  }

  const canStart = form.cp_code.trim() && form.cp_mobile.trim();

  return (
    <div className="oh-page">
      {step === 'form' && (
        <>
          <button
            className="oh-btn ghost oh-back"
            onClick={() => router.push('/dashboard')}
          >
            <ArrowLeft size={14} /> Back
          </button>
          <div className="oh-eyebrow">Step 1 of 2 · {user.name}</div>
          <h1 className="oh-h1">
            Before you <em>start</em>
          </h1>
          <p className="oh-sub">
            Fill these in. The form is saved to the meeting record so the team can later track
            which RM met which CP.
          </p>

          <div className="oh-form">
            <div className="oh-form-row-2">
              <div className="oh-field">
                <label>
                  <Hash size={11} style={{ display: 'inline', marginRight: 4 }} /> CP code
                </label>
                <input
                  className="oh-input"
                  placeholder="e.g. CP-1284"
                  value={form.cp_code}
                  onChange={(e) => setForm({ ...form, cp_code: e.target.value })}
                  autoComplete="off"
                />
              </div>
              <div className="oh-field">
                <label>
                  <Phone size={11} style={{ display: 'inline', marginRight: 4 }} /> CP mobile
                </label>
                <input
                  className="oh-input"
                  placeholder="98XXXXXXXX"
                  value={form.cp_mobile}
                  onChange={(e) => setForm({ ...form, cp_mobile: e.target.value })}
                  inputMode="tel"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="oh-field">
              <label>
                <User size={11} style={{ display: 'inline', marginRight: 4 }} /> CP name (optional)
              </label>
              <input
                className="oh-input"
                placeholder="Channel partner's name"
                value={form.cp_name}
                onChange={(e) => setForm({ ...form, cp_name: e.target.value })}
              />
            </div>
            <div className="oh-field">
              <label>
                <Briefcase size={11} style={{ display: 'inline', marginRight: 4 }} /> Meeting
                purpose (optional)
              </label>
              <textarea
                className="oh-textarea"
                placeholder="e.g. inventory walkthrough for Sector 62 project"
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              />
            </div>

            <div className="oh-form-actions">
              <button
                className="oh-btn accent"
                onClick={startRecording}
                disabled={!canStart}
              >
                <Mic size={14} /> Proceed to record
              </button>
              <button
                className="oh-btn ghost"
                onClick={() => router.push('/dashboard')}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {step === 'record' && (
        <>
          <div className="oh-eyebrow">Step 2 of 2</div>
          <h1 className="oh-h1">
            Recording <em>in progress</em>
          </h1>
          <p className="oh-sub">
            Speak normally. Tap the mic when you're done — we'll upload and process the audio
            automatically. Long meetings (up to 60 min) are supported; keep this tab open until
            processing finishes.
          </p>

          <div className="oh-meta-row">
            <div className="oh-meta">
              <User size={13} /> <strong>{user.name}</strong>
            </div>
            <div className="oh-meta">
              <Hash size={13} /> <strong>{form.cp_code}</strong>
            </div>
            <div className="oh-meta">
              <Phone size={13} /> <strong>{form.cp_mobile}</strong>
            </div>
          </div>

          <Recorder onDone={onRecorded} onCancel={() => setStep('form')} />
        </>
      )}

      {step === 'process' && (
        <>
          <h1 className="oh-h1">Processing…</h1>
          <p className="oh-sub">
            Upload + transcription + summary typically takes 1–4 minutes for a 60-min recording.
            Keep this tab open.
          </p>

          <div className="oh-card" style={{ padding: '20px 24px', marginTop: 16 }}>
            <ProgressStep
              label={uploadStepLabel(stage.uploading, uploadStatus, uploadPct)}
              state={stage.uploading}
              warn={uploadStatus === 'stalled'}
            />
            <ProgressStep
              label="Transcribing with ElevenLabs Scribe v2"
              state={stage.transcribing}
            />
            <ProgressStep label="Generating summary with Claude" state={stage.summarizing} />
          </div>

          {uploadStatus === 'stalled' && !error && (
            <div className="oh-warn-box">
              <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <strong>Upload looks stalled.</strong> No data has reached Vercel Blob in a few
                seconds. Still retrying in the background — if this doesn't recover, you'll get
                a clear error shortly.
              </div>
            </div>
          )}

          {error && (
            <div className="oh-error-box">
              <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <strong>Upload failed.</strong>
                <div style={{ marginTop: 4 }}>{error}</div>

                {errorHint === 'upload-token' && (
                  <div className="oh-hint">
                    The browser saw a CORS / 400 from <code>vercel.com/api/blob</code>. That
                    almost always means the <code>BLOB_READ_WRITE_TOKEN</code> on this
                    deployment is invalid, rotated, or points at a deleted blob store. An admin
                    should verify it in Vercel → Project → Storage → Blob and redeploy if it was
                    just changed.
                  </div>
                )}
                {errorHint === 'upload-stalled' && (
                  <div className="oh-hint">
                    The recording is still in memory — tap Retry to upload again without
                    re-recording. If retries keep failing, check the server logs under
                    <code> /api/upload-url</code>.
                  </div>
                )}
                {errorHint === 'upload-config' && (
                  <div className="oh-hint">
                    This is a deployment configuration issue, not a user problem. The recording
                    is still in memory — tap Retry after an admin fixes the env var.
                  </div>
                )}

                <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {recordedBlob && (
                    <button className="oh-btn accent" onClick={retryUpload}>
                      <RefreshCw size={14} /> Retry upload
                    </button>
                  )}
                  <button
                    className="oh-btn ghost"
                    onClick={() => router.push('/dashboard')}
                  >
                    Back to dashboard
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <Toast toast={toast} />

      <style jsx>{`
        .oh-page { max-width: 620px; }
        .oh-back {
          margin-bottom: 24px;
          padding: 8px 12px;
        }
        .oh-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .oh-form-row-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .oh-form-actions {
          display: flex;
          gap: 10px;
          margin-top: 8px;
        }
        .oh-error-box {
          background: var(--paper);
          border: 1px solid var(--danger);
          color: var(--danger);
          padding: 16px;
          margin-top: 16px;
          border-radius: 10px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .oh-warn-box {
          background: var(--paper);
          border: 1px solid var(--border-strong);
          color: var(--ink-2);
          padding: 14px;
          margin-top: 16px;
          border-radius: 10px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 13.5px;
        }
        .oh-hint {
          margin-top: 10px;
          padding: 10px 12px;
          background: var(--paper-2);
          color: var(--ink-2);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 400;
          line-height: 1.5;
        }
        .oh-hint code {
          font-family: 'Geist Mono', monospace;
          font-size: 12px;
          background: rgba(0,0,0,0.05);
          padding: 1px 4px;
          border-radius: 4px;
        }
        @media (max-width: 768px) {
          .oh-form-row-2 { grid-template-columns: 1fr; gap: 16px; }
          .oh-form-actions {
            flex-direction: column-reverse;
            gap: 10px;
          }
          .oh-form-actions :global(.oh-btn) { width: 100%; }
        }
      `}</style>
    </div>
  );
}

function uploadStepLabel(state, status, pct) {
  if (state !== 'active') return 'Uploading audio';
  if (status === 'starting') return 'Uploading audio (preparing…)';
  if (status === 'stalled') return `Uploading audio (${pct}% — stalled, retrying…)`;
  return `Uploading audio (${pct}%)`;
}

function ProgressStep({ label, state, warn }) {
  return (
    <div
      className={`oh-progress-step ${
        state === 'done' ? 'done' : state === 'active' ? 'active' : ''
      } ${warn ? 'warn' : ''}`}
    >
      {state === 'done' && <CheckCircle2 size={16} />}
      {state === 'active' && (
        <Loader2
          size={16}
          className="oh-spin"
          style={warn ? { color: 'var(--danger, #c0392b)' } : undefined}
        />
      )}
      {state === 'pending' && (
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '2px solid var(--border-strong)',
          }}
        />
      )}
      <span>{label}</span>
    </div>
  );
}
