'use client';

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { Mic, Pause, Play } from 'lucide-react';
import { fmtDuration } from '@/lib/utils';
import { logEvent } from '@/lib/clientLog';
import { startMicForeground, stopMicForeground } from '@/lib/micForeground';
import {
  requestMicPermission,
  startMicRecording,
  pauseMicRecording,
  resumeMicRecording,
  stopMicRecording,
  discardMicRecording,
  cleanupRecordingFile,
  readRecordingAsBlob,
  getMicStatus,
} from '@/lib/micRecorder';
import { getRecordingSession, setRecordingSession } from '@/lib/recordingSession';

// Native (Capacitor) recording path — used ONLY inside the Android app, where
// a real OS-level recorder keeps capturing with the screen off and survives
// call interruptions, unlike the web MediaRecorder. It mirrors the public ref
// surface + callbacks of components/Recorder.jsx exactly, so new-meeting can
// swap it in transparently:
//   ref: finalize() · resume() · discard() · elapsed()
//   props: onPause(sec) · onDone(blob, sec) · onCancel() · cpCode · onLocation
//
// Recorder backend: our own MicRecorder plugin (records to an app-cache file
// and returns a file path), not capacitor-voice-recorder. The file-path flow
// avoids the 4-5x base64 memory bloat the old plugin caused on long clips.
const NativeRecorder = forwardRef(function NativeRecorder(
  { onPause, onDone, onCancel, cpCode, onLocation, resumeSession },
  ref
) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);

  // Same accumulate-across-pauses timer model as the web Recorder.
  const startRef = useRef(null);
  const accumRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => () => stopTimer(), []);

  // Recovery: if the native plugin is already recording (user navigated
  // away and got bounced back by RecordingGuard), restore our UI state
  // from the persisted session instead of starting a fresh recording.
  useEffect(() => {
    if (!resumeSession) return;
    let cancelled = false;
    (async () => {
      const status = await getMicStatus();
      if (cancelled) return;
      if (status !== 'recording' && status !== 'paused') return;
      accumRef.current = Number(resumeSession.accumSec) || 0;
      if (status === 'recording') {
        // Live recording — startRef is the real wall-clock moment we last
        // entered the running state, so `currentElapsed()` keeps ticking
        // accurately even though the component just mounted.
        startRef.current = Number(resumeSession.lastResumeMs) || Date.now();
        setRecording(true);
        setPaused(false);
        startTimer();
      } else {
        // Paused — frozen elapsed, no live tick.
        startRef.current = null;
        setRecording(true);
        setPaused(true);
        setElapsed(accumRef.current);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    finalize,
    resume,
    discard,
    elapsed: () => currentElapsed(),
  }));

  function currentElapsed() {
    if (!startRef.current) return accumRef.current;
    return accumRef.current + Math.round((Date.now() - startRef.current) / 1000);
  }
  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed(currentElapsed()), 250);
  }
  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // Device location via the WebView's geolocation (works in-app once the
  // location permission is granted). Non-blocking — recording never waits.
  function captureLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation || !onLocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        onLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) =>
        logEvent('recording.location_unavailable', {
          cp_code: cpCode || undefined,
          payload: { code: err?.code, message: err?.message },
        }),
      { enableHighAccuracy: false, timeout: 25000, maximumAge: 300000 }
    );
  }

  async function start() {
    try {
      const perm = await requestMicPermission();
      if (!perm?.value) {
        setError('Microphone permission was denied. Enable it in Settings to record.');
        return;
      }
      // Promote the app to a foreground service BEFORE the mic opens. This is
      // what keeps Android (Doze / app standby) from killing the recording
      // when the screen goes off. No-op on non-Android platforms.
      await startMicForeground();
      await startMicRecording();
      captureLocation();
      accumRef.current = 0;
      startRef.current = Date.now();
      setRecording(true);
      setPaused(false);
      setError(null);
      startTimer();
      // Seed/update the session so a future remount can restore state.
      const sess = getRecordingSession() || {};
      setRecordingSession({ ...sess, accumSec: 0, lastResumeMs: startRef.current });
      logEvent('recording.started', { cp_code: cpCode || undefined, payload: { engine: 'native' } });
    } catch (e) {
      setError(e?.message || 'Could not start recording.');
      logEvent('error', { payload: { where: 'native-recorder.start', message: e?.message } });
    }
  }

  async function pause() {
    try { await pauseMicRecording(); } catch {}
    if (startRef.current) accumRef.current += Math.round((Date.now() - startRef.current) / 1000);
    startRef.current = null;
    setPaused(true);
    stopTimer();
    setElapsed(accumRef.current);
    const sess = getRecordingSession();
    if (sess) setRecordingSession({ ...sess, accumSec: accumRef.current, lastResumeMs: null });
    logEvent('recording.paused', {
      cp_code: cpCode || undefined,
      payload: { elapsed_seconds: accumRef.current, engine: 'native' },
    });
    onPause && onPause(accumRef.current);
  }

  async function resume() {
    try { await resumeMicRecording(); } catch {}
    startRef.current = Date.now();
    setPaused(false);
    startTimer();
    const sess = getRecordingSession();
    if (sess) setRecordingSession({ ...sess, lastResumeMs: startRef.current });
    logEvent('recording.resumed', { cp_code: cpCode || undefined, payload: { engine: 'native' } });
  }

  async function finalize() {
    if (!recording) {
      onCancel && onCancel();
      return;
    }
    const durSec = currentElapsed();
    try {
      const v = await stopMicRecording(); // { filePath, mimeType, sizeBytes }
      await stopMicForeground();
      if (!v?.filePath) throw new Error('Recorder returned no file path');
      const blob = await readRecordingAsBlob({ filePath: v.filePath, mimeType: v.mimeType });
      // File served its purpose; drop the cached copy so it doesn't pile up
      // across many meetings. Best-effort — Android will reclaim cache anyway.
      cleanupRecordingFile(v.filePath);
      stopTimer();
      setRecording(false);
      setPaused(false);
      logEvent('recording.finalized', {
        cp_code: cpCode || undefined,
        payload: { duration_seconds: durSec, blob_bytes: blob.size, mime: blob.type, engine: 'native' },
      });
      onDone(blob, durSec);
    } catch (e) {
      setError(e?.message || 'Could not finish the recording.');
      logEvent('error', { payload: { where: 'native-recorder.finalize', message: e?.message } });
      // Drop the foreground notification even on error so the user isn't
      // left with a persistent "Recording in progress" banner.
      try { await stopMicForeground(); } catch {}
    }
  }

  async function discard() {
    const wasActive = recording;
    try { await discardMicRecording(); } catch {}
    await stopMicForeground();
    const accumAtDiscard = accumRef.current;
    accumRef.current = 0;
    startRef.current = null;
    stopTimer();
    setRecording(false);
    setPaused(false);
    setElapsed(0);
    if (wasActive) {
      logEvent('recording.discarded', {
        cp_code: cpCode || undefined,
        payload: { elapsed_seconds: accumAtDiscard, engine: 'native' },
      });
    }
    onCancel && onCancel();
  }

  return (
    <div className="oh-recorder">
      <div className="oh-timer oh-mono">{fmtDuration(elapsed)}</div>

      {recording && !paused ? (
        <div className="oh-wave">
          <span /><span /><span /><span /><span />
        </div>
      ) : (
        <div style={{ height: 24 }} />
      )}

      <button
        className={`oh-mic-btn ${recording && !paused ? 'recording' : ''}`}
        onClick={recording && !paused ? pause : recording && paused ? resume : start}
        aria-label={recording && !paused ? 'Pause recording' : recording && paused ? 'Resume recording' : 'Start recording'}
      >
        {recording && !paused ? <Pause size={32} fill="white" /> : recording && paused ? <Play size={32} fill="white" /> : <Mic size={36} />}
      </button>

      <div style={{ fontSize: 13, color: 'var(--ink-2)', textAlign: 'center', maxWidth: 360 }}>
        {!recording && !error && 'Tap the mic to start recording. Allow microphone access when prompted.'}
        {recording && !paused && 'Recording… keeps going with the screen off. Tap pause to review and finish.'}
        {recording && paused && 'Paused. Use the controls below to continue, upload, or discard.'}
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      </div>

      {!recording && (
        <button className="oh-btn ghost" onClick={() => onCancel && onCancel()}>
          Cancel
        </button>
      )}
    </div>
  );
});

export default NativeRecorder;
