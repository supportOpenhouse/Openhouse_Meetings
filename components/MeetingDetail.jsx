'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Phone,
  Clock,
  Volume2,
  FileText,
  Sparkles,
  Flame,
  TrendingUp,
  Snowflake,
  Trash2,
  User,
  MapPin,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { fmtDate, fmtDuration, buildSpeakerTurns } from '@/lib/utils';
import { getQuestionsForType, MEETING_TYPES } from './questions';

export default function MeetingDetail({ meeting, onClose, onDelete, canDelete }) {
  const router = useRouter();
  const [tab, setTab] = useState('summary');
  const [resumming, setResumming] = useState(false);
  const [resumMsg, setResumMsg] = useState(null);
  const [localMeeting, setLocalMeeting] = useState(meeting);
  const turns = buildSpeakerTurns(localMeeting.transcript_words || []);
  const fallbackText = !turns.length ? localMeeting.transcript_text || '' : '';

  async function resummarize(newType) {
    setResumming(true);
    setResumMsg(null);
    try {
      const r = await fetch(`/api/meetings/${localMeeting.id}/resummarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meeting_type: newType }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Re-summarize failed');
      setLocalMeeting((m) => ({ ...m, summary: j.summary, meeting_type: j.meeting_type }));
      setResumMsg(`Regenerated as ${j.meeting_type}.`);
      router.refresh();
    } catch (e) {
      setResumMsg('Error: ' + e.message);
    } finally {
      setResumming(false);
    }
  }

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="oh-modal-bg" onClick={onClose}>
      <div className="oh-modal" onClick={(e) => e.stopPropagation()}>
        <div className="oh-modal-header">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="oh-eyebrow oh-truncate">
              {localMeeting.rm_name || localMeeting.rm_email} · {fmtDate(localMeeting.started_at)}
            </div>
            <h2 className="oh-detail-title">
              CP <span className="oh-mono">{localMeeting.cp_code}</span>
            </h2>
            <div className="oh-detail-meta">
              {localMeeting.cp_name && <span><User size={12} /> {localMeeting.cp_name}</span>}
              <span><Phone size={12} /> {localMeeting.cp_mobile}</span>
              {localMeeting.cp_city && <span><MapPin size={12} /> {localMeeting.cp_city}</span>}
              <span><Clock size={12} /> {fmtDuration(localMeeting.duration_seconds)}</span>
              {localMeeting.language && <span>· {localMeeting.language}</span>}
            </div>
          </div>
          <button
            className="oh-btn ghost oh-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="oh-modal-body">
          {localMeeting.purpose && (
            <div className="oh-purpose">
              <strong>Purpose:</strong> {localMeeting.purpose}
            </div>
          )}

          {localMeeting.audio_url && (
            <div style={{ marginBottom: 24 }}>
              <div className="oh-eyebrow" style={{ marginBottom: 8 }}>
                <Volume2 size={11} style={{ display: 'inline', marginRight: 4 }} />
                Recording
              </div>
              <audio controls src={localMeeting.audio_url} style={{ width: '100%' }} />
            </div>
          )}

          <div className="oh-tabs">
            <TabBtn active={tab === 'summary'} onClick={() => setTab('summary')}>
              <Sparkles size={13} /> Smart summary
            </TabBtn>
            <TabBtn active={tab === 'transcript'} onClick={() => setTab('transcript')}>
              <FileText size={13} /> Transcript
            </TabBtn>
          </div>

          {tab === 'summary' && (
            <>
              <SummaryView
                summary={localMeeting.summary}
                meetingType={localMeeting.meeting_type || 'engagement'}
              />
              <div className="oh-resum-row">
                <span className="oh-eyebrow" style={{ marginRight: 8 }}>Regenerate as:</span>
                {MEETING_TYPES.map((t) => {
                  const current = (localMeeting.meeting_type || 'engagement') === t.value;
                  return (
                    <button
                      key={t.value}
                      className={`oh-btn ghost oh-resum-btn ${current ? 'current' : ''}`}
                      onClick={() => resummarize(t.value)}
                      disabled={resumming}
                      title={
                        current
                          ? `Re-run Claude over the same transcript using ${t.label}`
                          : `Reclassify as ${t.label} and regenerate the summary`
                      }
                    >
                      {resumming ? <Loader2 size={13} className="oh-spin" /> : <RefreshCw size={13} />}
                      {t.label}
                    </button>
                  );
                })}
              </div>
              {resumMsg && (
                <div className="oh-resum-msg">{resumMsg}</div>
              )}
            </>
          )}
          {tab === 'transcript' && (
            <div>
              {turns.length > 0 ? (
                turns.map((t, i) => (
                  <div
                    key={i}
                    className={`oh-speaker s${parseInt(t.speaker.replace(/\D/g, '')) % 3}`}
                  >
                    <div className="who">{t.speaker.replace('speaker_', 'Speaker ')}</div>
                    <div className="text">{t.text}</div>
                  </div>
                ))
              ) : (
                <div className="oh-speaker s0">
                  <div className="text">
                    {fallbackText || (
                      <em style={{ color: 'var(--ink-3)' }}>No transcript available.</em>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {canDelete && (
            <>
              <div className="oh-divider" />
              <div className="oh-delete-row">
                <button className="oh-btn danger" onClick={onDelete}>
                  <Trash2 size={13} /> Delete meeting
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .oh-detail-title {
          font-family: 'Instrument Serif', serif;
          font-size: 28px;
          letter-spacing: -0.01em;
          margin: 4px 0 6px;
        }
        .oh-detail-title :global(.oh-mono) { font-size: 22px; }
        .oh-detail-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 18px;
          font-size: 13px;
          color: var(--ink-2);
        }
        .oh-detail-meta span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .oh-close-btn { padding: 8px; flex-shrink: 0; }
        .oh-truncate {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .oh-purpose {
          background: var(--paper-2);
          padding: 12px 14px;
          border-radius: 8px;
          margin-bottom: 20px;
          font-size: 13.5px;
          color: var(--ink-2);
        }
        .oh-purpose strong { color: var(--ink); }
        .oh-tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 18px;
          border-bottom: 1px solid var(--border);
        }
        .oh-delete-row {
          display: flex;
          justify-content: flex-end;
        }
        .oh-resum-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px dashed var(--border);
        }
        .oh-resum-btn.current {
          background: var(--paper-2);
          opacity: 0.7;
        }
        .oh-resum-msg {
          font-size: 13px;
          color: var(--ink-2);
          background: var(--paper-2);
          padding: 8px 12px;
          border-radius: 8px;
          margin-top: 8px;
        }
        @media (max-width: 768px) {
          .oh-detail-title { font-size: 22px; }
          .oh-detail-title :global(.oh-mono) { font-size: 18px; }
          .oh-delete-row { justify-content: stretch; }
          .oh-delete-row :global(.oh-btn) { width: 100%; }
        }
      `}</style>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`oh-tab-btn ${active ? 'active' : ''}`}
    >
      {children}
      <style jsx>{`
        .oh-tab-btn {
          all: unset;
          cursor: pointer;
          padding: 12px 16px;
          font-size: 13.5px;
          color: var(--ink-2);
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: color 0.15s;
        }
        .oh-tab-btn.active {
          color: var(--ink);
          border-bottom-color: var(--accent);
          font-weight: 500;
        }
        @media (max-width: 768px) {
          .oh-tab-btn { padding: 14px 12px; font-size: 14px; flex: 1; justify-content: center; }
        }
      `}</style>
    </button>
  );
}

function SummaryView({ summary, meetingType }) {
  if (!summary)
    return <div style={{ color: 'var(--ink-3)' }}>No summary available.</div>;

  const questions = getQuestionsForType(meetingType);
  const typeMeta = MEETING_TYPES.find((t) => t.value === meetingType);

  // Group visit questions by their `group` property; engagement is flat.
  const groups = [];
  {
    const byGroup = new Map();
    for (const q of questions) {
      const g = q.group || '__default__';
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(q);
    }
    for (const [name, items] of byGroup) {
      groups.push({ name: name === '__default__' ? null : name, items });
    }
  }

  function renderAnswer(q, val) {
    if (q.list && Array.isArray(val)) {
      if (val.length === 0) return <em style={{ color: 'var(--ink-3)' }}>None</em>;
      return (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {val.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    }
    if (q.sentiment) {
      return (
        <span
          className={`oh-pill ${val === 'hot' ? 'hot' : val === 'warm' ? 'warm' : 'cold'}`}
          style={{ fontSize: 13, padding: '4px 12px' }}
        >
          {val === 'hot' && <Flame size={12} />}
          {val === 'warm' && <TrendingUp size={12} />}
          {val === 'cold' && <Snowflake size={12} />}
          {val}
        </span>
      );
    }
    return String(val);
  }

  return (
    <div>
      {typeMeta && (
        <div className="oh-summary-type-tag">
          {typeMeta.label}
        </div>
      )}
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.name && <div className="oh-summary-group-head">{g.name}</div>}
          {g.items.map((q) => {
            const val = summary[q.key];
            if (val === undefined || val === null) return null;
            return (
              <div key={q.key} className="oh-qa-card">
                <div className="q">{q.label}</div>
                <div className="a">{renderAnswer(q, val)}</div>
              </div>
            );
          })}
        </div>
      ))}
      <style jsx>{`
        .oh-summary-type-tag {
          display: inline-block;
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-weight: 500;
          color: var(--ink-2);
          background: var(--paper-2);
          border: 1px solid var(--border);
          padding: 3px 10px;
          border-radius: 999px;
          margin-bottom: 14px;
        }
        .oh-summary-group-head {
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 600;
          color: var(--ink-3);
          margin: 18px 0 8px;
          padding-bottom: 4px;
          border-bottom: 1px dashed var(--border);
        }
        .oh-summary-group-head:first-of-type {
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}
