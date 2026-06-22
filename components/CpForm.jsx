'use client';

import { useState } from 'react';
import { Plus, Trash2, MapPin, Loader2, Star } from 'lucide-react';

// Shared channel-partner form, used by both the register and edit screens.
// `initial` seeds the fields; `onSubmit(payload)` returns a promise and may
// throw an Error whose message is shown inline.
const BUSINESS = [
  { key: 'primary', label: 'Primary sales' },
  { key: 'resale', label: 'Resale' },
  { key: 'rental', label: 'Rentals' },
];
const VERIFICATION = [
  { key: 'visible_signage', label: 'Visible signage' },
  { key: 'no_signage', label: 'No signage' },
  { key: 'shared_office', label: 'Shared office' },
  { key: 'home_based', label: 'Home-based' },
];

function blankSociety() {
  return { society_name: '', micromarket: '', is_primary: false };
}

export default function CpForm({ initial = {}, submitLabel = 'Register partner', onSubmit }) {
  const [cpName, setCpName] = useState(initial.cp_name || '');
  const [phonePrimary, setPhonePrimary] = useState(initial.phone_primary || '');
  const [phoneSecondary, setPhoneSecondary] = useState(initial.phone_secondary || '');
  const [email, setEmail] = useState(initial.email || '');
  const [business, setBusiness] = useState(initial.primary_business || []);
  const [teamSize, setTeamSize] = useState(initial.team_size ?? '');
  const [dealVolume, setDealVolume] = useState(initial.monthly_deal_volume ?? '');
  const [platforms, setPlatforms] = useState((initial.other_platforms || []).join(', '));
  const [address, setAddress] = useState(initial.office_address || '');
  const [verification, setVerification] = useState(initial.office_verification_status || '');
  const [societies, setSocieties] = useState(
    initial.societies?.length ? initial.societies : [blankSociety()]
  );
  const [lat, setLat] = useState(initial.office_lat ?? null);
  const [lng, setLng] = useState(initial.office_lng ?? null);

  const [geoState, setGeoState] = useState('idle'); // idle | locating | done | error
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleBusiness = (k) =>
    setBusiness((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const setPrimarySociety = (idx) =>
    setSocieties((prev) => prev.map((s, i) => ({ ...s, is_primary: i === idx })));

  const updateSociety = (idx, field, val) =>
    setSocieties((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: val } : s)));

  const removeSociety = (idx) =>
    setSocieties((prev) => (prev.length === 1 ? [blankSociety()] : prev.filter((_, i) => i !== idx)));

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setGeoState('error');
      return;
    }
    setGeoState('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGeoState('done');
      },
      () => setGeoState('error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!cpName.trim()) return setError('Partner name is required.');
    if (!phonePrimary.trim()) return setError('Primary phone is required.');

    const payload = {
      cp_name: cpName.trim(),
      phone_primary: phonePrimary.trim(),
      phone_secondary: phoneSecondary.trim() || null,
      email: email.trim() || null,
      primary_business: business,
      team_size: teamSize === '' ? null : Number(teamSize),
      monthly_deal_volume: dealVolume === '' ? null : Number(dealVolume),
      other_platforms: platforms
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
      office_address: address.trim() || null,
      office_lat: lat,
      office_lng: lng,
      office_verification_status: verification || null,
      societies: societies
        .map((s) => ({
          society_name: s.society_name.trim(),
          micromarket: (s.micromarket || '').trim() || null,
          is_primary: !!s.is_primary,
        }))
        .filter((s) => s.society_name),
    };

    setSaving(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="sx-form">
      {error && (
        <div className="sx-form-error" role="alert">
          {error}
        </div>
      )}

      <div className="sx-card">
        <div className="sx-card-title">Basics</div>
        <div className="oh-field">
          <label>Partner name *</label>
          <input
            className="oh-input"
            value={cpName}
            onChange={(e) => setCpName(e.target.value)}
            placeholder="e.g. Sharma Realtors"
            autoFocus
          />
        </div>
        <div className="sx-grid-2">
          <div className="oh-field">
            <label>Primary phone *</label>
            <input
              className="oh-input"
              type="tel"
              inputMode="tel"
              value={phonePrimary}
              onChange={(e) => setPhonePrimary(e.target.value)}
              placeholder="98XXXXXXXX"
            />
          </div>
          <div className="oh-field">
            <label>Secondary phone</label>
            <input
              className="oh-input"
              type="tel"
              inputMode="tel"
              value={phoneSecondary}
              onChange={(e) => setPhoneSecondary(e.target.value)}
            />
          </div>
        </div>
        <div className="oh-field">
          <label>Email</label>
          <input
            className="oh-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="optional"
          />
        </div>
      </div>

      <div className="sx-card">
        <div className="sx-card-title">Business</div>
        <div className="oh-field">
          <label>Primary business</label>
          <div className="sx-chips">
            {BUSINESS.map((b) => (
              <button
                type="button"
                key={b.key}
                className={`sx-chip ${business.includes(b.key) ? 'on' : ''}`}
                onClick={() => toggleBusiness(b.key)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sx-grid-2">
          <div className="oh-field">
            <label>Team size</label>
            <input
              className="oh-input"
              type="number"
              inputMode="numeric"
              min="0"
              value={teamSize}
              onChange={(e) => setTeamSize(e.target.value)}
            />
          </div>
          <div className="oh-field">
            <label>Deals / month</label>
            <input
              className="oh-input"
              type="number"
              inputMode="numeric"
              min="0"
              value={dealVolume}
              onChange={(e) => setDealVolume(e.target.value)}
            />
          </div>
        </div>
        <div className="oh-field">
          <label>Other platforms used</label>
          <input
            className="oh-input"
            value={platforms}
            onChange={(e) => setPlatforms(e.target.value)}
            placeholder="e.g. 99acres, MagicBricks (comma-separated)"
          />
        </div>
      </div>

      <div className="sx-card">
        <div className="sx-card-title">Office</div>
        <div className="oh-field">
          <label>Address</label>
          <textarea
            className="oh-textarea"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Office address"
          />
        </div>
        <div className="oh-field">
          <label>Office verification</label>
          <div className="sx-chips">
            {VERIFICATION.map((v) => (
              <button
                type="button"
                key={v.key}
                className={`sx-chip ${verification === v.key ? 'on' : ''}`}
                onClick={() => setVerification(verification === v.key ? '' : v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="oh-btn ghost"
          onClick={captureLocation}
          disabled={geoState === 'locating'}
        >
          {geoState === 'locating' ? (
            <Loader2 size={15} className="oh-spin" />
          ) : (
            <MapPin size={15} />
          )}
          {geoState === 'done'
            ? 'Location captured'
            : geoState === 'error'
              ? 'Location unavailable — tap to retry'
              : geoState === 'locating'
                ? 'Locating…'
                : 'Capture office location'}
        </button>
        {geoState === 'done' && lat != null && (
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </div>
        )}
      </div>

      <div className="sx-card">
        <div className="sx-card-title">Societies covered</div>
        {societies.map((s, idx) => (
          <div className="sx-society-row" key={idx}>
            <div className="sx-grid-2" style={{ flex: 1 }}>
              <input
                className="oh-input"
                value={s.society_name}
                onChange={(e) => updateSociety(idx, 'society_name', e.target.value)}
                placeholder="Society name"
              />
              <input
                className="oh-input"
                value={s.micromarket || ''}
                onChange={(e) => updateSociety(idx, 'micromarket', e.target.value)}
                placeholder="Micromarket"
              />
            </div>
            <div className="sx-society-actions">
              <button
                type="button"
                className={`sx-star ${s.is_primary ? 'on' : ''}`}
                onClick={() => setPrimarySociety(idx)}
                title="Mark as primary"
                aria-label="Mark as primary society"
              >
                <Star size={16} fill={s.is_primary ? 'currentColor' : 'none'} />
              </button>
              <button
                type="button"
                className="sx-icon-btn"
                onClick={() => removeSociety(idx)}
                title="Remove"
                aria-label="Remove society"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="oh-btn ghost"
          onClick={() => setSocieties((prev) => [...prev, blankSociety()])}
        >
          <Plus size={15} /> Add society
        </button>
      </div>

      <button type="submit" className="oh-btn accent block" disabled={saving}>
        {saving ? <Loader2 size={16} className="oh-spin" /> : null}
        {saving ? 'Saving…' : submitLabel}
      </button>

      <style jsx>{`
        .sx-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-width: 640px;
        }
        .sx-form-error {
          background: var(--danger-soft);
          color: var(--danger);
          border-radius: 10px;
          padding: 12px 14px;
          font-size: 13.5px;
        }
        .sx-card {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .sx-card-title {
          font-family: var(--font-sans); font-weight: 700;
          font-size: 19px;
          letter-spacing: -0.01em;
          color: var(--ink);
        }
        .sx-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .sx-society-row {
          display: flex;
          gap: 10px;
          align-items: flex-start;
        }
        .sx-society-actions {
          display: flex;
          gap: 4px;
          padding-top: 2px;
        }
        .sx-star,
        .sx-icon-btn {
          all: unset;
          box-sizing: border-box;
          cursor: pointer;
          width: 38px;
          height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          color: var(--ink-3);
          border: 1px solid var(--border-strong);
          transition: all 0.13s;
        }
        .sx-star:hover,
        .sx-icon-btn:hover {
          color: var(--ink);
          border-color: var(--accent);
        }
        .sx-star.on {
          color: var(--amber-2);
          border-color: var(--amber);
          background: var(--amber-soft);
        }
        @media (max-width: 768px) {
          .sx-grid-2 {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </form>
  );
}
