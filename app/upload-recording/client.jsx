'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, Handshake } from 'lucide-react';
import CallUploader from '@/components/CallUploader';
import Toast from '@/components/Toast';

// RM "Upload recording" screen — upload phone call recordings (MP3). The phone
// number in each filename is matched to the CP inventory automatically. One
// meeting-type choice applies to the whole batch.
export default function UploadRecordingClient({ user }) {
  const router = useRouter();
  const [meetingType, setMeetingType] = useState('engagement');
  const [toast, setToast] = useState(null);

  function showToast(msg, type) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <div className="oh-page" style={{ maxWidth: 620 }}>
      <div className="oh-eyebrow">Openhouse · {user.name}</div>
      <h1 className="oh-h1">
        Upload <em>recording</em>
      </h1>
      <p className="oh-sub">
        Upload call recordings (MP3) from your phone. We read the phone number from each file
        name, match it to the CP, transcribe it, and generate a smart summary. Select multiple
        files at once — anything you uploaded before is skipped automatically.
      </p>

      <div className="oh-field" style={{ marginBottom: 18 }}>
        <label>Meeting type for this upload</label>
        <div className="oh-ur-types">
          <button
            type="button"
            className={`oh-ur-type ${meetingType === 'engagement' ? 'selected' : ''}`}
            onClick={() => setMeetingType('engagement')}
          >
            <Briefcase size={15} />
            <div>
              <div className="t">Engagement meeting</div>
              <div className="d">CP working-relationship call</div>
            </div>
          </button>
          <button
            type="button"
            className={`oh-ur-type ${meetingType === 'onboarding' ? 'selected' : ''}`}
            onClick={() => setMeetingType('onboarding')}
          >
            <Handshake size={15} />
            <div>
              <div className="t">CP onboarding pitch</div>
              <div className="d">Pitch to a prospective CP</div>
            </div>
          </button>
        </div>
        <div className="oh-ur-note">
          All files in this upload will be saved as{' '}
          <strong>{meetingType === 'onboarding' ? 'onboarding' : 'engagement'}</strong> meetings.
        </div>
      </div>

      <CallUploader
        user={user}
        uploadEndpoint="/api/rm/upload"
        getExtraBody={() => ({ meeting_type: meetingType })}
        onBatchDone={() => {
          showToast('Uploads finished — transcript + summary in the background', 'success');
          router.refresh();
        }}
      />

      <Toast toast={toast} />

      <style jsx>{`
        .oh-ur-types {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .oh-ur-type {
          all: unset;
          box-sizing: border-box;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border: 1.5px solid var(--border);
          border-radius: 10px;
          background: var(--paper);
          transition: all 0.15s;
        }
        .oh-ur-type:hover { border-color: var(--ink-2); }
        .oh-ur-type.selected {
          border-color: var(--accent);
          background: rgba(var(--accent-rgb), 0.04);
        }
        .oh-ur-type .t { font-size: 13.5px; font-weight: 500; color: var(--ink); }
        .oh-ur-type .d { font-size: 11.5px; color: var(--ink-2); margin-top: 1px; }
        .oh-ur-note { font-size: 12px; color: var(--ink-3); margin-top: 8px; }
        @media (max-width: 600px) {
          .oh-ur-types { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
