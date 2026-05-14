'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import { fmtDate, fmtDuration, buildSpeakerTurns } from '@/lib/utils';
import { DEFAULT_QUESTIONS } from './questions';

export default function MeetingDetail({ meeting, onClose, onDelete, canDelete }) {
  const [tab, setTab] = useState('summary');
  const turns = buildSpeakerTurns(meeting.transcript_words || []);
  const fallbackText = !turns.length ? meeting.transcript_text || '' : '';

  return (
    <div className="oh-modal-bg" onClick={onClose}>
      <div className="oh-modal" onClick={(e) => e.stopPropagation()}>
        <div className="oh-modal-header">
          <div>
            <div className="oh-eyebrow">
              {meeting.rm_name || meeting.rm_email} · {fmtDate(meeting.started_at)}
            </div>
            <h2
              className="oh-serif"
              style={{ fontSize: 28, margin: '4px 0 6px', letterSpacing: '-0.01em' }}
            >
              CP <span className="oh-mono" style={{ fontSize: 22 }}>{meeting.cp_code}</span>
            </h2>
            <div style={{ display: 'flex', gap: 18, fontSize: 13, color: 'var(--ink-2)' }}>
              <span>
                <Phone size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
                {meeting.cp_mobile}
              </span>
              <span>
                <Clock size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
                {fmtDuration(meeting.duration_seconds)}
              </span>
              {meeting.language && <span>· {meeting.language}</span>}
            </div>
          </div>
          <button className="oh-btn ghost" style={{ padding: 8 }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="oh-modal-body">
          {meeting.purpose && (
            <div
              style={{
                background: 'var(--paper-2)',
                padding: '12px 14px',
                borderRadius: 8,
                marginBottom: 20,
                fontSize: 13.5,
                color: 'var(--ink-2)',
              }}
            >
              <strong style={{ color: 'var(--ink)' }}>Purpose:</strong> {meeting.purpose}
            </div>
          )}

          {meeting.audio_url && (
            <div style={{ marginBottom: 24 }}>
              <div className="oh-eyebrow" style={{ marginBottom: 8 }}>
                <Volume2
                  size={11}
                  style={{ display: 'inline', marginRight: 4 }}
                />
                Recording
              </div>
              <audio controls src={meeting.audio_url} style={{ width: '100%' }} />
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 4,
              marginBottom: 18,
              borderBottom: '1px solid var(--border)',
            }}
          >
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
                    className={`oh-speaker s${
                      parseInt(t.speaker.replace(/\D/g, '')) % 3
                    }`}
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
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="oh-btn danger" onClick={onDelete}>
                  <Trash2 size={13} /> Delete meeting
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        padding: '10px 16px',
        fontSize: 13.5,
        color: active ? 'var(--ink)' : 'var(--ink-2)',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        marginBottom: -1,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontWeight: active ? 500 : 400,
      }}
    >
      {children}
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
