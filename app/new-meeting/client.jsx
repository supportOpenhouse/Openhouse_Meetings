'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import Recorder from '@/components/Recorder';
import Toast from '@/components/Toast';

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
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  function startRecording() {
    setStartedAt(Date.now());
    setStep('record');
  }

  async function onRecorded(blob, durSec) {
    setStep('process');
    setStage({ uploading: 'active', transcribing: 'pending', summarizing: 'pending' });
    setUploadPct(0);
    setError(null);

    try {
      // 1. Direct upload to Vercel Blob (bypasses the 4.5 MB serverless body limit)
      const safeCode = (form.cp_code || 'cp').replace(/[^a-zA-Z0-9_-]/g, '');
      const filename = `meetings/${user.id}/${Date.now()}-${safeCode}.webm`;

      const newBlob = await upload(filename, blob, {
        access: 'public',
        handleUploadUrl: '/api/upload-url',
        contentType: blob.type || 'audio/webm',
        onUploadProgress: (e) => {
          // e.percentage is 0–100
          setUploadPct(Math.round(e.percentage || 0));
        },
      });

      setStage((s) => ({ ...s, uploading: 'done', transcribing: 'active' }));

      // 2. Trigger server-side processing
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

      // The server runs both transcribe + summarise; we mark them done together
      // since the server doesn't currently stream intermediate progress.
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned ${res.status}`);
      }

      setStage({ uploading: 'done', transcribing: 'done', summarizing: 'done' });
      showToast('Meeting saved', 'success');
      setTimeout(() => router.push('/dashboard'), 600);
    } catch (e) {
      console.error(e);
      setError(e.message);
      showToast(e.message, 'error');
    }
  }

  if (step === 'form') {
    const canStart = form.cp_code.trim() && form.cp_mobile.trim();
    return (
      <div style={{ maxWidth: 620 }}>
        <button
          className="oh-btn ghost"
          style={{ marginBottom: 24, padding: '6px 10px' }}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="oh-field">
              <label>
                <Hash size={11} style={{ display: 'inline', marginRight: 4 }} /> CP code
              </label>
              <input
                className="oh-input"
                placeholder="e.g. CP-1284"
                value={form.cp_code}
                onChange={(e) => setForm({ ...form, cp_code: e.target.value })}
              />
            </div>
            <div className="oh-field">
              <label>
                <Phone size={11} style={{ display: 'inline', marginRight: 4 }} /> CP mobile
              </label>
              <input
                className="oh-input"
                placeholder="e.g. 98XXXXXXXX"
                value={form.cp_mobile}
                onChange={(e) => setForm({ ...form, cp_mobile: e.target.value })}
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

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="oh-btn accent" onClick={startRecording} disabled={!canStart}>
              <Mic size={14} /> Proceed to record
            </button>
            <button className="oh-btn ghost" onClick={() => router.push('/dashboard')}>
              Cancel
            </button>
          </div>
        </div>
        <Toast toast={toast} />
      </div>
    );
  }

  if (step === 'record') {
    return (
      <div style={{ maxWidth: 620 }}>
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
        <Toast toast={toast} />
      </div>
    );
  }

  if (step === 'process') {
    return (
      <div style={{ maxWidth: 620 }}>
        <h1 className="oh-h1">Processing…</h1>
        <p className="oh-sub">
          Upload + transcription + summary typically takes 1–4 minutes for a 60-min recording.
          Keep this tab open.
        </p>

        <div className="oh-card" style={{ padding: '20px 24px', marginTop: 16 }}>
          <ProgressStep
            label={
              stage.uploading === 'active'
                ? `Uploading audio (${uploadPct}%)`
                : 'Uploading audio'
            }
            state={stage.uploading}
          />
          <ProgressStep
            label="Transcribing with ElevenLabs Scribe v2"
            state={stage.transcribing}
          />
          <ProgressStep label="Generating summary with Claude" state={stage.summarizing} />
        </div>

        {error && (
          <div
            className="oh-card"
            style={{
              padding: 16,
              marginTop: 16,
              borderColor: 'var(--danger)',
              color: 'var(--danger)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <strong>Something went wrong:</strong> {error}
              <div style={{ marginTop: 12 }}>
                <button className="oh-btn ghost" onClick={() => router.push('/dashboard')}>
                  Back to dashboard
                </button>
              </div>
            </div>
          </div>
        )}
        <Toast toast={toast} />
      </div>
    );
  }

  return null;
}

function ProgressStep({ label, state }) {
  return (
    <div
      className={`oh-progress-step ${
        state === 'done' ? 'done' : state === 'active' ? 'active' : ''
      }`}
    >
      {state === 'done' && <CheckCircle2 size={16} />}
      {state === 'active' && <Loader2 size={16} className="oh-spin" />}
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
