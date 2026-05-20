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
  MapPin,
  Search,
  X,
  Handshake,
  Save,
} from 'lucide-react';
import Recorder from '@/components/Recorder';
import Toast from '@/components/Toast';
import { fmtDuration } from '@/lib/utils';
import { MEETING_TYPES } from '@/components/questions';
import { logEvent } from '@/lib/clientLog';
import { saveLocalRecording, deleteLocalRecording } from '@/lib/localQueue';
import { buildRecordingFilename, parseRecordingFilename, triggerDownload } from '@/lib/recordingName';
import { uploadAndCreateMeeting } from '@/lib/uploadMeeting';

// If no upload progress is observed for this long, surface a "looks stalled"
// message instead of leaving the user staring at "0%".
const STALL_WARN_MS = 12_000;
// Total time we allow upload to make no forward progress before failing fast.
const STALL_FAIL_MS = 45_000;

export default function NewMeetingClient({ user }) {
  const router = useRouter();
  const [step, setStep] = useState('form'); // form | record | review | process
  // Holds the Recorder instance methods (pause/resume/finalize/discard).
  const recorderRef = useRef(null);
  const [reviewedDuration, setReviewedDuration] = useState(0);
  const [form, setForm] = useState({
    cp_code: '',
    cp_mobile: '',
    cp_name: '',
    cp_city: '',
    purpose: '',
    meeting_type: '',
  });
  // Onboarding flow toggle. When true, the prospective CP has no cp_code yet:
  // the form collapses to just name (mandatory) + phone (optional) and the
  // meeting_type is locked to 'onboarding'. Lookups + everything else hide.
  const [isOnboarding, setIsOnboarding] = useState(false);
  // Tracks the most recent lookup so the UI can show "✓ matched" / "not found" / "looking up…".
  // shape: { state: 'idle'|'loading'|'matched'|'unmatched'|'error', byField: 'cp_code'|'phone', cp?: {...}, message?: string }
  const [cpLookup, setCpLookup] = useState({ state: 'idle' });
  const lookupTimer = useRef(null);
  const lookupSeq = useRef(0);
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
  // Mirror of recordedBlob in a ref — callbacks fired before a re-render (the
  // device-download path) need the blob synchronously.
  const recordedBlobRef = useRef(null);
  // IndexedDB id of the locally-queued copy of this recording. We save the
  // recording to the local queue immediately on finalize so it can't be lost
  // if the upload fails or the user navigates away mid-upload. On successful
  // upload we delete it.
  const [localQueueId, setLocalQueueId] = useState(null);
  // Filename of the device copy, once downloaded — surfaced in the UI so the
  // RM knows exactly what to look for in their Downloads folder.
  const [downloadedName, setDownloadedName] = useState(null);
  // True while we're uploading a file the RM picked from their device (the
  // "Restore & upload a file" path) rather than a fresh recording. Changes
  // which buttons the failure UI shows.
  const [isRestoreFlow, setIsRestoreFlow] = useState(false);
  const restoreCtxRef = useRef(null);

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
    setIsRestoreFlow(false);
    setDownloadedName(null);
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

  // Called by Recorder when the user taps Pause — show the review screen.
  function onRecorderPaused(elapsedSec) {
    setReviewedDuration(elapsedSec);
    setStep('review');
  }

  // Review screen actions
  function resumeRecording() {
    setStep('record');
    // Defer to next tick so the Recorder element is mounted/visible before resume.
    setTimeout(() => recorderRef.current?.resume(), 0);
  }
  function uploadFromReview() {
    // recorder.finalize() emits onRecorded(blob, durSec).
    recorderRef.current?.finalize();
  }
  function discardRecording() {
    if (!confirm('Discard this recording? You will need to start over.')) return;
    recorderRef.current?.discard();
    setRecordedBlob(null);
    setRecordedDuration(0);
    setStep('form');
  }

  // Single source of truth for the form metadata we attach to a recording,
  // both in the IndexedDB queue and the device-download filename.
  function meetingMeta() {
    return {
      cp_code: form.cp_code,
      cp_mobile: form.cp_mobile,
      cp_name: form.cp_name,
      cp_city: form.cp_city,
      purpose: form.purpose,
      meeting_type: isOnboarding ? 'onboarding' : form.meeting_type,
      is_onboarding: isOnboarding,
    };
  }

  // Save a real, properly-named .webm file into the device's Downloads folder.
  // The filename encodes all the meeting metadata so the file can be restored
  // into the app later even if the in-browser queue is gone.
  function downloadCopyToDevice() {
    if (!recordedBlob && !recordedBlobRef.current) return false;
    const b = recordedBlob || recordedBlobRef.current;
    const name = buildRecordingFilename(
      meetingMeta(),
      new Date(startedAt).toISOString(),
      recordedDuration,
      b.type
    );
    const ok = triggerDownload(b, name);
    if (ok) {
      setDownloadedName(name);
      logEvent('upload.retried', { cp_code: form.cp_code, payload: { savedToDevice: name } });
    }
    return ok;
  }

  // After finalize() the Recorder fires this with the actual webm blob. We
  // persist the recording to the IndexedDB queue BEFORE attempting upload so
  // it survives a failed/stalled network, a tab close, or a power loss. On a
  // successful upload we delete the local copy.
  async function onRecorded(blob, durSec) {
    setRecordedBlob(blob);
    recordedBlobRef.current = blob;
    setRecordedDuration(durSec);

    let localId = null;
    try {
      localId = await saveLocalRecording({
        blob,
        durSec,
        startedAt: new Date(startedAt).toISOString(),
        form: meetingMeta(),
      });
      setLocalQueueId(localId);
    } catch (e) {
      // Quota exceeded / IndexedDB blocked. Fall back to in-memory only —
      // the user can still upload, but loses the safety net.
      console.warn('Local queue save failed:', e?.message || e);
    }
    runUpload(blob, durSec, localId);
  }

  async function runUpload(blob, durSec, localIdArg) {
    const localId = localIdArg ?? localQueueId;
    abortedRef.current = false;
    setStep('process');
    setStage({ uploading: 'active' });
    setUploadPct(0);
    setUploadStatus('starting');
    setError(null);
    setErrorHint(null);
    logEvent('upload.started', {
      cp_code: form.cp_code,
      payload: { duration_seconds: durSec, blob_bytes: blob.size, meeting_type: form.meeting_type },
    });

    const pre = await preflightToken();
    if (!pre.ok) {
      setUploadStatus('failed');
      // Distinguish "no internet" from a real server-config problem so the RM
      // isn't told to "ask an admin to fix an env var" when they just have no
      // signal. preflight is a fetch — offline makes it throw "Failed to fetch".
      const offline =
        (typeof navigator !== 'undefined' && navigator.onLine === false) ||
        /failed to fetch|network|load failed/i.test(pre.reason || '');
      if (offline) {
        setError('No internet connection. Your recording is safe — retry when you’re back online.');
        setErrorHint('offline');
      } else {
        setError(pre.reason);
        setErrorHint('upload-config');
      }
      logEvent('upload.failed', {
        cp_code: form.cp_code,
        payload: { reason: offline ? 'offline-preflight' : 'preflight', message: (pre.reason || '').slice(0, 200) },
      });
      showToast(offline ? 'No internet — recording saved' : 'Upload not configured', offline ? 'error' : 'error');
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
        logEvent('upload.failed', {
          cp_code: form.cp_code,
          payload: { reason: 'no-progress-watchdog', percentage: uploadPct },
        });
      } else if (since > STALL_WARN_MS && uploadStatus !== 'stalled') {
        setUploadStatus('stalled');
        logEvent('upload.stalled', {
          cp_code: form.cp_code,
          payload: { percentage: uploadPct, since_ms: since },
        });
      }
    }, 1000);

    try {
      const filename = `meetings/${user.id}/${buildRecordingFilename(
        meetingMeta(),
        new Date(startedAt).toISOString(),
        durSec,
        blob.type
      )}`;

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

      setStage({ uploading: 'done' });

      // 1. Persist a stub meeting row (status='processing'). Fast — just an INSERT.
      const createRes = await fetch('/api/meetings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_url: newBlob.url,
          cp_code: isOnboarding ? null : form.cp_code,
          cp_mobile: isOnboarding ? (form.cp_mobile || null) : form.cp_mobile,
          cp_name: form.cp_name,
          cp_city: isOnboarding ? null : form.cp_city,
          purpose: isOnboarding ? null : form.purpose,
          meeting_type: isOnboarding ? 'onboarding' : form.meeting_type,
          duration_seconds: durSec,
          started_at: new Date(startedAt).toISOString(),
        }),
      });
      if (!createRes.ok) {
        const errData = await createRes.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned ${createRes.status}`);
      }
      const { id: meetingId } = await createRes.json();

      // 2. Fire-and-forget the heavy processing. keepalive:true ensures the request
      // survives the navigation we're about to do. We don't await — the user is free.
      try {
        fetch(`/api/meetings/${meetingId}/process`, {
          method: 'POST',
          keepalive: true,
        });
      } catch {
        // Even if the fetch synchronously throws, the row exists and an admin can retry.
      }

      // Upload + create both succeeded — drop the local safety copy.
      if (localId) {
        deleteLocalRecording(localId).catch(() => {});
        setLocalQueueId(null);
      }

      showToast('Recording saved — processing in background', 'success');
      router.push('/dashboard');
      // Force a fresh server fetch so the new row (still status='processing') is in
      // the cached Router data before polling takes over.
      router.refresh();
    } catch (e) {
      if (abortedRef.current) return;
      clearWatchdog();
      console.error(e);
      setUploadStatus('failed');
      // Offline beats every other diagnosis — if the phone has no signal,
      // don't blame the token or the deployment.
      const offline =
        (typeof navigator !== 'undefined' && navigator.onLine === false) ||
        /failed to fetch|networkerror|load failed|err_internet/i.test(e.message || '');
      if (offline) {
        setError('No internet connection. Your recording is safe — retry when you’re back online.');
        setErrorHint('offline');
      } else {
        setError(e.message);
        // Heuristic: CORS / 400 from @vercel/blob almost always mean a token/store problem.
        if (/cors|400/i.test(e.message || '')) {
          setErrorHint('upload-token');
        }
      }
      logEvent('upload.failed', {
        cp_code: form.cp_code,
        payload: { reason: offline ? 'offline' : 'exception', message: (e?.message || '').slice(0, 300) },
      });
      // NOTE: we deliberately do NOT auto-download here. iOS Safari blocks
      // downloads that aren't triggered by a direct user tap, so an automatic
      // download would silently fail on iPhone. The failure UI surfaces a
      // prominent "Save to device" button instead — a real tap, which works
      // on both iOS and Android.
      showToast(e.message, 'error');
    }
  }

  function retryUpload() {
    if (!recordedBlob) return;
    logEvent('upload.retried', { cp_code: form.cp_code });
    runUpload(recordedBlob, recordedDuration, localQueueId);
  }

  // "Restore & upload a file" — the RM picks a .webm previously downloaded to
  // their device. The meeting metadata is encoded in the filename, so this
  // uploads with no extra input needed.
  function onRestoreFile(e) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    const parsed = parseRecordingFilename(file.name);
    if (!parsed) {
      showToast(
        'Unrecognised file — pick a recording that was downloaded from this app.',
        'error'
      );
      return;
    }
    restoreCtxRef.current = { file, parsed };
    doRestoreUpload();
  }

  async function doRestoreUpload() {
    const ctx = restoreCtxRef.current;
    if (!ctx) return;
    const { file, parsed } = ctx;
    setIsRestoreFlow(true);
    setStep('process');
    setStage({ uploading: 'active' });
    setUploadStatus('starting');
    setUploadPct(0);
    setError(null);
    setErrorHint(null);
    logEvent('upload.retried', {
      cp_code: parsed.cp_code,
      payload: { restoredFromFile: file.name },
    });
    try {
      await uploadAndCreateMeeting({
        blob: file,
        form: {
          cp_code: parsed.cp_code,
          cp_mobile: parsed.cp_mobile,
          cp_name: parsed.cp_name,
          cp_city: '',
          purpose: '',
          meeting_type: parsed.meeting_type,
          is_onboarding: parsed.is_onboarding,
        },
        durSec: parsed.duration_seconds,
        userId: user.id,
        startedAt: parsed.started_at,
        onProgress: (pct) => {
          setUploadStatus('progress');
          setUploadPct(pct);
        },
      });
      setStage({ uploading: 'done' });
      showToast('Recording uploaded — processing in background', 'success');
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setUploadStatus('failed');
      setError(err?.message || 'Upload failed');
      showToast(err?.message || 'Upload failed', 'error');
    }
  }

  // Bail out of a stalled or failed upload without losing the recording.
  // This runs inside a user-tap handler, so the device download IS allowed on
  // iOS Safari. We let it commit before navigating away.
  function saveForLater() {
    abortedRef.current = true;
    clearWatchdog();
    const ok = downloadCopyToDevice();
    showToast(
      ok ? 'Saved to your device — retry from the dashboard when online'
         : 'Couldn’t save the file — retry from the dashboard',
      ok ? 'success' : 'error'
    );
    // Brief delay so the browser finishes writing the file before the page
    // unloads (the blob URL is revoked on navigation).
    setTimeout(() => {
      router.push('/dashboard');
      router.refresh();
    }, 700);
  }

  // Debounced lookup against /api/cp/lookup whenever the user finishes typing
  // either cp_code or cp_mobile. Prefills the OTHER mandatory field + name + city
  // when a CP is found. Manual edits to a prefilled field are preserved (we only
  // overwrite when the field is empty — see scheduleLookup below).
  function scheduleLookup({ cp_code, cp_mobile }) {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    const seq = ++lookupSeq.current;

    const code = (cp_code ?? form.cp_code).trim();
    const mobileDigits = (cp_mobile ?? form.cp_mobile).replace(/\D+/g, '');

    // Need at least one fully-typed identifier to attempt a lookup.
    const ready = code.length >= 2 || mobileDigits.length >= 10;
    if (!ready) {
      setCpLookup({ state: 'idle' });
      return;
    }

    setCpLookup((p) => ({ ...p, state: 'loading' }));
    lookupTimer.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        // Prefer cp_code when present — it's the unique key on the CP side.
        if (code) params.set('cp_code', code);
        else params.set('phone', mobileDigits);

        const res = await fetch(`/api/cp/lookup?${params}`);
        if (seq !== lookupSeq.current) return; // a newer keystroke superseded us
        const data = await res.json();

        if (!res.ok) {
          setCpLookup({ state: 'error', message: data?.error || 'Lookup failed' });
          return;
        }
        if (data.configured === false) {
          setCpLookup({ state: 'idle' });
          return;
        }
        if (!data.found) {
          setCpLookup({ state: 'unmatched', byField: code ? 'cp_code' : 'phone' });
          return;
        }
        setCpLookup({
          state: 'matched',
          byField: code ? 'cp_code' : 'phone',
          cp: data.cp,
        });

        // Prefill empty fields only — don't clobber what the RM typed.
        setForm((f) => ({
          ...f,
          cp_code: f.cp_code.trim() || data.cp.cp_code || '',
          cp_mobile: f.cp_mobile.trim() || data.cp.phone || '',
          cp_name: f.cp_name.trim() || data.cp.name || '',
          cp_city: f.cp_city.trim() || data.cp.city || '',
        }));
      } catch (e) {
        if (seq !== lookupSeq.current) return;
        setCpLookup({ state: 'error', message: e?.message || 'Lookup failed' });
      }
    }, 450);
  }

  function onCpCodeChange(value) {
    setForm((f) => ({ ...f, cp_code: value }));
    scheduleLookup({ cp_code: value });
  }
  function onCpMobileChange(value) {
    setForm((f) => ({ ...f, cp_mobile: value }));
    scheduleLookup({ cp_mobile: value });
  }
  function clearCpFill() {
    setForm({ cp_code: '', cp_mobile: '', cp_name: '', cp_city: '', purpose: form.purpose });
    setCpLookup({ state: 'idle' });
  }

  const canStart = isOnboarding
    ? !!form.cp_name.trim()
    : form.cp_code.trim() && form.cp_mobile.trim() && form.meeting_type;

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
            <button
              type="button"
              className={`oh-onboard-toggle ${isOnboarding ? 'on' : ''}`}
              onClick={() => setIsOnboarding((v) => !v)}
              title="Toggle if this is a pitch to a prospective CP who isn't onboarded yet"
            >
              <span className="check">{isOnboarding ? <CheckCircle2 size={16} /> : <Handshake size={16} />}</span>
              <span className="oh-onboard-text">
                <span className="oh-onboard-title">NEW CP</span>
                <span className="oh-onboard-sub">
                  Is this a CP onboarding meeting (no CP code)?
                </span>
              </span>
            </button>

            {isOnboarding ? (
              <>
                <div className="oh-form-row-2">
                  <div className="oh-field">
                    <label>
                      <User size={11} style={{ display: 'inline', marginRight: 4 }} /> Prospective CP name <span className="oh-req">*</span>
                    </label>
                    <input
                      className="oh-input"
                      placeholder="Their name"
                      value={form.cp_name}
                      onChange={(e) => setForm({ ...form, cp_name: e.target.value })}
                      autoComplete="off"
                      autoFocus
                    />
                  </div>
                  <div className="oh-field">
                    <label>
                      <Phone size={11} style={{ display: 'inline', marginRight: 4 }} /> Mobile (optional)
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
              </>
            ) : (
              <>
                <div className="oh-form-row-2">
                  <div className="oh-field">
                    <label>
                      <Hash size={11} style={{ display: 'inline', marginRight: 4 }} /> CP code <span className="oh-req">*</span>
                    </label>
                    <input
                      className="oh-input"
                      placeholder="e.g. CP00670"
                      value={form.cp_code}
                      onChange={(e) => onCpCodeChange(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="oh-field">
                    <label>
                      <Phone size={11} style={{ display: 'inline', marginRight: 4 }} /> CP mobile <span className="oh-req">*</span>
                    </label>
                    <input
                      className="oh-input"
                      placeholder="98XXXXXXXX"
                      value={form.cp_mobile}
                      onChange={(e) => onCpMobileChange(e.target.value)}
                      inputMode="tel"
                      autoComplete="off"
                    />
                  </div>
                </div>

                <CpLookupStatus lookup={cpLookup} onClear={clearCpFill} />

                <div className="oh-form-row-2">
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
                      <MapPin size={11} style={{ display: 'inline', marginRight: 4 }} /> City (optional)
                    </label>
                    <input
                      className="oh-input"
                      placeholder="e.g. Gurugram"
                      value={form.cp_city}
                      onChange={(e) => setForm({ ...form, cp_city: e.target.value })}
                    />
                  </div>
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

                <div className="oh-field">
                  <label>
                    Meeting type <span className="oh-req">*</span>
                  </label>
                  <div className="oh-mtype-grid">
                    {MEETING_TYPES.filter((t) => t.value !== 'onboarding').map((t) => (
                      <button
                        type="button"
                        key={t.value}
                        className={`oh-mtype-card ${form.meeting_type === t.value ? 'selected' : ''}`}
                        onClick={() => setForm({ ...form, meeting_type: t.value })}
                      >
                        <div className="oh-mtype-label">{t.label}</div>
                        <div className="oh-mtype-desc">{t.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

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

            <div className="oh-restore-row">
              <span className="oh-restore-text">
                Have a recording saved on your device that didn&rsquo;t upload?
              </span>
              <label className="oh-restore-btn">
                <Save size={13} /> Restore &amp; upload a file
                <input
                  type="file"
                  accept="audio/*,.webm,.m4a,.mp4,.ogg,.mp3"
                  style={{ display: 'none' }}
                  onChange={onRestoreFile}
                />
              </label>
            </div>
          </div>
        </>
      )}

      {(step === 'record' || step === 'review') && (
        <>
          <div className="oh-eyebrow">Step 2 of 2</div>
          <h1 className="oh-h1">
            {step === 'record' ? <>Recording <em>in progress</em></> : <>Recording <em>paused</em></>}
          </h1>
          <p className="oh-sub">
            {step === 'record'
              ? "Speak normally. Tap pause when you want to review or finish."
              : "Review or continue recording. When you upload, you’ll be sent to the dashboard and processing finishes in the background."}
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

          <div style={{ display: step === 'record' ? 'block' : 'none' }}>
            <Recorder
              ref={recorderRef}
              onPause={onRecorderPaused}
              onDone={onRecorded}
              onCancel={() => setStep('form')}
            />
          </div>

          {step === 'review' && (
            <div className="oh-review-card">
              <div className="oh-review-time">
                <span className="oh-eyebrow">Recorded</span>
                <div className="oh-mono">{fmtDuration(reviewedDuration)}</div>
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 0 }}>
                Continue if you have more to capture, or upload to finish. Discard throws this
                recording away.
              </p>
              <div className="oh-review-actions">
                <button className="oh-btn accent" onClick={uploadFromReview}>
                  Upload
                </button>
                <button className="oh-btn" onClick={resumeRecording}>
                  Continue recording
                </button>
                <button className="oh-btn ghost danger" onClick={discardRecording}>
                  Discard
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {step === 'process' && (
        <>
          <h1 className="oh-h1">Uploading…</h1>
          <p className="oh-sub">
            Once the upload finishes, you'll be sent to the dashboard and the rest
            (transcription + summary) happens in the background.
          </p>

          <div className="oh-card" style={{ padding: '20px 24px', marginTop: 16 }}>
            <ProgressStep
              label={uploadStepLabel(stage.uploading, uploadStatus, uploadPct)}
              state={stage.uploading}
              warn={uploadStatus === 'stalled'}
            />
          </div>

          {uploadStatus === 'stalled' && !error && (
            <div className="oh-warn-box">
              <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <strong>Upload looks stalled.</strong> No data has reached Vercel Blob in a few
                seconds. Still retrying in the background — if this doesn't recover, you'll get
                a clear error shortly.
                <div style={{ marginTop: 10 }}>
                  <button className="oh-btn ghost" onClick={saveForLater}>
                    <Save size={13} /> Save to device & retry from dashboard
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="oh-error-box">
              <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <strong>{errorHint === 'offline' ? 'No internet connection' : 'Upload failed.'}</strong>
                <div style={{ marginTop: 4 }}>{error}</div>

                {errorHint === 'offline' && (
                  <div className="oh-hint">
                    This isn’t an app problem — your phone has no signal. Nothing is lost. Either
                    wait for signal and tap <strong>Retry</strong>, or tap <strong>Save to
                    device</strong> and upload later from the dashboard / “Restore &amp; upload a
                    file”.
                  </div>
                )}
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

                {isRestoreFlow ? (
                  <div className="oh-hint" style={{ borderLeft: '3px solid #2f6f2f', color: 'var(--ink)' }}>
                    The file is still safe on your device — tap Retry to try the upload again.
                  </div>
                ) : (
                  <div className="oh-hint" style={{ borderLeft: '3px solid #2f6f2f', color: 'var(--ink)' }}>
                    {downloadedName ? (
                      <>
                        Your recording was <strong>saved to this device&rsquo;s Downloads</strong> as:
                        <div className="oh-mono" style={{ marginTop: 4, fontSize: 11.5, wordBreak: 'break-all' }}>
                          {downloadedName}
                        </div>
                        Tap Retry upload to try again now, or it&rsquo;s safe in your files.
                      </>
                    ) : (
                      <>
                        The recording is still here. Tap <strong>Save to device</strong> below to
                        keep a copy in your Downloads folder before leaving this page.
                      </>
                    )}
                  </div>
                )}

                <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {isRestoreFlow ? (
                    <button className="oh-btn accent" onClick={doRestoreUpload}>
                      <RefreshCw size={14} /> Retry upload
                    </button>
                  ) : (
                    <>
                      {recordedBlob && (
                        <button className="oh-btn accent" onClick={retryUpload}>
                          <RefreshCw size={14} /> Retry upload
                        </button>
                      )}
                      <button className="oh-btn" onClick={downloadCopyToDevice}>
                        <Save size={14} /> {downloadedName ? 'Save to device again' : 'Save to device'}
                      </button>
                    </>
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
        .oh-onboard-toggle {
          all: unset;
          box-sizing: border-box;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border: 1.5px dashed var(--border);
          border-radius: 10px;
          background: var(--paper);
          transition: all 0.15s ease;
        }
        .oh-onboard-toggle:hover {
          border-color: var(--accent);
          background: rgba(184, 52, 28, 0.03);
        }
        .oh-onboard-toggle.on {
          border-style: solid;
          border-color: var(--accent);
          background: rgba(184, 52, 28, 0.06);
        }
        .oh-onboard-toggle .check {
          flex-shrink: 0;
          color: var(--ink-2);
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--paper-2);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .oh-onboard-toggle.on .check {
          color: var(--accent);
          background: rgba(184, 52, 28, 0.1);
        }
        .oh-onboard-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .oh-onboard-title { font-size: 14px; font-weight: 500; color: var(--ink); }
        .oh-onboard-sub { font-size: 12px; color: var(--ink-2); line-height: 1.35; }
        .oh-restore-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px dashed var(--border);
        }
        .oh-restore-text {
          font-size: 12.5px;
          color: var(--ink-2);
        }
        .oh-restore-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          font-size: 12.5px;
          font-weight: 500;
          color: var(--ink);
          padding: 7px 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--paper);
          white-space: nowrap;
        }
        .oh-restore-btn:hover {
          border-color: var(--ink-2);
          background: var(--paper-2);
        }
        .oh-mtype-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .oh-mtype-card {
          all: unset;
          box-sizing: border-box;
          cursor: pointer;
          padding: 14px 16px;
          border: 1.5px solid var(--border);
          border-radius: 10px;
          background: var(--paper);
          transition: all 0.15s ease;
        }
        .oh-mtype-card:hover {
          border-color: var(--ink-2);
          background: var(--paper-2);
        }
        .oh-mtype-card.selected {
          border-color: var(--accent);
          background: rgba(184, 52, 28, 0.04);
        }
        .oh-mtype-label {
          font-size: 14px;
          font-weight: 500;
          color: var(--ink);
          margin-bottom: 3px;
        }
        .oh-mtype-desc {
          font-size: 12px;
          color: var(--ink-2);
          line-height: 1.35;
        }
        @media (max-width: 768px) {
          .oh-mtype-grid { grid-template-columns: 1fr; }
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
        .oh-req { color: var(--danger); margin-left: 2px; }
        .oh-cp-lookup {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 8px;
          background: var(--paper-2);
          color: var(--ink-2);
          font-size: 13px;
          margin-top: -6px;
        }
        .oh-cp-lookup.matched {
          background: rgba(34, 139, 34, 0.08);
          color: #2f6f2f;
          border: 1px solid rgba(34, 139, 34, 0.18);
        }
        .oh-cp-lookup.unmatched {
          background: var(--paper-2);
          color: var(--ink-2);
          border: 1px solid var(--border-strong);
        }
        .oh-cp-lookup.error {
          background: var(--danger-soft, rgba(192, 57, 43, 0.08));
          color: var(--danger);
        }
        .oh-cp-clear {
          all: unset;
          box-sizing: border-box;
          margin-left: auto;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          color: inherit;
          opacity: 0.6;
        }
        .oh-cp-clear:hover { opacity: 1; background: rgba(0,0,0,0.06); }
        .oh-review-card {
          margin-top: 20px;
          background: var(--paper);
          border: 1px solid var(--border-strong);
          border-radius: 14px;
          padding: 22px 24px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .oh-review-time {
          display: flex;
          align-items: baseline;
          gap: 12px;
        }
        .oh-review-time .oh-mono { font-size: 28px; font-weight: 500; letter-spacing: -0.01em; }
        .oh-review-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        @media (max-width: 768px) {
          .oh-review-actions { flex-direction: column-reverse; }
          .oh-review-actions :global(.oh-btn) { width: 100%; }
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

function CpLookupStatus({ lookup, onClear }) {
  if (!lookup || lookup.state === 'idle') return null;
  if (lookup.state === 'loading') {
    return (
      <div className="oh-cp-lookup">
        <Loader2 size={14} className="oh-spin" /> Looking up CP…
      </div>
    );
  }
  if (lookup.state === 'matched') {
    return (
      <div className="oh-cp-lookup matched">
        <CheckCircle2 size={14} />
        <span>
          Matched <strong>{lookup.cp?.name || lookup.cp?.cp_code}</strong>
          {lookup.cp?.city ? ` · ${lookup.cp.city}` : ''}
          {lookup.cp?.company ? ` · ${lookup.cp.company}` : ''}
        </span>
        <button type="button" className="oh-cp-clear" onClick={onClear} title="Clear prefilled data">
          <X size={12} />
        </button>
      </div>
    );
  }
  if (lookup.state === 'unmatched') {
    return (
      <div className="oh-cp-lookup unmatched">
        <Search size={14} />
        No match in CP inventory — enter the remaining details manually.
      </div>
    );
  }
  return (
    <div className="oh-cp-lookup error">
      <AlertCircle size={14} /> {lookup.message || 'Lookup error'}
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
