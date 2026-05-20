'use client';

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { Mic, Pause, Play } from 'lucide-react';
import { fmtDuration } from '@/lib/utils';
import { logEvent } from '@/lib/clientLog';

// The recorder supports a pause→resume cycle so the parent can show a
// "Continue / Upload / Discard" review screen between Stop and finalizing.
//
// Public surface via ref:
//   recorder.finalize()  → ends the recording for real and fires onDone(blob, durSec)
//   recorder.resume()    → resume after pause
//   recorder.discard()   → discard the recording and reset
//   recorder.elapsed()   → current elapsed seconds (live)
//
// Callbacks:
//   onPause(elapsedSeconds)  — user hit pause; parent shows the review screen
//   onDone(blob, durSec)     — finalize was called; audio is ready
//   onCancel()               — user discarded before recording any audio
//
// We deliberately do NOT try to auto-pause on phone-call interruptions: the
// signal Android Chrome surfaces is unreliable (track.muted toggles or stream
// ends inconsistently across OEMs), and false positives froze the UI when a
// call came in. The recording will continue through a call; the RM trims or
// re-records as needed.
const Recorder = forwardRef(function Recorder({ onPause, onDone, onCancel }, ref) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);

  const mrRef = useRef(null);
  const chunksRef = useRef([]);
  // startRef stores the wall-clock time of the most recent (re)start so the
  // running timer keeps ticking accurately across pause/resume cycles.
  const startRef = useRef(null);
  // Accumulated seconds across previous pause/resume cycles.
  const accumRef = useRef(0);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const mimeRef = useRef('');
  // Screen wake lock — held while actively recording so a screen-off doesn't
  // suspend the tab. Re-acquired on visibilitychange because the browser drops
  // it whenever the page becomes hidden.
  const wakeLockRef = useRef(null);
  // Silent oscillator that keeps the audio session marked "in use" so mobile
  // browsers are less likely to suspend us when backgrounded briefly.
  const silentAudioRef = useRef(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      releaseWakeLock();
      stopSilentAudio();
    },
    []
  );

  // Re-acquire wake lock when the tab comes back to the foreground — the
  // browser auto-releases it on hide, but we want it back if we're still
  // actively recording.
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === 'visible' && recording && !paused) {
        acquireWakeLock();
      }
    }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [recording, paused]);

  async function acquireWakeLock() {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    if (wakeLockRef.current) return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      wakeLockRef.current = lock;
      lock.addEventListener('release', () => {
        if (wakeLockRef.current === lock) wakeLockRef.current = null;
      });
    } catch {
      // Low-power mode, permission denied, etc. — silently degrade.
    }
  }

  function releaseWakeLock() {
    if (wakeLockRef.current) {
      try { wakeLockRef.current.release(); } catch {}
      wakeLockRef.current = null;
    }
  }

  function startSilentAudio() {
    try {
      if (silentAudioRef.current) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0; // truly silent
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      silentAudioRef.current = { ctx, osc };
    } catch {
      // Not critical.
    }
  }

  function stopSilentAudio() {
    const s = silentAudioRef.current;
    if (!s) return;
    try { s.osc.stop(); } catch {}
    try { s.ctx.close(); } catch {}
    silentAudioRef.current = null;
  }

  useImperativeHandle(ref, () => ({
    finalize,
    resume,
    discard,
    elapsed: () => currentElapsed(),
  }));

  function currentElapsed() {
    // Don't read the `paused` React state here — it gets captured by stale
    // closures inside the setInterval callback after a resume, freezing the
    // displayed timer until the NEXT pause. startRef.current is null whenever
    // we're not actively running (pause() nulls it, resume() restores it),
    // so it's the only signal we need.
    if (!startRef.current) return accumRef.current;
    return accumRef.current + Math.round((Date.now() - startRef.current) / 1000);
  }

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed(currentElapsed());
    }, 250);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const mime = mimes.find((m) => MediaRecorder.isTypeSupported(m)) || '';
      mimeRef.current = mime;
      const mr = new MediaRecorder(
        stream,
        mime
          ? { mimeType: mime, audioBitsPerSecond: 24000 }
          : { audioBitsPerSecond: 24000 }
      );
      mrRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      // We intentionally don't fire onDone from onstop — finalize() handles
      // that explicitly, since the user might pause-then-continue several
      // times before committing to upload.

      accumRef.current = 0;
      startRef.current = Date.now();
      mr.start(1000);
      setRecording(true);
      setPaused(false);
      startTimer();
      acquireWakeLock();
      startSilentAudio();
      logEvent('recording.started', { payload: { mime: mime || 'default' } });
    } catch (e) {
      setError(e.message || 'Could not access the microphone');
      logEvent('error', { payload: { where: 'recorder.start', message: e?.message } });
    }
  }

  function pause() {
    if (!mrRef.current || mrRef.current.state !== 'recording') return;
    // Bank the elapsed time so the timer doesn't reset when we resume.
    accumRef.current += Math.round((Date.now() - startRef.current) / 1000);
    startRef.current = null;
    mrRef.current.pause();
    setPaused(true);
    stopTimer();
    setElapsed(accumRef.current);
    releaseWakeLock();
    logEvent('recording.paused', { payload: { elapsed_seconds: accumRef.current } });
    onPause && onPause(accumRef.current);
  }

  function resume() {
    if (!mrRef.current) return;
    if (mrRef.current.state === 'paused') mrRef.current.resume();
    startRef.current = Date.now();
    setPaused(false);
    startTimer();
    acquireWakeLock();
    logEvent('recording.resumed', { payload: { elapsed_seconds: accumRef.current } });
  }

  function finalize() {
    if (!mrRef.current) {
      onCancel && onCancel();
      return;
    }
    const durSec = currentElapsed();
    const mime = mimeRef.current;

    const handleStop = () => {
      const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
      const stream = streamRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      mrRef.current = null;
      stopTimer();
      setRecording(false);
      setPaused(false);
      releaseWakeLock();
      stopSilentAudio();
      logEvent('recording.finalized', {
        payload: { duration_seconds: durSec, blob_bytes: blob.size },
      });
      onDone(blob, durSec);
    };

    if (mrRef.current.state === 'inactive') {
      handleStop();
      return;
    }
    mrRef.current.onstop = handleStop;
    mrRef.current.stop();
  }

  function discard() {
    const wasActive = mrRef.current && mrRef.current.state !== 'inactive';
    if (wasActive) {
      mrRef.current.onstop = null;
      try { mrRef.current.stop(); } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const accumAtDiscard = accumRef.current;
    chunksRef.current = [];
    accumRef.current = 0;
    startRef.current = null;
    mrRef.current = null;
    stopTimer();
    setRecording(false);
    setPaused(false);
    setElapsed(0);
    releaseWakeLock();
    stopSilentAudio();
    if (wasActive) {
      logEvent('recording.discarded', { payload: { elapsed_seconds: accumAtDiscard } });
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

      <div
        style={{
          fontSize: 13,
          color: 'var(--ink-2)',
          textAlign: 'center',
          maxWidth: 360,
        }}
      >
        {!recording && !error && 'Tap the mic to start recording. Allow microphone access when prompted.'}
        {recording && !paused && 'Recording… tap the pause button to review and finish.'}
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

export default Recorder;
