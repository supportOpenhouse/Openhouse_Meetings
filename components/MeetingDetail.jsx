'use client';

import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { fmtDate, fmtDuration, buildSpeakerTurns } from '@/lib/utils';
import { DEFAULT_QUESTIONS } from './questions';

export default function MeetingDetail({ meeting, onClose, onDelete, canDelete }) {
  const [tab, setTab] = useState('summary');
  const turns = buildSpeakerTurns(meeting.transcript_words || []);
  const fallbackText = !turns.length ? meeting.transcript_text || '' : '';

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
              {meeting.rm_name || meeting.rm_email} · {fmtDate(meeting.started_at)}
            </div>
            <h2 className="oh-detail-title">
              CP <span className="oh-mono">{meeting.cp_code}</span>
            </h2>
            <div className="oh-detail-meta">
              {meeting.cp_name && <span><User size={12} /> {meeting.cp_name}</span>}
              <span><Phone size={12} /> {meeting.cp_mobile}</span>
              {meeting.cp_city && <span><MapPin size={12} /> {meeting.cp_city}</span>}
              <span><Clock size={12} /> {fmtDuration(meeting.duration_seconds)}</span>
              {meeting.language && <span>· {meeting.language}</span>}
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
          {meeting.purpose && (
            <div className="oh-purpose">
              <strong>Purpose:</strong> {meeting.purpose}
            </div>
          )}

          {meeting.audio_url && (
            <div style={{ marginBottom: 24 }}>
              <div className="oh-eyebrow" style={{ marginBottom: 8 }}>
                <Volume2 size={11} style={{ display: 'inline', marginRight: 4 }} />
                Recording
              </div>
              <audio controls src={meeting.audio_url} style={{ width: '100%' }} />
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

          {tab === 'summary' && <SummaryView summary={meeting.summary} />}
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

function SummaryView({ summary }) {
  if (!summary)
    return <div style={{ color: 'var(--ink-3)' }}>No summary available.</div>;

  return (
    <div>
      {DEFAULT_QUESTIONS.map((q) => {
        const val = summary[q.key];
        if (val === undefined || val === null) return null;
        return (
          <div key={q.key} className="oh-qa-card">
            <div className="q">{q.label}</div>
            <div className="a">
              {q.list && Array.isArray(val) ? (
                val.length === 0 ? (
                  <em style={{ color: 'var(--ink-3)' }}>None</em>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {val.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                )
              ) : q.sentiment ? (
                <span
                  className={`oh-pill ${
                    val === 'hot' ? 'hot' : val === 'warm' ? 'warm' : 'cold'
                  }`}
                  style={{ fontSize: 13, padding: '4px 12px' }}
                >
                  {val === 'hot' && <Flame size={12} />}
                  {val === 'warm' && <TrendingUp size={12} />}
                  {val === 'cold' && <Snowflake size={12} />}
                  {val}
                </span>
              ) : (
                String(val)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
