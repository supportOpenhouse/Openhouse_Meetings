'use client';

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { Mic, Pause, Play } from 'lucide-react';
import { fmtDuration } from '@/lib/utils';

// The recorder now supports a pause→resume cycle so the parent can show a
// "Continue / Upload / Discard" review screen between Stop and finalizing the audio.
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
const Recorder = forwardRef(function Recorder({ onPause, onDone, onCancel }, ref) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);

  const mrRef = useRef(null);
  const chunksRef = useRef([]);
  // startRef stores the wall-clock time of the most recent (re)start so the running
  // timer keeps ticking accurately across pause/resume cycles.
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
  // True while a system audio interruption (incoming/picked-up call) has us
  // paused. Distinguishes auto-pause-for-call from user-initiated pause so we
  // can auto-resume after the call without entering the review screen.
  const callPausedRef = useRef(false);
  const [callInterrupted, setCallInterrupted] = useState(false);
  // Silent oscillator that keeps the audio session marked "in use" so mobile
  // browsers are less likely to suspend us when backgrounded briefly.
  const silentAudioRef = useRef(null);
  // Polls track.muted because Android Chrome doesn't reliably fire
  // onmute/onunmute when a call is answered — the property updates but the
  // event is skipped.
  const trackPollRef = useRef(null);
  const audioTrackRef = useRef(null);
  // Visible-on-screen debug log, enabled by ?debug=1. The user is debugging
  // call-interruption detection on Android Chrome and can't see DevTools live
  // during a real phone call — so we render the log inline.
  const [debugOn, setDebugOn] = useState(false);
  const [debugLog, setDebugLog] = useState([]);
  const [diag, setDiag] = useState({ mrState: 'idle', muted: null, ready: null });
  const debugOnRef = useRef(false);
  function dbg(label) {
    if (!debugOnRef.current) return;
    const t = audioTrackRef.current;
    const entry = {
      ts: new Date().toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0'),
      label,
      mr: mrRef.current?.state || 'none',
      muted: t ? String(t.muted) : '-',
      ready: t ? t.readyState : '-',
    };
    setDebugLog((prev) => {
      const next = [...prev, entry];
      return next.length > 40 ? next.slice(-40) : next;
    });
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    if (p.get('debug') === '1') {
      setDebugOn(true);
      debugOnRef.current = true;
    }
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      stopTrackPoll();
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

  function startTrackPoll(track) {
    stopTrackPoll();
    if (!track) return;
    let lastMuted = track.muted;
    let lastReady = track.readyState;
    let lastMrState = mrRef.current?.state;
    trackPollRef.current = setInterval(() => {
      // track.muted reflects OS-level interruption (call answered, audio focus
      // taken). readyState 'ended' means the OS killed the track entirely.
      const muted = track.muted;
      const ready = track.readyState;
      const mrState = mrRef.current?.state;
      if (debugOnRef.current) setDiag({ mrState: mrState || 'none', muted: String(muted), ready });
      if (muted !== lastMuted || ready !== lastReady || mrState !== lastMrState) {
        dbg(`poll Δ muted=${muted} ready=${ready} mr=${mrState}`);
        lastMuted = muted;
        lastReady = ready;
        lastMrState = mrState;
      }
      const interrupted = muted || ready === 'ended';
      if (interrupted && !callPausedRef.current) {
        dbg('poll → handleTrackMute');
        handleTrackMute();
      } else if (!interrupted && callPausedRef.current) {
        dbg('poll → handleTrackUnmute');
        handleTrackUnmute();
      }
    }, 400);
  }

  function stopTrackPoll() {
    if (trackPollRef.current) {
      clearInterval(trackPollRef.current);
      trackPollRef.current = null;
    }
  }

  useImperativeHandle(ref, () => ({
    finalize,
    resume,
    discard,
    elapsed: () => currentElapsed(),
  }));

  function currentElapsed() {
    if (paused || !startRef.current) return accumRef.current;
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
      // We intentionally don't fire onDone from onstop — finalize() handles that
      // explicitly, since the user might pause-then-continue several times before
      // committing to upload.

      // System audio interruption (phone call answered, WhatsApp call answered,
      // Bluetooth handoff). The OS mutes the input track; we pause and wait for
      // unmute, then auto-resume. If the call is never picked up the track is
      // not muted and recording continues uninterrupted.
      const [audioTrack] = stream.getAudioTracks();
      audioTrackRef.current = audioTrack || null;
      if (audioTrack) {
        audioTrack.onmute = () => { dbg('event onmute'); handleTrackMute(); };
        audioTrack.onunmute = () => { dbg('event onunmute'); handleTrackUnmute(); };
        audioTrack.onended = () => { dbg('event onended'); handleTrackEnded(); };
      }
      mr.onpause = () => dbg('mr.onpause');
      mr.onresume = () => dbg('mr.onresume');
      mr.onerror = (e) => dbg('mr.onerror ' + (e?.error?.name || ''));
      dbg('start');

      accumRef.current = 0;
      startRef.current = Date.now();
      mr.start(1000);
      setRecording(true);
      setPaused(false);
      startTimer();
      acquireWakeLock();
      startSilentAudio();
      startTrackPoll(audioTrack);
    } catch (e) {
      setError(e.message || 'Could not access the microphone');
    }
  }

  // OS interrupted the mic — almost always a picked-up phone or WhatsApp call.
  // Pause underneath without triggering the review-screen flow.
  function handleTrackMute() {
    dbg(`handleTrackMute (mr=${mrRef.current?.state})`);
    if (!mrRef.current || mrRef.current.state !== 'recording') return;
    accumRef.current += Math.round((Date.now() - startRef.current) / 1000);
    startRef.current = null;
    try { mrRef.current.pause(); } catch {}
    stopTimer();
    setElapsed(accumRef.current);
    callPausedRef.current = true;
    setCallInterrupted(true);
  }

  function handleTrackUnmute() {
    dbg(`handleTrackUnmute (callPaused=${callPausedRef.current})`);
    if (!callPausedRef.current) return;
    callPausedRef.current = false;
    setCallInterrupted(false);
    if (!mrRef.current) return;
    if (mrRef.current.state === 'paused') {
      try { mrRef.current.resume(); } catch {}
    }
    startRef.current = Date.now();
    startTimer();
    acquireWakeLock();
  }

  function handleTrackEnded() {
    // Stream died entirely (some Android OEMs kill the mic on call pickup
    // instead of muting). Best-effort: finalize what we have so the user
    // doesn't lose the recording.
    if (mrRef.current && mrRef.current.state !== 'inactive') {
      setError('Microphone was released by the system (likely a call). Tap pause to finish, or restart recording.');
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
    onPause && onPause(accumRef.current);
  }

  function resume() {
    if (!mrRef.current) return;
    if (mrRef.current.state === 'paused') mrRef.current.resume();
    startRef.current = Date.now();
    setPaused(false);
    startTimer();
    acquireWakeLock();
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
      stopTrackPoll();
      setRecording(false);
      setPaused(false);
      releaseWakeLock();
      stopSilentAudio();
      callPausedRef.current = false;
      setCallInterrupted(false);
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
    if (mrRef.current && mrRef.current.state !== 'inactive') {
      mrRef.current.onstop = null;
      try { mrRef.current.stop(); } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
    accumRef.current = 0;
    startRef.current = null;
    mrRef.current = null;
    stopTimer();
    stopTrackPoll();
    setRecording(false);
    setPaused(false);
    setElapsed(0);
    releaseWakeLock();
    stopSilentAudio();
    callPausedRef.current = false;
    setCallInterrupted(false);
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
        {recording && !paused && !callInterrupted && 'Recording… tap the pause button to review and finish.'}
        {recording && callInterrupted && 'Call in progress — recording auto-paused. It will resume when the call ends.'}
        {recording && paused && !callInterrupted && 'Paused. Use the controls below to continue, upload, or discard.'}
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      </div>

      {!recording && (
        <button className="oh-btn ghost" onClick={() => onCancel && onCancel()}>
          Cancel
        </button>
      )}

      {debugOn && (
        <div
          style={{
            marginTop: 16,
            width: '100%',
            maxWidth: 480,
            fontFamily: 'Geist Mono, ui-monospace, monospace',
            fontSize: 11,
            background: '#111',
            color: '#0f0',
            padding: 10,
            borderRadius: 8,
            border: '1px solid #444',
          }}
        >
          <div style={{ marginBottom: 6, color: '#fff' }}>
            DEBUG · mr={diag.mrState} muted={diag.muted} ready={diag.ready} callPaused={String(callInterrupted)}
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {debugLog.length === 0 && <div style={{ color: '#888' }}>(no events yet — start recording)</div>}
            {debugLog.map((e, i) => (
              <div key={i}>
                {e.ts} {e.label} [mr={e.mr} muted={e.muted} ready={e.ready}]
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default Recorder;
