'use client';

import { useEffect, useRef } from 'react';

// Audio player that works around the MediaRecorder WebM flaw: those files
// carry no duration in the header, so `audio.duration` is Infinity until the
// browser scans the whole file — which leaves the seek bar stuck at the end.
// On mount we seek to a huge time, wait for `durationchange` (fires once the
// browser has scanned to the real end), then seek back to 0. After that the
// scrubber tracks correctly.
//
// Newer recordings already have their duration patched at record time, in
// which case `isFinite(duration)` is true immediately and this is a no-op.
export default function WebmAudio({ src, style }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;

    function onMeta() {
      if (cancelled) return;
      if (!isFinite(el.duration)) {
        const onDurationChange = () => {
          if (cancelled) return;
          if (isFinite(el.duration)) {
            el.removeEventListener('durationchange', onDurationChange);
            try { el.currentTime = 0; } catch {}
          }
        };
        el.addEventListener('durationchange', onDurationChange);
        try { el.currentTime = 1e101; } catch {}
      }
    }

    if (el.readyState >= 1) onMeta();
    else el.addEventListener('loadedmetadata', onMeta, { once: true });

    return () => { cancelled = true; };
  }, [src]);

  return (
    <audio
      ref={ref}
      controls
      src={src}
      preload="metadata"
      style={{ width: '100%', ...style }}
    />
  );
}
