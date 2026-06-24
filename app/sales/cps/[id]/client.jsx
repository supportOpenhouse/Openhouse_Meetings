'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Pencil,
  Plus,
  Phone,
  Mail,
  MapPin,
  Users,
  Building2,
  Layers,
  X,
} from 'lucide-react';
import CpForm from '@/components/CpForm';
import { VisitRow } from '@/app/sales/client';
import { initials, BUSINESS_LABELS, VERIFICATION_LABELS } from '@/lib/salesFormat';

export default function SalesCpDetailClient({ cp, visits }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const handleSave = async (payload) => {
    const res = await fetch(`/api/sales/cps/${cp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `Could not save (${res.status})`);
    }
    setEditing(false);
    router.refresh();
  };

  const biz = (cp.primary_business || []).map((b) => BUSINESS_LABELS[b] || b);
  const societies = cp.societies || [];

  return (
    <div>
      <Link href="/sales/cps" className="sx-back">
        <ArrowLeft size={16} /> Partners
      </Link>

      <div className="sx-cp-head">
        <div className="avatar">{initials(cp.cp_name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="oh-h1" style={{ fontSize: 32, margin: 0 }}>
            {cp.cp_name}
          </h1>
          <div className="sx-cp-sub">
            <span className="code">{cp.cp_id}</span>
            {!cp.is_active && <span className="sx-pill not_interested">Inactive</span>}
          </div>
        </div>
      </div>

      {editing ? (
        <div style={{ marginTop: 18 }}>
          <div className="sx-edit-bar">
            <span>Editing partner</span>
            <button className="oh-btn ghost" onClick={() => setEditing(false)}>
              <X size={15} /> Cancel
            </button>
          </div>
          <CpForm initial={cp} submitLabel="Save changes" onSubmit={handleSave} />
        </div>
      ) : (
        <>
          <Link
            href={`/sales/visits/new?cp=${cp.id}`}
            className="oh-btn accent block"
            style={{ marginTop: 16 }}
          >
            <Plus size={16} /> Log a visit with this partner
          </Link>

          <div className="sx-info-grid">
            <InfoTile icon={<Phone size={15} />} label="Primary phone" value={cp.phone_primary} />
            {cp.phone_secondary && (
              <InfoTile icon={<Phone size={15} />} label="Secondary" value={cp.phone_secondary} />
            )}
            {cp.email && <InfoTile icon={<Mail size={15} />} label="Email" value={cp.email} />}
            {biz.length > 0 && (
              <InfoTile icon={<Building2 size={15} />} label="Business" value={biz.join(' · ')} />
            )}
            {cp.team_size != null && (
              <InfoTile icon={<Users size={15} />} label="Team size" value={String(cp.team_size)} />
            )}
            {cp.monthly_deal_volume != null && (
              <InfoTile
                icon={<Layers size={15} />}
                label="Deals / month"
                value={String(cp.monthly_deal_volume)}
              />
            )}
            {cp.office_verification_status && (
              <InfoTile
                icon={<Building2 size={15} />}
                label="Office"
                value={VERIFICATION_LABELS[cp.office_verification_status] || cp.office_verification_status}
              />
            )}
          </div>

          {cp.office_address && (
            <div className="sx-detail-card">
              <div className="sx-detail-label">
                <MapPin size={14} /> Office address
              </div>
              <div className="sx-detail-body">{cp.office_address}</div>
            </div>
          )}

          {(cp.other_platforms || []).length > 0 && (
            <div className="sx-detail-card">
              <div className="sx-detail-label">Other platforms</div>
              <div className="sx-chips" style={{ marginTop: 4 }}>
                {cp.other_platforms.map((p, i) => (
                  <span key={i} className="sx-chip" style={{ cursor: 'default' }}>
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {societies.length > 0 && (
            <div className="sx-detail-card">
              <div className="sx-detail-label">Societies covered</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                {societies.map((s, i) => (
                  <div key={i} className="sx-society-line">
                    <MapPin size={14} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 500 }}>{s.society_name}</span>
                    {s.micromarket && <span style={{ color: 'var(--ink-3)' }}>· {s.micromarket}</span>}
                    {s.is_primary && <span className="sx-pill first">Primary</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <section className="sx-section">
            <div className="sx-section-head">
              <h2>Visit history</h2>
              <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
                {visits.length} {visits.length === 1 ? 'visit' : 'visits'}
              </span>
            </div>
            {visits.length === 0 ? (
              <div className="sx-empty">
                <div className="ico">
                  <MapPin size={22} />
                </div>
                <div className="t">No visits yet</div>
                <div className="s">Log your first visit with this partner.</div>
              </div>
            ) : (
              <div className="sx-list">
                {visits.map((v) => (
                  <VisitRow key={v.id} v={v} />
                ))}
              </div>
            )}
          </section>
        </>
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
        .sx-cp-head {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-top: 12px;
        }
        .sx-cp-head .avatar {
          flex-shrink: 0;
          width: 56px;
          height: 56px;
          border-radius: 15px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-sans); font-weight: 700;
          font-size: 26px;
          color: var(--accent);
          background: var(--accent-soft);
        }
        .sx-cp-sub {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 4px;
        }
        .sx-cp-sub .code {
          font-family: var(--font-mono), monospace;
          font-size: 13px;
          color: var(--ink-2);
        }
        .sx-edit-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
          font-size: 13px;
          color: var(--ink-2);
        }
        .sx-info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          margin-top: 18px;
        }
        .sx-detail-card {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 13px;
          padding: 15px 16px;
          margin-top: 12px;
        }
        .sx-detail-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--ink-3);
          font-weight: 500;
          margin-bottom: 6px;
        }
        .sx-detail-body {
          font-size: 14px;
          color: var(--ink);
          line-height: 1.5;
        }
        .sx-society-line {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: var(--ink);
        }
      `}</style>
    </div>
  );
}

function InfoTile({ icon, label, value }) {
  return (
    <div className="sx-info-tile">
      <div className="ic">{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="lbl">{label}</div>
        <div className="val">{value}</div>
      </div>
      <style jsx>{`
        .sx-info-tile {
          display: flex;
          align-items: center;
          gap: 11px;
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 13px 14px;
        }
        .ic {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-soft);
          color: var(--accent);
        }
        .lbl {
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: 0.09em;
          color: var(--ink-3);
        }
        .val {
          font-size: 14px;
          color: var(--ink);
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </div>
  );
}
