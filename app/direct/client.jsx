'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, Upload } from 'lucide-react';
import MeetingsTable from '@/components/MeetingsTable';
import MeetingDetail from '@/components/MeetingDetail';
import CallUploader from '@/components/CallUploader';
import Toast from '@/components/Toast';
import { usePollWhileProcessing } from '@/lib/usePollWhileProcessing';

export default function DirectClient({ initialMeetings, user }) {
  const router = useRouter();
  const [tab, setTab] = useState('recordings');
  const [meetings, setMeetings] = useState(initialMeetings);
  usePollWhileProcessing(meetings, setMeetings);

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
    } catch {
      showToast('Could not load recording', 'error');
    }
  }

  return (
    <div>
      <div className="oh-eyebrow">Openhouse · {user.name}</div>
      <h1 className="oh-h1">
        Call <em>recordings</em>
      </h1>

      <div className="oh-direct-tabs">
        <button
          className={`oh-direct-tab ${tab === 'recordings' ? 'active' : ''}`}
          onClick={() => setTab('recordings')}
        >
          <LayoutDashboard size={14} /> My recordings
        </button>
        <button
          className={`oh-direct-tab ${tab === 'upload' ? 'active' : ''}`}
          onClick={() => setTab('upload')}
        >
          <Upload size={14} /> Upload recordings
        </button>
      </div>

      {tab === 'recordings' && (
        <MeetingsTable
          meetings={meetings}
          showRMColumn={false}
          onOpen={openMeetingFull}
          hideDateFilter={true}
          emptyAction={
            <button
              className="oh-btn primary"
              style={{ marginTop: 16 }}
              onClick={() => setTab('upload')}
            >
              <Upload size={14} /> Upload your first recording
            </button>
          }
        />
      )}

      {tab === 'upload' && (
        <div>
          <p className="oh-sub" style={{ marginTop: 4 }}>
            Pick the call recordings (MP3) from your phone. We read the phone number from each
            file name and generate a transcript. You can select multiple files at once — files
            you already uploaded are skipped automatically.
          </p>
          <CallUploader
            user={user}
            uploadEndpoint="/api/direct/upload"
            onBatchDone={() => {
              showToast('Uploads finished — transcribing in the background', 'success');
              router.refresh();
            }}
          />
        </div>
      )}

      {openMeeting && openDetail && (
        <MeetingDetail
          meeting={openDetail}
          onClose={() => {
            setOpenMeeting(null);
            setOpenDetail(null);
          }}
          onDelete={() => {}}
          canDelete={false}
        />
      )}

      <Toast toast={toast} />

      <style jsx>{`
        .oh-direct-tabs {
          display: flex;
          gap: 4px;
          border-bottom: 1px solid var(--border);
          margin: 16px 0 20px;
        }
        .oh-direct-tab {
          all: unset;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          font-size: 13.5px;
          color: var(--ink-2);
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
        }
        .oh-direct-tab.active {
          color: var(--ink);
          border-bottom-color: var(--accent);
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
