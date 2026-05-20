'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import Link from 'next/link';
import MeetingsTable from '@/components/MeetingsTable';
import MeetingDetail from '@/components/MeetingDetail';
import PendingUploads from '@/components/PendingUploads';
import Toast from '@/components/Toast';
import { usePollWhileProcessing } from '@/lib/usePollWhileProcessing';

export default function RMDashboardClient({ initialMeetings, user }) {
  const [meetings, setMeetings] = useState(initialMeetings);
  usePollWhileProcessing(meetings, setMeetings);
  const [openMeeting, setOpenMeeting] = useState(null);
  const [openMeetingDetail, setOpenMeetingDetail] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function openMeetingFull(m) {
    setOpenMeeting(m);
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
      <div className="oh-dashboard-header">
        <div>
          <div className="oh-eyebrow">Openhouse · {user.name}</div>
          <h1 className="oh-h1">
            My <em>meetings</em>
          </h1>
        </div>
        <Link
          href="/new-meeting"
          className="oh-btn accent oh-desktop-only"
        >
          <Mic size={15} /> Start new meeting
        </Link>
      </div>

      <div className="oh-stats-grid">
        <Stat label="Total meetings" value={meetings.length} />
        <Stat label="Today" value={todayCount} />
        <Stat label="This week" value={weekCount} />
        <Stat label="Total minutes" value={Math.round(totalMin)} />
      </div>

      <PendingUploads user={user} />

      <h2 className="oh-h2">All meetings</h2>
      <MeetingsTable
        meetings={meetings}
        showRMColumn={false}
        onOpen={openMeetingFull}
        hideDateFilter={true}
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

      <style jsx>{`
        .oh-dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          margin-bottom: 36px;
          flex-wrap: wrap;
        }
        .oh-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
          margin-bottom: 32px;
        }
        @media (max-width: 768px) {
          .oh-dashboard-header { margin-bottom: 24px; }
        }
      `}</style>
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
