'use client';

import { useState } from 'react';
import { LogIn, LogOut, Loader2 } from 'lucide-react';
import { track } from '@/lib/track';

// Big clock in / clock out control. Reads the device geolocation, POSTs to
// /api/supply/clock, and hands the new session (or null) back to the parent.
//   open === null  → "Clock in"  (green gradient)
//   open !== null  → "Clock out" (red gradient)
export default function CheckInButton({ open, onChanged }) {
  const [busy, setBusy] = useState(false);
  const isOpen = !!open;

  function getPosition() {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve({ lat: null, lng: null });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({ lat: null, lng: null }),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
      );
    });
  }

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      const { lat, lng } = await getPosition();
      const action = isOpen ? 'out' : 'in';
      const res = await fetch('/api/supply/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, lat, lng }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Clock action failed');
      track(action === 'in' ? 'clock_in' : 'clock_out', { has_location: lat != null });
      onChanged?.(data.session ?? null);
    } catch (e) {
      onChanged?.(open, e?.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`cib ${isOpen ? 'out' : 'in'}`}
      onClick={handleClick}
      disabled={busy}
      aria-busy={busy}
    >
      <span className="cib-ico">
        {busy ? (
          <Loader2 size={20} className="cib-spin" />
        ) : isOpen ? (
          <LogOut size={20} />
        ) : (
          <LogIn size={20} />
        )}
      </span>
      <span className="cib-txt">
        <span className="cib-lead">{isOpen ? 'Clock out' : 'Clock in'}</span>
        <span className="cib-sub">
          {busy
            ? 'Locating…'
            : isOpen
              ? 'End your shift & stop tracking'
              : 'Start your shift & live tracking'}
        </span>
      </span>

      <style jsx>{`
        .cib {
          all: unset;
          box-sizing: border-box;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 14px;
          width: 100%;
          padding: 15px 18px;
          border-radius: 16px;
          color: #fff;
          transition: transform 0.12s ease, box-shadow 0.18s ease, filter 0.18s ease;
        }
        .cib.in {
          background: linear-gradient(135deg, #2E9E6B 0%, #1B8A57 100%);
          box-shadow: 0 10px 26px rgba(27, 138, 87, 0.34);
        }
        .cib.out {
          background: linear-gradient(135deg, #D4453A 0%, #B4302A 100%);
          box-shadow: 0 10px 26px rgba(180, 48, 42, 0.32);
        }
        .cib:hover {
          filter: brightness(1.04);
          transform: translateY(-1px);
        }
        .cib:active {
          transform: scale(0.985);
        }
        .cib:disabled {
          cursor: progress;
          opacity: 0.92;
        }
        .cib-ico {
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          border-radius: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.18);
        }
        .cib-txt {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          text-align: left;
        }
        .cib-lead {
          font-family: var(--font-sans);
          font-weight: 700;
          font-size: 17px;
          line-height: 1.1;
        }
        .cib-sub {
          font-size: 12.5px;
          color: rgba(255, 255, 255, 0.82);
        }
        :global(.cib-spin) {
          animation: cib-rotate 0.9s linear infinite;
        }
        @keyframes cib-rotate {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </button>
  );
}
