'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Users, ChevronRight } from 'lucide-react';
import MeetingsTable from '@/components/MeetingsTable';
import MeetingDetail from '@/components/MeetingDetail';
import Toast from '@/components/Toast';
import { fmtDate } from '@/lib/utils';

export default function AdminOverviewClient({ initialStats, initialMeetings, rms, cities = [] }) {
  const [stats] = useState(initialStats);
  const [meetings, setMeetings] = useState(initialMeetings);
  const [openMeeting, setOpenMeeting] = useState(null);
  const [openDetail, setOpenDetail] = useState(null);
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
      if (res.ok) setOpenDetail(data.meeting);
    } catch (e) {
      showToast('Could not load meeting', 'error');
    }
  }

  function handleExport(filters) {
    // Mirror the in-page filters into the CSV export so the downloaded file
    // matches what the admin currently sees on screen.
    const params = new URLSearchParams();
    if (filters.rmFilter && filters.rmFilter !== 'all') params.set('rm', filters.rmFilter);
    if (filters.cityFilter && filters.cityFilter !== 'all') params.set('city', filters.cityFilter);
    if (filters.search) params.set('search', filters.search);
    if (filters.since) params.set('start', filters.since);
    if (filters.until) {
      const u = new Date(filters.until);
      if (!isNaN(u)) {
        // Inclusive end-of-day, mirroring MeetingsTable's behavior.
        u.setHours(23, 59, 59, 999);
        params.set('end', u.toISOString());
      }
    }
    // Note: sentiment lives inside summary jsonb — we skip server-side filtering for it
    // to keep the query simple. The visible-on-screen filter still applies in the UI.

    const url = `/api/admin/export?${params.toString()}`;
    window.location.href = url;
  }

  async function handleDelete() {
    if (!openMeeting) return;
    if (!confirm('Delete this meeting? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/meetings/${openMeeting.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setMeetings(meetings.filter((m) => m.id !== openMeeting.id));
      setOpenMeeting(null);
      setOpenDetail(null);
      showToast('Meeting deleted', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

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
          <div className="oh-eyebrow">Openhouse · Admin</div>
          <h1 className="oh-h1">
            Team <em>overview</em>
          </h1>
        </div>
        <Link href="/admin/rms" className="oh-btn primary">
          <Users size={15} /> Manage RMs
        </Link>
      </div>

      {/* Time-window stats */}
      <h2 className="oh-h2">Activity windows</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 14,
          marginBottom: 40,
        }}
      >
        <Stat label="Today" value={stats.day.count} sub={`${stats.day.minutes} min`} />
        <Stat label="Last 7 days" value={stats.week.count} sub={`${stats.week.minutes} min`} />
        <Stat
          label="Last 30 days"
          value={stats.month.count}
          sub={`${stats.month.minutes} min`}
        />
        <Stat
          label="Last 90 days"
          value={stats.ninety.count}
          sub={`${stats.ninety.minutes} min`}
        />
        <Stat
          label="All time"
          value={stats.total.count}
          sub={`${stats.total.minutes} min`}
        />
      </div>

      {/* Per-RM cards */}
      {stats.per_rm.length > 0 && (
        <>
          <h2 className="oh-h2">Per RM</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 12,
              marginBottom: 40,
            }}
          >
            {stats.per_rm
              .sort((a, b) => new Date(b.last_meeting) - new Date(a.last_meeting))
              .map((r) => (
                <div key={r.rm_id} className="oh-rm-card">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="name">{r.rm_name || r.rm_email}</div>
                    <div className="email">
                      {r.last_meeting
                        ? `last: ${fmtDate(r.last_meeting)}`
                        : 'no meetings yet'}
                    </div>
                  </div>
                  <div className="stats">
                    <div>
                      <strong>{r.count}</strong>
                      meetings
                    </div>
                    <div>
                      <strong>{r.minutes}</strong>
                      min
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      <h2 className="oh-h2">All meetings</h2>
      <MeetingsTable
        meetings={meetings}
        rms={rms}
        cities={cities}
        onOpen={openMeetingFull}
        showRMColumn={true}
        onExport={handleExport}
      />

      {openMeeting && openDetail && (
        <MeetingDetail
          meeting={openDetail}
          onClose={() => {
            setOpenMeeting(null);
            setOpenDetail(null);
          }}
          onDelete={handleDelete}
          canDelete={true}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="oh-card oh-stat">
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
