'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Check, UserPlus, MapPin, Plus } from 'lucide-react';
import { track } from '@/lib/track';

// Registers a new channel partner in Open House Core via our server proxy
// (/api/sales/cps POST → CP Meetings broker API). The API key + sales_manager_id
// + cp_code are handled server-side; this form only collects partner details.
export default function SalesCpNewClient() {
  const [configured, setConfigured] = useState(true);
  const [cities, setCities] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(true);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [company, setCompany] = useState('Individual');
  const [email, setEmail] = useState('');

  const [markets, setMarkets] = useState([]);
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [selected, setSelected] = useState([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  // Load cities once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/sales/cps/cities');
        const data = await res.json();
        if (cancelled) return;
        setConfigured(data?.configured !== false);
        setCities(data?.cities ?? []);
      } catch {
        if (!cancelled) setCities([]);
      } finally {
        if (!cancelled) setCitiesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load micro markets whenever the city changes.
  useEffect(() => {
    if (!city) {
      setMarkets([]);
      setSelected([]);
      return undefined;
    }
    let cancelled = false;
    setMarketsLoading(true);
    setSelected([]);
    (async () => {
      try {
        const res = await fetch(`/api/sales/cps/micro-markets?city=${encodeURIComponent(city)}`);
        const data = await res.json();
        if (!cancelled) setMarkets(data?.microMarkets ?? []);
      } catch {
        if (!cancelled) setMarkets([]);
      } finally {
        if (!cancelled) setMarketsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [city]);

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!fullName.trim()) return setError('Partner name is required.');
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) return setError('Enter a valid 10-digit phone number.');
    if (!city) return setError('Select a city.');
    if (!selected.length) return setError('Select at least one micro market.');

    setSaving(true);
    try {
      const res = await fetch('/api/sales/cps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone_number: digits,
          city,
          company_name: company.trim() || 'Individual',
          email: email.trim() || undefined,
          micro_markets: selected,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not register partner.');
      track('partner_registered', { cp_code: data?.cp_code, city });
      setDone({ cp_code: data?.cp_code, name: fullName.trim() });
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setDone(null);
    setFullName('');
    setPhone('');
    setCity('');
    setCompany('Individual');
    setEmail('');
    setSelected([]);
    setMarkets([]);
    setError('');
  }

  return (
    <div>
      {!done && (
        <Link href="/sales/cps" className="reg-back">
          <ArrowLeft size={16} /> Partners
        </Link>
      )}

      {!configured ? (
        <div className="sx-empty" style={{ marginTop: 22, padding: '40px 24px' }}>
          <div className="ico">
            <UserPlus size={22} />
          </div>
          <div className="t">Registration isn’t set up yet</div>
          <div className="s" style={{ maxWidth: 420, margin: '0 auto' }}>
            The partner-registration API key isn’t configured on the server. Search the existing
            partner inventory in the meantime.
          </div>
          <Link href="/sales/cps" className="oh-btn accent" style={{ marginTop: 14 }}>
            Browse partners
          </Link>
        </div>
      ) : done ? (
        <div className="sx-empty" style={{ marginTop: 22, padding: '40px 24px' }}>
          <div className="ico" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
            <Check size={24} />
          </div>
          <div className="t">Partner registered</div>
          <div className="s" style={{ maxWidth: 440, margin: '0 auto' }}>
            {done.name} is now in Open House as{' '}
            <span className="oh-mono" style={{ fontWeight: 700, color: 'var(--ink)' }}>
              {done.cp_code}
            </span>
            . They’ll appear in search once Core syncs them.
          </div>
          <div className="reg-actions">
            {done.cp_code && (
              <Link href={`/sales/cps/${encodeURIComponent(done.cp_code)}`} className="oh-btn accent">
                View partner
              </Link>
            )}
            <button type="button" className="oh-btn ghost" onClick={reset}>
              <Plus size={15} /> Register another
            </button>
            <Link href="/sales/cps" className="oh-btn ghost">
              Done
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div style={{ margin: '16px 0 20px' }}>
            <h1 className="oh-h1">
              Register a <em>partner</em>
            </h1>
            <p className="oh-sub" style={{ margin: 0 }}>
              Add a new channel partner to Open House.
            </p>
          </div>

          <form onSubmit={submit} className="reg-form">
            {error && (
              <div className="reg-error" role="alert">
                {error}
              </div>
            )}

            <div className="reg-card">
              <div className="reg-card-title">Partner details</div>
              <div className="oh-field">
                <label>Partner name *</label>
                <input
                  className="oh-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  autoFocus
                />
              </div>
              <div className="reg-grid-2">
                <div className="oh-field">
                  <label>Phone number *</label>
                  <input
                    className="oh-input"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="10-digit mobile"
                  />
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
              <div className="oh-field">
                <label>Company</label>
                <input
                  className="oh-input"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Individual"
                />
              </div>
            </div>

            <div className="reg-card">
              <div className="reg-card-title">Location</div>
              <div className="oh-field">
                <label>City *</label>
                <select
                  className="oh-select"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={citiesLoading}
                >
                  <option value="">{citiesLoading ? 'Loading…' : 'Select a city'}</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {city && (
                <div className="oh-field">
                  <label>
                    Micro markets *
                    {selected.length > 0 && (
                      <span style={{ color: 'var(--accent)' }}> · {selected.length} selected</span>
                    )}
                  </label>
                  {marketsLoading ? (
                    <div className="reg-hint">
                      <Loader2 size={15} className="oh-spin" /> Loading micro markets…
                    </div>
                  ) : markets.length === 0 ? (
                    <div className="reg-hint muted">No micro markets found for {city}.</div>
                  ) : (
                    <div className="reg-chips">
                      {markets.map((m) => (
                        <button
                          type="button"
                          key={m.id}
                          className={`reg-chip ${selected.includes(m.id) ? 'on' : ''}`}
                          onClick={() => toggle(m.id)}
                        >
                          <MapPin size={12} style={{ verticalAlign: '-2px', marginRight: 3 }} />
                          {m.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="oh-btn accent"
              disabled={saving}
              style={{ width: '100%', padding: 14, justifyContent: 'center' }}
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="oh-spin" /> Registering…
                </>
              ) : (
                <>
                  <UserPlus size={16} /> Register partner
                </>
              )}
            </button>
          </form>
        </>
      )}

      <style jsx>{`
        .reg-back {
          all: unset;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--accent);
          font-weight: 500;
        }
        .reg-actions {
          display: flex;
          gap: 10px;
          justify-content: center;
          margin-top: 18px;
          flex-wrap: wrap;
        }
        .reg-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .reg-card {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          box-shadow: var(--shadow-sm);
        }
        .reg-card-title {
          font-family: var(--font-sans);
          font-weight: 700;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--ink-3);
        }
        .reg-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .reg-error {
          background: var(--danger-soft);
          color: var(--danger);
          padding: 11px 14px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 500;
        }
        .reg-hint {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--ink-2);
          padding: 4px 0;
        }
        .reg-hint.muted {
          color: var(--ink-3);
        }
        .reg-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .reg-chip {
          all: unset;
          box-sizing: border-box;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          padding: 7px 12px;
          border-radius: 100px;
          border: 1px solid var(--border-strong);
          font-size: 13px;
          font-weight: 500;
          color: var(--ink-2);
          background: var(--paper);
        }
        .reg-chip.on {
          background: var(--accent-soft);
          border-color: var(--accent);
          color: var(--accent);
          font-weight: 600;
        }
        .reg-chip:active {
          transform: scale(0.97);
        }
        @media (max-width: 520px) {
          .reg-grid-2 {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
