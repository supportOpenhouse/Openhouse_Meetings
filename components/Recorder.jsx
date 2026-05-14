'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { fmtDuration } from '@/lib/utils';

export default function Recorder({ onDone, onCancel }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const mrRef = useRef(null);
  const chunksRef = useRef([]);
  const startRef = useRef(null);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    },
    []
  );

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const mime = mimes.find((m) => MediaRecorder.isTypeSupported(m)) || '';
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
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
        const durSec = Math.round((Date.now() - startRef.current) / 1000);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        onDone(blob, durSec);
      };

      startRef.current = Date.now();
      mr.start(1000);
      setRecording(true);
      timerRef.current = setInterval(() => {
        setElapsed(Math.round((Date.now() - startRef.current) / 1000));
      }, 250);
    } catch (e) {
      setError(e.message || 'Could not access the microphone');
    }
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    if (mrRef.current && mrRef.current.state !== 'inactive') mrRef.current.stop();
  }

  return (
    <div className="oh-recorder">
      <div className="oh-timer oh-mono">{fmtDuration(elapsed)}</div>

      {recording ? (
        <div className="oh-wave">
          <span /><span /><span /><span /><span />
        </div>
      ) : (
        <div style={{ height: 24 }} />
      )}

      <button
        className={`oh-mic-btn ${recording ? 'recording' : ''}`}
        onClick={recording ? stop : start}
      >
        {recording ? <Square size={32} fill="white" /> : <Mic size={36} />}
      </button>

      <div
        style={{
          fontSize: 13,
          color: 'var(--ink-2)',
          textAlign: 'center',
          maxWidth: 360,
        }}
      >
        {!recording && !error &&
          'Tap the mic to start recording. Allow microphone access when prompted.'}
        {recording && `Recording… tap the square to stop.`}
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      </div>

      {!recording && (
        <button className="oh-btn ghost" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
