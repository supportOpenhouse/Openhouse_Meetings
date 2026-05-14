'use client';

import { useState } from 'react';
import { Mic } from 'lucide-react';
import Link from 'next/link';
import MeetingsTable from '@/components/MeetingsTable';
import MeetingDetail from '@/components/MeetingDetail';
import Toast from '@/components/Toast';

export default function RMDashboardClient({ initialMeetings, user }) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [openMeeting, setOpenMeeting] = useState(null);
  const [openMeetingDetail, setOpenMeetingDetail] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function openMeetingFull(m) {
    setOpenMeeting(m);
    // fetch full record (transcript_words is heavy, kept out of list)
    try {
      const res = await fetch(`/api/meetings/${m.id}`);
      const data = await res.json();
      if (res.ok) setOpenMeetingDetail(data.meeting);
    } catch (e) {
      showToast('Could not load meeting', 'error');
    }
  }

  async function handleDelete() {
    if (!openMeeting) return;
    if (!confirm('Delete this meeting? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/meetings/${openMeeting.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setMeetings(meetings.filter((m) => m.id !== openMeeting.id));
      setOpenMeeting(null);
      setOpenMeetingDetail(null);
      showToast('Meeting deleted', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  const totalMin =
    meetings.reduce((sum, m) => sum + (m.duration_seconds || 0), 0) / 60;
  const todayCount = meetings.filter((m) => {
    const d = new Date(m.started_at);
    return d.toDateString() === new Date().toDateString();
  }).length;
  const weekCount = meetings.filter((m) => {
    const d = new Date(m.started_at);
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    return d >= weekAgo;
  }).length;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 36,
        }}
      >
        <div>
          <div className="oh-eyebrow">Openhouse · {user.name}</div>
          <h1 className="oh-h1">
            My <em>meetings</em>
          </h1>
        </div>
        <Link href="/new-meeting" className="oh-btn accent">
          <Mic size={15} /> Start new meeting
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
          marginBottom: 40,
        }}
      >
        <Stat label="Total meetings" value={meetings.length} />
        <Stat label="Today" value={todayCount} />
        <Stat label="This week" value={weekCount} />
        <Stat label="Total minutes" value={Math.round(totalMin)} />
      </div>

      <h2 className="oh-h2">All meetings</h2>
      <MeetingsTable
        meetings={meetings}
        showRMColumn={false}
        onOpen={openMeetingFull}
        emptyAction={
          <Link href="/new-meeting" className="oh-btn primary" style={{ marginTop: 16 }}>
            <Mic size={14} /> Start your first meeting
          </Link>
        }
      />

      {openMeeting && openMeetingDetail && (
        <MeetingDetail
          meeting={openMeetingDetail}
          onClose={() => {
            setOpenMeeting(null);
            setOpenMeetingDetail(null);
          }}
          onDelete={handleDelete}
          canDelete={true}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="oh-card oh-stat">
      <div className="l">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}
