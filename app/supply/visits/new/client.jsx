'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Plus,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Mic,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import Recorder from '@/components/Recorder';
import NativeRecorder from '@/components/NativeRecorder';
import { uploadVisitAudio, createSalesVisit } from '@/lib/salesUpload';
import { fmtDuration } from '@/lib/utils';
import { initials } from '@/lib/salesFormat';

const ENGAGEMENT = [
  { key: 'positive', label: 'Positive' },
  { key: 'neutral', label: 'Neutral' },
  { key: 'disengaged', label: 'Disengaged' },
];
const OUTCOMES = [
  { key: 'onboarded', label: 'Onboarded' },
  { key: 'follow_up_required', label: 'Follow-up required' },
  { key: 'future_potential', label: 'Future potential' },
  { key: 'not_interested', label: 'Not interested' },
];

export default function SalesNewVisitClient({ user, preselectedCpId }) {
  const router = useRouter();

  // cp = picker | record | review | form | submit
  const [step, setStep] = useState(preselectedCpId ? 'loading' : 'cp');
  const [cp, setCp] = useState(null);
  const [isNative, setIsNative] = useState(false);

  const recorderRef = useRef(null);
  const recordStartRef = useRef(null);
  const [reviewDuration, setReviewDuration] = useState(0);

  // Background audio upload — kicked off the instant recording is finalized so
  // it overlaps the rep filling the assessment form. Submit then only has to
  // create the row (near-instant) instead of waiting on the network.
  const audioUrlRef = useRef(null);
  const audioUploadPromiseRef = useRef(null);

  const [blob, setBlob] = useState(null);
  const [durSec, setDurSec] = useState(0);
  const [checkOut, setCheckOut] = useState(null);
  const [location, setLocation] = useState(null);

  // Visit form fields
  const [meetingType, setMeetingType] = useState('first_visit');
  const [keyPoints, setKeyPoints] = useState('');
  const [engagement, setEngagement] = useState('');
  const [competitive, setCompetitive] = useState('');
  const [inventoryReceived, setInventoryReceived] = useState(false);
  const [inventoryCount, setInventoryCount] = useState('');
  const [outcome, setOutcome] = useState('');
  const [followupDate, setFollowupDate] = useState('');
  const [nextAction, setNextAction] = useState('');

  // Submit state
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      setIsNative(Capacitor.isNativePlatform());
    } catch {}
  }, []);

  // Preselected CP: fetch it, then jump straight to recording.
  useEffect(() => {
    if (!preselectedCpId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/supply/cps/${preselectedCpId}`);
        const data = await res.json();
        if (cancelled) return;
        if (data?.cp) {
          selectCp(data.cp);
        } else {
          setStep('cp');
        }
      } catch {
        if (!cancelled) setStep('cp');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedCpId]);

  function selectCp(selected) {
    setCp(selected);
    recordStartRef.current = new Date();
    setStep('record');
  }

  // ---- recorder callbacks ----
  function onRecorderPaused(sec) {
    setReviewDuration(sec);
    setStep('review');
  }
  function onRecorded(b, dur) {
    setBlob(b);
    setDurSec(dur);
    setCheckOut(new Date());
    setStep('form');
    startBackgroundUpload(b, dur);
  }
  function startBackgroundUpload(b, dur) {
    audioUrlRef.current = null;
    setUploadStatus('uploading');
    setUploadPct(0);
    const checkIn = recordStartRef.current || new Date();
    const p = uploadVisitAudio({
      blob: b,
      durSec: dur,
      userId: user.id,
      cp,
      startedAt: checkIn,
      onProgress: setUploadPct,
      onStatus: setUploadStatus,
    })
      .then((url) => {
        audioUrlRef.current = url;
        return url;
      })
      .catch((err) => {
        setUploadStatus('error');
        throw err;
      });
    audioUploadPromiseRef.current = p;
    // Swallow here so a slow/early failure doesn't surface as an unhandled
    // rejection; handleSubmit re-awaits and handles errors there.
    p.catch(() => {});
  }
  function useRecording() {
    recorderRef.current?.finalize();
  }
  function continueRecording() {
    recorderRef.current?.resume();
    setStep('record');
  }
  function discardRecording() {
    recorderRef.current?.discard();
    setBlob(null);
    audioUrlRef.current = null;
    audioUploadPromiseRef.current = null;
    setUploadStatus('');
    setUploadPct(0);
    setStep('record');
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    setError('');
    if (!blob) {
      setError('No recording captured. Please record the visit first.');
      return;
    }
    setStep('submit');

    const checkIn = recordStartRef.current || new Date();
    const visit = {
      cp_code: cp.cp_code,
      cp_name: cp.cp_name,
      meeting_type: meetingType,
      check_in_time: checkIn.toISOString(),
      check_out_time: (checkOut || new Date()).toISOString(),
      meeting_lat: location?.lat ?? null,
      meeting_lng: location?.lng ?? null,
      location_accuracy: location?.accuracy ?? null,
      key_discussion_points: keyPoints.trim() || null,
      cp_engagement_level: engagement || null,
      competitive_update: competitive.trim() || null,
      inventory_received: inventoryReceived,
      inventory_pipeline_count: inventoryReceived && inventoryCount !== '' ? Number(inventoryCount) : null,
      meeting_outcome: outcome || null,
      next_followup_date: followupDate || null,
      next_action_required: nextAction.trim() || null,
    };

    try {
      // The background upload (started when recording finished) is usually done
      // by now. If not, wait on it; if it failed, retry inline.
      let audioUrl = audioUrlRef.current;
      if (!audioUrl) {
        setUploadStatus('uploading');
        try {
          audioUrl = await audioUploadPromiseRef.current;
        } catch {
          audioUrl = await uploadVisitAudio({
            blob,
            durSec,
            userId: user.id,
            cp,
            startedAt: checkIn,
            onProgress: setUploadPct,
            onStatus: setUploadStatus,
          });
        }
        audioUrlRef.current = audioUrl;
      }

      setUploadStatus('creating');
      const visitId = await createSalesVisit({ visit, audioUrl, durSec });
      router.push(`/supply/visits/${visitId}`);
    } catch (err) {
      setError(err?.message || 'Upload failed. Please try again.');
      setUploadStatus('failed');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (step === 'loading') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '80px 0',
          color: 'var(--ink-2)',
          fontSize: 14,
        }}
      >
        <Loader2 size={22} className="oh-spin" />
        <span>Loading partner…</span>
      </div>
    );
  }

  if (step === 'cp') {
    return <CpPicker onSelect={selectCp} />;
  }

  return (
    <div>
      <button
        className="sx-back"
        onClick={() => {
          if (step === 'record' || step === 'review') {
            recorderRef.current?.discard?.();
            setStep('cp');
          } else if (step === 'form') {
            setStep('record');
          }
        }}
        disabled={step === 'submit'}
      >
        <ArrowLeft size={16} /> {step === 'form' ? 'Re-record' : 'Change partner'}
      </button>

      {cp && (
        <div className="sx-visit-cp">
          <div className="avatar">{initials(cp.cp_name)}</div>
          <div>
            <div className="nm">{cp.cp_name}</div>
            <div className="cd">{cp.cp_id}</div>
          </div>
        </div>
      )}

      {/* Record / review */}
      {(step === 'record' || step === 'review') && (
        <>
          <h1 className="oh-h1" style={{ fontSize: 30, marginTop: 14 }}>
            Record the <em>visit</em>
          </h1>
          <p className="oh-sub">
            Capture the conversation — you’ll log the assessment right after.
          </p>

          <div style={{ display: step === 'record' ? 'block' : 'none' }}>
            {isNative ? (
              <NativeRecorder
                ref={recorderRef}
                cpCode={cp?.cp_id || ''}
                onLocation={setLocation}
                onPause={onRecorderPaused}
                onDone={onRecorded}
                onCancel={() => setStep('cp')}
              />
            ) : (
              <Recorder
                ref={recorderRef}
                cpCode={cp?.cp_id || ''}
                onLocation={setLocation}
                onPause={onRecorderPaused}
                onDone={onRecorded}
                onCancel={() => setStep('cp')}
              />
            )}
          </div>

          {step === 'review' && (
            <div className="sx-review">
              <div className="t">
                <span className="oh-eyebrow">Recorded</span>
                <div className="oh-mono dur">{fmtDuration(reviewDuration)}</div>
              </div>
              <p>Use this recording to continue to the assessment, keep recording, or discard.</p>
              <div className="acts">
                <button className="oh-btn accent" onClick={useRecording}>
                  <CheckCircle2 size={16} /> Use recording
                </button>
                <button className="oh-btn" onClick={continueRecording}>
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

      {/* Assessment form */}
      {step === 'form' && (
        <>
          <h1 className="oh-h1" style={{ fontSize: 30, marginTop: 14 }}>
            Log the <em>assessment</em>
          </h1>
          <p className="oh-sub" style={{ marginBottom: 12 }}>
            <Mic size={13} style={{ verticalAlign: '-2px' }} /> {fmtDuration(durSec)} recorded — the
            AI summary fills in automatically once you submit.
          </p>

          {uploadStatus && uploadStatus !== 'creating' && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12.5,
                fontWeight: 500,
                padding: '6px 11px',
                borderRadius: 100,
                marginBottom: 18,
                background:
                  uploadStatus === 'done'
                    ? 'var(--success-soft)'
                    : uploadStatus === 'error'
                      ? 'var(--danger-soft)'
                      : 'var(--accent-soft)',
                color:
                  uploadStatus === 'done'
                    ? 'var(--success)'
                    : uploadStatus === 'error'
                      ? 'var(--danger)'
                      : 'var(--accent)',
              }}
            >
              {uploadStatus === 'done' ? (
                <>
                  <CheckCircle2 size={13} /> Recording uploaded — submit when ready
                </>
              ) : uploadStatus === 'error' ? (
                <>
                  <AlertCircle size={13} /> Upload hit a snag — we’ll retry on submit
                </>
              ) : (
                <>
                  <Loader2 size={13} className="oh-spin" /> Uploading recording… {uploadPct}%
                </>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="sx-form">
            <div className="sx-card">
              <div className="oh-field">
                <label>Visit type</label>
                <div className="sx-chips">
                  <button
                    type="button"
                    className={`sx-chip ${meetingType === 'first_visit' ? 'on' : ''}`}
                    onClick={() => setMeetingType('first_visit')}
                  >
                    First visit
                  </button>
                  <button
                    type="button"
                    className={`sx-chip ${meetingType === 'repeat_visit' ? 'on' : ''}`}
                    onClick={() => setMeetingType('repeat_visit')}
                  >
                    Repeat visit
                  </button>
                </div>
              </div>

              <div className="oh-field">
                <label>CP engagement</label>
                <div className="sx-chips">
                  {ENGAGEMENT.map((o) => (
                    <button
                      type="button"
                      key={o.key}
                      className={`sx-chip ${engagement === o.key ? 'on' : ''}`}
                      onClick={() => setEngagement(engagement === o.key ? '' : o.key)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="oh-field">
                <label>Key discussion points</label>
                <textarea
                  className="oh-textarea"
                  value={keyPoints}
                  onChange={(e) => setKeyPoints(e.target.value)}
                  placeholder="What did you discuss? (helps the AI ground its summary)"
                />
              </div>
            </div>

            <div className="sx-card">
              <div className="oh-field">
                <label>Competitive update</label>
                <textarea
                  className="oh-textarea"
                  value={competitive}
                  onChange={(e) => setCompetitive(e.target.value)}
                  placeholder="Any competitor / other-platform intel"
                />
              </div>

              <div className="sx-toggle">
                <span className="sx-toggle-text">Inventory received</span>
                <button
                  type="button"
                  className={`sx-switch ${inventoryReceived ? 'on' : ''}`}
                  onClick={() => setInventoryReceived((v) => !v)}
                  aria-pressed={inventoryReceived}
                  aria-label="Inventory received"
                />
              </div>
              {inventoryReceived && (
                <div className="oh-field">
                  <label>Pipeline count</label>
                  <input
                    className="oh-input"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={inventoryCount}
                    onChange={(e) => setInventoryCount(e.target.value)}
                    placeholder="How many units / listings?"
                  />
                </div>
              )}
            </div>

            <div className="sx-card">
              <div className="oh-field">
                <label>Outcome</label>
                <div className="sx-chips">
                  {OUTCOMES.map((o) => (
                    <button
                      type="button"
                      key={o.key}
                      className={`sx-chip ${outcome === o.key ? 'on' : ''}`}
                      onClick={() => setOutcome(outcome === o.key ? '' : o.key)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sx-grid-2">
                <div className="oh-field">
                  <label>Next follow-up date</label>
                  <input
                    className="oh-input oh-date"
                    type="date"
                    value={followupDate}
                    onChange={(e) => setFollowupDate(e.target.value)}
                  />
                </div>
                <div className="oh-field">
                  <label>Next action</label>
                  <input
                    className="oh-input"
                    value={nextAction}
                    onChange={(e) => setNextAction(e.target.value)}
                    placeholder="e.g. Share resale inventory"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="sx-form-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" className="oh-btn accent block">
              Submit visit
            </button>
          </form>
        </>
      )}

      {/* Submitting */}
      {step === 'submit' && (
        <div style={{ marginTop: 20 }}>
          <h1 className="oh-h1" style={{ fontSize: 30 }}>
            {uploadStatus === 'failed' ? 'Upload failed' : 'Saving your visit…'}
          </h1>
          {uploadStatus !== 'failed' ? (
            <>
              <p className="oh-sub">
                Uploading the recording. Transcription + AI summary run in the background once it’s
                in.
              </p>
              <div className="sx-progress-card">
                <div className="row">
                  <Loader2 size={16} className="oh-spin" />
                  <span>
                    {uploadStatus === 'uploading'
                      ? `Uploading audio… ${uploadPct}%`
                      : uploadStatus === 'creating'
                        ? 'Creating visit…'
                        : uploadStatus === 'preflight'
                          ? 'Preparing upload…'
                          : 'Starting…'}
                  </span>
                </div>
                <div className="bar">
                  <div className="fill" style={{ width: `${Math.max(5, uploadPct)}%` }} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="sx-form-error" role="alert" style={{ marginTop: 12 }}>
                <AlertCircle size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />
                {error}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="oh-btn accent" onClick={handleSubmit}>
                  Retry upload
                </button>
                <button className="oh-btn ghost" onClick={() => setStep('form')}>
                  Back to form
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <style jsx>{`
        .sx-back {
          all: unset;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--accent);
          font-weight: 500;
        }
        .sx-back:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .sx-visit-cp {
          display: flex;
          align-items: center;
          gap: 11px;
          margin-top: 14px;
          padding: 12px 14px;
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 13px;
        }
        .sx-visit-cp .avatar {
          width: 40px;
          height: 40px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-sans); font-weight: 700;
          font-size: 18px;
          color: var(--accent);
          background: var(--accent-soft);
        }
        .sx-visit-cp .nm {
          font-weight: 500;
          color: var(--ink);
        }
        .sx-visit-cp .cd {
          font-family: var(--font-mono), monospace;
          font-size: 12px;
          color: var(--ink-3);
        }
        .sx-review {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px;
          margin-top: 16px;
        }
        .sx-review .dur {
          font-family: var(--font-sans); font-weight: 700;
          font-size: 30px;
        }
        .sx-review p {
          font-size: 13.5px;
          color: var(--ink-2);
          margin: 10px 0 16px;
        }
        .sx-review .acts {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .sx-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-width: 640px;
          margin-top: 18px;
        }
        .sx-card {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .sx-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .sx-form-error {
          background: var(--danger-soft);
          color: var(--danger);
          border-radius: 10px;
          padding: 12px 14px;
          font-size: 13.5px;
        }
        .sx-progress-card {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px;
          margin-top: 16px;
        }
        .sx-progress-card .row {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          color: var(--ink);
          margin-bottom: 14px;
        }
        .sx-progress-card .bar {
          height: 8px;
          border-radius: 100px;
          background: var(--paper-2);
          overflow: hidden;
        }
        .sx-progress-card .fill {
          height: 100%;
          background: var(--accent);
          border-radius: 100px;
          transition: width 0.25s ease;
        }
        @media (max-width: 768px) {
          .sx-grid-2 {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

// ── CP picker shown when no partner is preselected ──────────────────────────
function CpPicker({ onSelect }) {
  const [cps, setCps] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const debounce = useRef(null);
  const seq = useRef(0);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const mySeq = ++seq.current;
      setLoading(true);
      try {
        const res = await fetch(`/api/supply/cps?search=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (mySeq === seq.current) setCps(data?.cps ?? []);
      } catch {
        if (mySeq === seq.current) setCps([]);
      } finally {
        if (mySeq === seq.current) setLoading(false);
      }
    }, 220);
    return () => debounce.current && clearTimeout(debounce.current);
  }, [q]);

  return (
    <div>
      <Link href="/supply" className="sx-back">
        <ArrowLeft size={16} /> Home
      </Link>
      <h1 className="oh-h1" style={{ fontSize: 30, marginTop: 8 }}>
        Who are you <em>visiting?</em>
      </h1>
      <p className="oh-sub">Pick a partner from the registry to start the visit.</p>

      <div className="sx-search" style={{ marginBottom: 14 }}>
        <span className="ico">
          <Search size={16} />
        </span>
        <input
          className="oh-input"
          placeholder="Search partners…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>

      <Link href="/supply/cps/new" className="oh-btn ghost block" style={{ marginBottom: 14 }}>
        <Plus size={16} /> Register a new partner
      </Link>

      {loading && cps.length === 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 0',
            color: 'var(--ink-2)',
          }}
        >
          <Loader2 size={20} className="oh-spin" />
        </div>
      ) : cps.length === 0 ? (
        <div className="sx-empty">
          <div className="t">{q ? 'No matches' : 'No partners yet'}</div>
          <div className="s">Register a partner to log your first visit.</div>
        </div>
      ) : (
        <div className="sx-list" style={{ opacity: loading ? 0.6 : 1 }}>
          {cps.map((c) => (
            <button key={c.id} className="sx-row" onClick={() => onSelect(c)}>
              <div className="avatar">{initials(c.cp_name)}</div>
              <div className="body">
                <div className="title">{c.cp_name}</div>
                <div className="meta">
                  <span className="code">{c.cp_id}</span>
                  {c.phone_primary && <span>{c.phone_primary}</span>}
                </div>
              </div>
              <span className="chev">
                <ChevronRight size={18} />
              </span>
            </button>
          ))}
        </div>
      )}

      <style jsx>{`
        .sx-back {
          all: unset;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--accent);
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
