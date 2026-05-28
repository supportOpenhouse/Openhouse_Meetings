'use client';

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { Mic, Pause, Play } from 'lucide-react';
import { VoiceRecorder } from 'capacitor-voice-recorder';
import { fmtDuration } from '@/lib/utils';
import { logEvent } from '@/lib/clientLog';
import { startMicForeground, stopMicForeground } from '@/lib/micForeground';

// Native (Capacitor) recording path — used ONLY inside the Android app, where
// a real OS-level recorder keeps capturing with the screen off and survives
// call interruptions, unlike the web MediaRecorder. It mirrors the public ref
// surface + callbacks of components/Recorder.jsx exactly, so new-meeting can
// swap it in transparently:
//   ref: finalize() · resume() · discard() · elapsed()
//   props: onPause(sec) · onDone(blob, sec) · onCancel() · cpCode · onLocation
const NativeRecorder = forwardRef(function NativeRecorder(
  { onPause, onDone, onCancel, cpCode, onLocation },
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
      const perm = await VoiceRecorder.requestAudioRecordingPermission();
      if (!perm?.value) {
        setError('Microphone permission was denied. Enable it in Settings to record.');
        return;
      }
      // Promote the app to a foreground service BEFORE the mic opens. This is
      // what keeps Android (Doze / app standby) from killing the recording
      // when the screen goes off. No-op on non-Android platforms.
      await startMicForeground();
      await VoiceRecorder.startRecording();
      captureLocation();
      accumRef.current = 0;
      startRef.current = Date.now();
      setRecording(true);
      setPaused(false);
      setError(null);
      startTimer();
      logEvent('recording.started', { cp_code: cpCode || undefined, payload: { engine: 'native' } });
    } catch (e) {
      setError(e?.message || 'Could not start recording.');
      logEvent('error', { payload: { where: 'native-recorder.start', message: e?.message } });
    }
  }

  async function pause() {
    try { await VoiceRecorder.pauseRecording(); } catch {}
    if (startRef.current) accumRef.current += Math.round((Date.now() - startRef.current) / 1000);
    startRef.current = null;
    setPaused(true);
    stopTimer();
    setElapsed(accumRef.current);
    logEvent('recording.paused', {
      cp_code: cpCode || undefined,
      payload: { elapsed_seconds: accumRef.current, engine: 'native' },
    });
    onPause && onPause(accumRef.current);
  }

  async function resume() {
    try { await VoiceRecorder.resumeRecording(); } catch {}
    startRef.current = Date.now();
    setPaused(false);
    startTimer();
    logEvent('recording.resumed', { cp_code: cpCode || undefined, payload: { engine: 'native' } });
  }

  async function finalize() {
    if (!recording) {
      onCancel && onCancel();
      return;
    }
    const durSec = currentElapsed();
    try {
      const res = await VoiceRecorder.stopRecording();
      await stopMicForeground();
      const v = res?.value || {};
      const blob = base64ToBlob(v.recordDataBase64, v.mimeType || 'audio/aac');
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
    try { await VoiceRecorder.stopRecording(); } catch {}
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

// The plugin hands back the whole recording as base64 — decode to a Blob the
// existing upload pipeline understands. (Long recordings hold the full clip in
// memory here; if that becomes a problem we move to a file-URI plugin.)
function base64ToBlob(base64, mime) {
  if (!base64) return new Blob([], { type: mime });
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export default NativeRecorder;
