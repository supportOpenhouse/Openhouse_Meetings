'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  useMap,
} from '@vis.gl/react-google-maps';
import { MapPin, Navigation, Radio, Users, KeyRound } from 'lucide-react';
import CheckInButton from '@/components/sales/CheckInButton';
import { fmtTime, initials } from '@/lib/salesFormat';

const GURGAON = { lat: 28.4595, lng: 77.0266 };

// One color per active rep (cycled). Teal + amber lead, then a spread that
// stays legible on the light map.
const PALETTE = [
  '#B5179E',
  '#F59E0B',
  '#2A5E8C',
  '#9E2A2F',
  '#3F5E36',
  '#7A3FA0',
  '#0E7C86',
  '#C2641A',
];

function colorFor(i) {
  return PALETTE[i % PALETTE.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// Route polyline — the lib doesn't ship a Polyline component, so we create a
// raw google.maps.Polyline via useMap() and clean it up on unmount / change.
// ─────────────────────────────────────────────────────────────────────────────
// Normalize to plain {lat, lng} numbers. DB ping rows carry extra fields
// (recorded_at) and occasionally a null coordinate (geolocation was denied) —
// feeding those to the Maps SDK throws "Cannot read 'setAt'" inside setPath.
// Filtering to finite lat/lng is the real fix.
function toLatLngs(path) {
  return (Array.isArray(path) ? path : [])
    .map((p) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

function RoutePolyline({ path, color }) {
  const map = useMap();
  const lineRef = useRef(null);

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return undefined;
    let line = null;
    try {
      // Construct WITHOUT a path, then set it through the guarded setPath below —
      // so neither construction nor update can ever throw into the page.
      line = new google.maps.Polyline({
        geodesic: true,
        strokeColor: color,
        strokeOpacity: 0.9,
        strokeWeight: 4,
        map,
      });
      line.setPath(toLatLngs(path));
    } catch {
      /* a trail that can't draw still leaves the markers — never crash the map */
    }
    lineRef.current = line;
    return () => {
      try {
        if (line) line.setMap(null);
      } catch {
        /* ignore */
      }
      lineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, color]);

  // Update the path in place when it grows (rep's live trail). Guarded — a bad
  // point or a torn-down line must never crash the map page.
  useEffect(() => {
    const line = lineRef.current;
    if (!line) return;
    try {
      line.setPath(toLatLngs(path));
    } catch {
      /* ignore — the next update will resync */
    }
  }, [path]);

  return null;
}

// A small circular marker wearing the rep's color + initials.
function RepMarker({ color, label, pulsing }) {
  return (
    <div className={`rep-pin ${pulsing ? 'live' : ''}`} style={{ background: color }}>
      {label}
      <style jsx>{`
        .rep-pin {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-family: var(--font-sans);
          font-weight: 700;
          font-size: 14px;
          border: 2.5px solid #fff;
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.28);
          transform: translateY(-2px);
        }
        .rep-pin.live::after {
          content: '';
          position: absolute;
          inset: -6px;
          border-radius: 50%;
          border: 2px solid currentColor;
          animation: rep-ping 1.8s ease-out infinite;
          opacity: 0;
        }
        @keyframes rep-ping {
          0% {
            transform: scale(0.7);
            opacity: 0.6;
          }
          100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// No-key placeholder
// ─────────────────────────────────────────────────────────────────────────────
function MapPlaceholder() {
  return (
    <div className="map-ph">
      <div className="ico">
        <KeyRound size={22} />
      </div>
      <div className="t">Live map not configured</div>
      <div className="s">
        Add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to enable the live map.
      </div>
      <style jsx>{`
        .map-ph {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 8px;
          padding: 40px 24px;
          background: var(--paper-2);
        }
        .ico {
          width: 52px;
          height: 52px;
          border-radius: 15px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-soft);
          color: var(--accent);
          margin-bottom: 4px;
        }
        .t {
          font-family: var(--font-sans);
          font-weight: 700;
          font-size: 17px;
          color: var(--ink);
        }
        .s {
          font-size: 13px;
          color: var(--ink-2);
          max-width: 320px;
        }
        code {
          font-family: var(--font-mono), monospace;
          font-size: 12px;
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 5px;
          padding: 1px 6px;
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main client
// ─────────────────────────────────────────────────────────────────────────────
export default function SalesMapClient({ initial, user, mapsKey }) {
  const isAdmin = user.role === 'admin';
  return isAdmin ? (
    <AdminMap initial={initial} mapsKey={mapsKey} />
  ) : (
    <RepMap initial={initial} mapsKey={mapsKey} />
  );
}

// ── Rep view ─────────────────────────────────────────────────────────────────
function RepMap({ initial, mapsKey }) {
  const [session, setSession] = useState(initial.session || null);
  const [route, setRoute] = useState(initial.route || []);
  const [me, setMe] = useState(null); // current device position
  const [toast, setToast] = useState('');
  const watchRef = useRef(null);
  const lastPostRef = useRef(0);
  const isOpen = !!session;

  const showToast = useCallback((msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 3200);
  }, []);

  // POST a ping (throttled by the caller) and append it to the live trail.
  const postPing = useCallback(async (lat, lng, accuracy) => {
    try {
      await fetch('/api/sales/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, accuracy }),
      });
    } catch {
      /* a dropped ping is non-fatal — the next one will catch up */
    }
    setRoute((prev) => [...prev, { lat, lng, recorded_at: new Date().toISOString() }]);
  }, []);

  // While clocked in, watch position: update the marker on every move and POST
  // a breadcrumb at most every ~30s.
  useEffect(() => {
    if (!isOpen || typeof navigator === 'undefined' || !navigator.geolocation) {
      return undefined;
    }
    lastPostRef.current = 0;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setMe({ lat, lng });
        const now = Date.now();
        if (now - lastPostRef.current >= 30000) {
          lastPostRef.current = now;
          postPing(lat, lng, accuracy);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    };
  }, [isOpen, postPing]);

  // Grab an initial fix on mount so the map can center on the rep.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }, []);

  const handleClockChanged = useCallback(
    (newSession, err) => {
      if (err) {
        showToast(err);
        return;
      }
      setSession(newSession);
      if (newSession) {
        // Clocked in — seed the trail with the current position.
        if (me) postPing(me.lat, me.lng, null);
        showToast('You are clocked in. Live tracking is on.');
      } else {
        showToast('Clocked out. Tracking stopped.');
      }
    },
    [me, postPing, showToast]
  );

  const center = me || (route.length ? route[route.length - 1] : GURGAON);

  return (
    <div className="map-page">
      <Header
        title={
          <>
            Live <em>map</em>
          </>
        }
        sub={
          isOpen
            ? 'You are on shift — your route is being tracked.'
            : 'Clock in to start tracking your visits for the day.'
        }
      />

      <div className="map-grid">
        <div className="map-card">
          {mapsKey ? (
            <APIProvider apiKey={mapsKey}>
              <GoogleMap
                mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'oh-sales-rep-map'}
                defaultCenter={center}
                defaultZoom={13}
                gestureHandling="greedy"
                disableDefaultUI={false}
                style={{ width: '100%', height: '100%' }}
              >
                <RoutePolyline path={route} color="#B5179E" />
                {me && (
                  <AdvancedMarker position={me}>
                    <RepMarker color="#B5179E" label="•" pulsing={isOpen} />
                  </AdvancedMarker>
                )}
              </GoogleMap>
            </APIProvider>
          ) : (
            <MapPlaceholder />
          )}
        </div>

        <div className="map-side">
          <CheckInButton open={session} onChanged={handleClockChanged} />

          <div className="side-card">
            <div className="side-row">
              <span className="side-ico">
                <Radio size={16} />
              </span>
              <div>
                <div className="side-k">Status</div>
                <div className="side-v">
                  {isOpen ? (
                    <span className="sx-pill onboarded">On shift</span>
                  ) : (
                    <span className="sx-pill neutral">Off shift</span>
                  )}
                </div>
              </div>
            </div>
            {isOpen && session?.clock_in_time && (
              <div className="side-row">
                <span className="side-ico">
                  <Navigation size={16} />
                </span>
                <div>
                  <div className="side-k">Clocked in at</div>
                  <div className="side-v">{fmtTime(session.clock_in_time)}</div>
                </div>
              </div>
            )}
            <div className="side-row">
              <span className="side-ico">
                <MapPin size={16} />
              </span>
              <div>
                <div className="side-k">Points today</div>
                <div className="side-v">{route.length}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && <div className="map-toast">{toast}</div>}
      <Styles />
    </div>
  );
}

// ── Admin view ───────────────────────────────────────────────────────────────
function AdminMap({ initial, mapsKey }) {
  const [reps, setReps] = useState(initial.reps || []);

  // Poll the team feed every 20s for fresh positions.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/sales/location?scope=team');
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setReps(data?.reps ?? []);
      } catch {
        /* keep last-known positions on a failed poll */
      }
    };
    const id = window.setInterval(tick, 20000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const colored = useMemo(
    () => reps.map((r, i) => ({ ...r, color: colorFor(i) })),
    [reps]
  );

  const activeCount = colored.filter((r) => r.is_clocked_in).length;

  return (
    <div className="map-page">
      <Header
        title={
          <>
            Team <em>live map</em>
          </>
        }
        sub="Real-time positions and routes for every rep in the field today."
        right={
          <div className="hdr-stat">
            <span className="dot" />
            {activeCount} active · {colored.length} on map
          </div>
        }
      />

      <div className="map-grid admin">
        <div className="map-card">
          {mapsKey ? (
            <APIProvider apiKey={mapsKey}>
              <GoogleMap
                mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'oh-sales-team-map'}
                defaultCenter={GURGAON}
                defaultZoom={12}
                gestureHandling="greedy"
                disableDefaultUI={false}
                style={{ width: '100%', height: '100%' }}
              >
                {colored.map((r) => (
                  <RoutePolyline key={`line-${r.id}`} path={r.route} color={r.color} />
                ))}
                {colored.map((r) =>
                  r.latest && r.latest.lat != null ? (
                    <AdvancedMarker key={`pin-${r.id}`} position={r.latest}>
                      <RepMarker
                        color={r.color}
                        label={initials(r.name || r.email)}
                        pulsing={r.is_clocked_in}
                      />
                    </AdvancedMarker>
                  ) : null
                )}
              </GoogleMap>
            </APIProvider>
          ) : (
            <MapPlaceholder />
          )}
        </div>

        <div className="rep-panel">
          <div className="panel-head">
            <Users size={15} />
            <span>Active reps</span>
          </div>
          {colored.length === 0 ? (
            <div className="sx-empty" style={{ borderRadius: 0, border: 'none' }}>
              <div className="ico">
                <MapPin size={20} />
              </div>
              <div className="t">No one in the field yet</div>
              <div className="s">Reps appear here once they clock in and start moving.</div>
            </div>
          ) : (
            <div className="panel-list">
              {colored.map((r) => (
                <div key={r.id} className="panel-row">
                  <span
                    className="swatch"
                    style={{ background: r.color }}
                    aria-hidden="true"
                  />
                  <div className="panel-body">
                    <div className="panel-name">{r.name || r.email}</div>
                    <div className="panel-meta">
                      {r.is_clocked_in ? (
                        <span className="live-dot-wrap">
                          <span className="live-dot" /> Live
                        </span>
                      ) : (
                        <span className="off">Off shift</span>
                      )}
                      {r.last_seen && <span>· seen {fmtTime(r.last_seen)}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Styles />
    </div>
  );
}

// ── Shared header ────────────────────────────────────────────────────────────
function Header({ title, sub, right }) {
  return (
    <div className="map-hdr">
      <div>
        <h1 className="oh-h1">{title}</h1>
        <p className="oh-sub" style={{ margin: 0 }}>
          {sub}
        </p>
      </div>
      {right}
      <style jsx>{`
        .map-hdr {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }
        :global(.map-hdr .hdr-stat) {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--ink);
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 8px 14px;
        }
        :global(.map-hdr .hdr-stat .dot) {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #2e9e6b;
          box-shadow: 0 0 0 0 rgba(46, 158, 107, 0.5);
          animation: hdr-pulse 1.8s ease-out infinite;
        }
        @keyframes hdr-pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(46, 158, 107, 0.5);
          }
          100% {
            box-shadow: 0 0 0 8px rgba(46, 158, 107, 0);
          }
        }
      `}</style>
    </div>
  );
}

// ── Page-scoped layout styles (must be an inline template literal) ───────────
function Styles() {
  return (
    <style jsx global>{`
      .map-page {
        position: relative;
      }
      .map-grid {
        display: grid;
        grid-template-columns: 1fr 320px;
        gap: 16px;
        align-items: stretch;
        height: calc(100vh - 190px);
        min-height: 520px;
      }
      .map-card {
        position: relative;
        overflow: hidden;
        border-radius: 18px;
        border: 1px solid var(--border);
        background: var(--paper-2);
        box-shadow: var(--shadow-lg);
        min-height: 300px;
      }
      .map-side {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .side-card {
        background: var(--paper);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 6px 16px;
      }
      .side-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 0;
        border-bottom: 1px solid var(--border);
      }
      .side-row:last-child {
        border-bottom: none;
      }
      .side-ico {
        flex-shrink: 0;
        width: 34px;
        height: 34px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--accent-soft);
        color: var(--accent);
      }
      .side-k {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--ink-3);
      }
      .side-v {
        font-size: 15px;
        font-weight: 600;
        color: var(--ink);
        margin-top: 2px;
      }
      .rep-panel {
        background: var(--paper);
        border: 1px solid var(--border);
        border-radius: 16px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .panel-head {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 14px 16px;
        font-family: var(--font-sans);
        font-weight: 700;
        font-size: 14px;
        color: var(--ink);
        border-bottom: 1px solid var(--border);
        background: var(--paper-2);
      }
      .panel-list {
        overflow-y: auto;
        flex: 1;
      }
      .panel-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border);
      }
      .panel-row:last-child {
        border-bottom: none;
      }
      .panel-row .swatch {
        flex-shrink: 0;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
      }
      .panel-body {
        min-width: 0;
        flex: 1;
      }
      .panel-name {
        font-size: 14px;
        font-weight: 500;
        color: var(--ink);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .panel-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--ink-3);
        margin-top: 2px;
      }
      .panel-meta .off {
        color: var(--ink-3);
      }
      .live-dot-wrap {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: var(--success);
        font-weight: 600;
      }
      .live-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #2e9e6b;
        box-shadow: 0 0 0 0 rgba(46, 158, 107, 0.5);
        animation: panel-pulse 1.8s ease-out infinite;
      }
      @keyframes panel-pulse {
        0% {
          box-shadow: 0 0 0 0 rgba(46, 158, 107, 0.5);
        }
        100% {
          box-shadow: 0 0 0 7px rgba(46, 158, 107, 0);
        }
      }
      .map-toast {
        position: fixed;
        left: 50%;
        bottom: 28px;
        transform: translateX(-50%);
        background: var(--ink);
        color: var(--paper);
        font-size: 13.5px;
        font-weight: 500;
        padding: 11px 18px;
        border-radius: 999px;
        box-shadow: var(--shadow-xl);
        z-index: 50;
        animation: toast-in 0.2s ease;
      }
      @keyframes toast-in {
        from {
          opacity: 0;
          transform: translate(-50%, 8px);
        }
        to {
          opacity: 1;
          transform: translate(-50%, 0);
        }
      }
      @media (max-width: 860px) {
        .map-grid {
          grid-template-columns: 1fr;
          height: auto;
        }
        .map-card {
          height: 60vh;
          min-height: 360px;
        }
      }
    `}</style>
  );
}
