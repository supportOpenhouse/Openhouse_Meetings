// Renders a small fixed badge ONLY when NEXT_PUBLIC_STAGING=1 (set in Vercel's
// Preview environment for the staging branch). Because staging shares the
// production database, the badge warns testers that what they do here writes to
// real data. pointer-events:none so it never blocks the UI. Env var is inlined
// at build time, so this is a plain (server) component — no JS shipped.
export default function StagingBanner() {
  if (process.env.NEXT_PUBLIC_STAGING !== '1') return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 'calc(8px + env(safe-area-inset-top))',
        right: 'calc(8px + env(safe-area-inset-right))',
        zIndex: 9999,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 100,
        background: '#F59E0B',
        color: '#3A2606',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        fontFamily: "var(--font-sans), system-ui, sans-serif",
        boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#3A2606',
          display: 'inline-block',
        }}
      />
      STAGING · live data
    </div>
  );
}
