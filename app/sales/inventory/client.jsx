'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Package,
  Building2,
  Ruler,
  IndianRupee,
  Compass,
  Layers,
  Sofa,
  X,
} from 'lucide-react';
import { fmtDate } from '@/lib/salesFormat';

const CONFIGURATIONS = ['1BHK', '2BHK', '3BHK', '4BHK', 'Villa', 'Plot'];
const FACINGS = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];
const FLAT_STATUS = [
  { v: 'vacant', l: 'Vacant' },
  { v: 'tenant', l: 'Tenant occupied' },
  { v: 'owner', l: 'Owner occupied' },
];
const FURNISHING = [
  { v: 'unfurnished', l: 'Unfurnished' },
  { v: 'semi', l: 'Semi-furnished' },
  { v: 'full', l: 'Fully furnished' },
];

const FLAT_STATUS_LABELS = { vacant: 'Vacant', tenant: 'Tenant', owner: 'Owner' };
const FURNISHING_LABELS = { unfurnished: 'Unfurnished', semi: 'Semi-furnished', full: 'Furnished' };

function fmtPrice(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2).replace(/\.00$/, '')} L`;
  return `₹${v.toLocaleString('en-IN')}`;
}

const emptyForm = {
  sales_cp_id: '',
  city: '',
  society_name: '',
  configuration: '',
  size_sqft: '',
  price: '',
  facing: '',
  flat_status: '',
  floor: '',
  unit_number: '',
  furnishing: '',
  comments: '',
  ok_to_visit: true,
};

export default function InventoryClient({ initial, cps }) {
  const [items, setItems] = useState(initial || []);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function openForm() {
    setForm(emptyForm);
    setError('');
    setOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.sales_cp_id) {
      setError('Pick a channel partner.');
      return;
    }
    if (!form.society_name.trim()) {
      setError('Society name is required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/sales/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Could not save inventory.');
        return;
      }
      setItems((prev) => [data.inventory, ...prev]);
      setOpen(false);
      setForm(emptyForm);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <h1 className="oh-h1">
            My <em>inventory</em>
          </h1>
          <p className="oh-sub" style={{ margin: 0 }}>
            Listings you’ve captured from your channel partners.
          </p>
        </div>
        {!open && (
          <button type="button" className="oh-btn accent" style={{ flexShrink: 0 }} onClick={openForm}>
            <Plus size={16} /> Add listing
          </button>
        )}
      </div>

      {open && (
        <section className="oh-card form-card" style={{ marginBottom: 22 }}>
          <div className="form-head">
            <h2>New listing</h2>
            <button type="button" className="oh-btn ghost" onClick={() => setOpen(false)}>
              <X size={15} /> Cancel
            </button>
          </div>
          <form onSubmit={submit}>
            <div className="grid">
              <div className="oh-field span-2">
                <label>Channel partner</label>
                <select className="oh-select" value={form.sales_cp_id} onChange={set('sales_cp_id')}>
                  <option value="">Select a partner…</option>
                  {cps.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.cp_name} · {cp.cp_id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="oh-field">
                <label>City</label>
                <input className="oh-input" value={form.city} onChange={set('city')} placeholder="e.g. Pune" />
              </div>
              <div className="oh-field">
                <label>Society name</label>
                <input
                  className="oh-input"
                  value={form.society_name}
                  onChange={set('society_name')}
                  placeholder="e.g. Green Acres"
                />
              </div>

              <div className="oh-field">
                <label>Configuration</label>
                <select className="oh-select" value={form.configuration} onChange={set('configuration')}>
                  <option value="">Select…</option>
                  {CONFIGURATIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="oh-field">
                <label>Size (sq ft)</label>
                <input
                  className="oh-input"
                  type="number"
                  inputMode="numeric"
                  value={form.size_sqft}
                  onChange={set('size_sqft')}
                  placeholder="e.g. 1150"
                />
              </div>

              <div className="oh-field">
                <label>Price (₹)</label>
                <input
                  className="oh-input"
                  type="number"
                  inputMode="numeric"
                  value={form.price}
                  onChange={set('price')}
                  placeholder="e.g. 8500000"
                />
              </div>
              <div className="oh-field">
                <label>Facing</label>
                <select className="oh-select" value={form.facing} onChange={set('facing')}>
                  <option value="">Select…</option>
                  {FACINGS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div className="oh-field">
                <label>Flat status</label>
                <select className="oh-select" value={form.flat_status} onChange={set('flat_status')}>
                  <option value="">Select…</option>
                  {FLAT_STATUS.map((s) => (
                    <option key={s.v} value={s.v}>
                      {s.l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="oh-field">
                <label>Furnishing</label>
                <select className="oh-select" value={form.furnishing} onChange={set('furnishing')}>
                  <option value="">Select…</option>
                  {FURNISHING.map((s) => (
                    <option key={s.v} value={s.v}>
                      {s.l}
                    </option>
                  ))}
                </select>
              </div>

              <div className="oh-field">
                <label>Floor</label>
                <input
                  className="oh-input"
                  type="number"
                  inputMode="numeric"
                  value={form.floor}
                  onChange={set('floor')}
                  placeholder="e.g. 7"
                />
              </div>
              <div className="oh-field">
                <label>Unit number</label>
                <input
                  className="oh-input"
                  value={form.unit_number}
                  onChange={set('unit_number')}
                  placeholder="e.g. B-704"
                />
              </div>

              <div className="oh-field span-2">
                <label>Comments</label>
                <textarea
                  className="oh-textarea"
                  rows={3}
                  value={form.comments}
                  onChange={set('comments')}
                  placeholder="Anything worth noting about this listing…"
                />
              </div>
            </div>

            <div className="sx-toggle" style={{ marginTop: 16 }}>
              <span className="sx-toggle-text">OK to visit</span>
              <button
                type="button"
                className={`sx-switch ${form.ok_to_visit ? 'on' : ''}`}
                aria-label="Toggle OK to visit"
                onClick={() => setForm((f) => ({ ...f, ok_to_visit: !f.ok_to_visit }))}
              />
            </div>

            {error && <div className="form-err">{error}</div>}

            <button type="submit" className="oh-btn amber block" style={{ marginTop: 16 }} disabled={saving}>
              {saving ? <span className="oh-spin" /> : <Plus size={16} />}
              {saving ? 'Saving…' : 'Save listing'}
            </button>
          </form>
        </section>
      )}

      {items.length === 0 ? (
        <div className="sx-empty">
          <div className="ico">
            <Package size={22} />
          </div>
          <div className="t">No inventory yet</div>
          <div className="s">Add a listing to start building your inventory.</div>
        </div>
      ) : (
        <div className="inv-grid">
          {items.map((it) => {
            const price = fmtPrice(it.price);
            return (
              <div key={it.id} className="oh-card inv-card">
                <div className="inv-head">
                  <div className="inv-society">
                    <Building2 size={15} />
                    <span>{it.society_name || 'Listing'}</span>
                  </div>
                  <span className={`sx-pill ${it.ok_to_visit ? 'onboarded' : 'not_interested'}`}>
                    {it.ok_to_visit ? 'OK to visit' : 'No visits'}
                  </span>
                </div>

                <div className="inv-config">
                  {it.configuration || '—'}
                  {price && <span className="inv-price">{price}</span>}
                </div>

                <div className="inv-attrs">
                  {it.size_sqft ? (
                    <span>
                      <Ruler size={12} /> {it.size_sqft} sq ft
                    </span>
                  ) : null}
                  {it.facing ? (
                    <span>
                      <Compass size={12} /> {it.facing}
                    </span>
                  ) : null}
                  {(it.floor != null || it.unit_number) ? (
                    <span>
                      <Layers size={12} />
                      {it.floor != null ? `Fl ${it.floor}` : ''}
                      {it.floor != null && it.unit_number ? ' · ' : ''}
                      {it.unit_number || ''}
                    </span>
                  ) : null}
                  {it.furnishing ? (
                    <span>
                      <Sofa size={12} /> {FURNISHING_LABELS[it.furnishing] || it.furnishing}
                    </span>
                  ) : null}
                  {it.flat_status ? (
                    <span>
                      <IndianRupee size={12} /> {FLAT_STATUS_LABELS[it.flat_status] || it.flat_status}
                    </span>
                  ) : null}
                </div>

                {it.comments && <p className="inv-comments">{it.comments}</p>}

                <div className="inv-foot">
                  <span className="code">{it.cp_code}</span>
                  <span>{it.cp_name}</span>
                  {it.city && <span>· {it.city}</span>}
                  <span className="inv-date">{fmtDate(it.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {items.length === 0 && !open && (
        <div style={{ marginTop: 14 }}>
          <Link href="/sales/cps" className="oh-btn ghost">
            Browse partners
          </Link>
        </div>
      )}

      <style jsx>{`
        .form-card {
          padding: 20px;
        }
        .form-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .form-head h2 {
          margin: 0;
          font-size: 17px;
          font-weight: 700;
          color: var(--ink);
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .span-2 {
          grid-column: 1 / -1;
        }
        .form-err {
          margin-top: 14px;
          padding: 10px 12px;
          border-radius: 10px;
          background: var(--danger-soft);
          color: var(--danger);
          font-size: 13px;
          font-weight: 500;
        }
        .inv-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 14px;
        }
        .inv-card {
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .inv-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .inv-society {
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 600;
          font-size: 14px;
          color: var(--ink);
        }
        .inv-society :global(svg) {
          color: var(--accent);
        }
        .inv-config {
          display: flex;
          align-items: baseline;
          gap: 10px;
          font-size: 22px;
          font-weight: 700;
          color: var(--ink);
          letter-spacing: -0.01em;
        }
        .inv-price {
          font-size: 14px;
          font-weight: 600;
          color: var(--accent);
        }
        .inv-attrs {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 14px;
        }
        .inv-attrs span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 12.5px;
          color: var(--ink-2);
        }
        .inv-attrs :global(svg) {
          color: var(--ink-3);
        }
        .inv-comments {
          margin: 0;
          font-size: 13px;
          line-height: 1.5;
          color: var(--ink-2);
          background: var(--paper-2);
          padding: 9px 11px;
          border-radius: 9px;
        }
        .inv-foot {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          color: var(--ink-3);
          padding-top: 4px;
          border-top: 1px solid var(--border);
        }
        .inv-foot .code {
          font-family: var(--font-mono, monospace);
          font-weight: 600;
          color: var(--ink-2);
        }
        .inv-date {
          margin-left: auto;
        }
        @media (max-width: 560px) {
          .grid {
            grid-template-columns: 1fr;
          }
          .span-2 {
            grid-column: 1;
          }
        }
      `}</style>
    </div>
  );
}
