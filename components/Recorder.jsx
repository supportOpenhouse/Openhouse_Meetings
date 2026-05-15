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

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    },
    []
  );

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

      accumRef.current = 0;
      startRef.current = Date.now();
      mr.start(1000);
      setRecording(true);
      setPaused(false);
      startTimer();
    } catch (e) {
      setError(e.message || 'Could not access the microphone');
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
    onPause && onPause(accumRef.current);
  }

  function resume() {
    if (!mrRef.current) return;
    if (mrRef.current.state === 'paused') mrRef.current.resume();
    startRef.current = Date.now();
    setPaused(false);
    startTimer();
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
    setRecording(false);
    setPaused(false);
    setElapsed(0);
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
