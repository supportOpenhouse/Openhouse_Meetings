'use client';

import { AlertCircle, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { fmtDate, fmtDuration } from '@/lib/utils';

// Shown on a recorder page when the app was killed mid-recording (see
// lib/recordingRecovery.js). `who` is a short label for whom the recording
// was with, e.g. the CP code.
export default function RecoverRecordingBanner({ orphan, who, busy, error, onRecover, onDiscard }) {
  const stoppedAt = orphan?.lastModifiedMs ? fmtDate(orphan.lastModifiedMs) : null;
  return (
    <div className="oh-recover">
      <div className="oh-recover-head">
        <AlertCircle size={15} />
        <strong>Recover previous recording ({fmtDuration(orphan?.durationSec || 0)})</strong>
      </div>
      <div className="oh-recover-sub">
        The app closed while you were recording{who ? ` with ${who}` : ''}
        {stoppedAt ? ` — audio saved up to ${stoppedAt.replace(/^Today, /, '')}` : ''}. Upload it now?
      </div>
      {error && <div className="oh-recover-err">{error}</div>}
      <div className="oh-recover-actions">
        <button type="button" className="oh-btn accent" onClick={onRecover} disabled={busy}>
          {busy ? <Loader2 size={14} className="oh-spin" /> : <RotateCcw size={14} />} Recover &amp; upload
        </button>
        <button type="button" className="oh-btn ghost" onClick={onDiscard} disabled={busy}>
          <Trash2 size={14} /> Discard
        </button>
      </div>
      <style jsx>{`
        .oh-recover {
          border: 1px solid var(--warning);
          background: var(--warning-soft);
          border-radius: 11px;
          padding: 12px 14px;
          margin-bottom: 16px;
        }
        .oh-recover-head {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--warning);
          font-size: 14px;
        }
        .oh-recover-head strong { color: var(--ink); font-weight: 600; }
        .oh-recover-sub { font-size: 13px; color: var(--ink-2); margin-top: 4px; }
        .oh-recover-err { font-size: 12.5px; color: var(--danger); margin-top: 6px; }
        .oh-recover-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
      `}</style>
    </div>
  );
}
