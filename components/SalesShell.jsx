import { signOut } from '@/auth';
import Link from 'next/link';
import { LayoutDashboard, Users, Plus, BarChart3, LogOut } from 'lucide-react';
import Heartbeat from './Heartbeat';
import RecordingGuard from './RecordingGuard';

// The field-sales experience lives entirely under /sales. This shell reuses the
// shared .oh-shell / .oh-side / .oh-mobile-* layout primitives but wraps them in
// .oh-sales, which remaps the CSS variables to the teal/amber palette — so the
// reused nav/cards pick up the new look without touching the demand/direct RM UI.
export default function SalesShell({ user, current, children }) {
  const isAdmin = user.role === 'admin';

  const navItems = [
    { href: '/sales', key: 'home', label: 'Home', icon: LayoutDashboard },
    { href: '/sales/cps', key: 'cps', label: 'Partners', icon: Users },
    { href: '/sales/visits/new', key: 'new', label: 'New visit', icon: Plus },
    { href: '/sales/reports', key: 'reports', label: 'Reports', icon: BarChart3 },
  ];

  return (
    <div className="oh-sales">
      <div className="oh-shell">
        <Heartbeat />
        <RecordingGuard />

        {/* Desktop sidebar */}
        <aside className="oh-side">
          <div className="oh-brand">
            Open<span>house</span>
            <div
              style={{
                fontFamily: "'Geist', sans-serif",
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--accent)',
                marginTop: 2,
                fontStyle: 'normal',
              }}
            >
              Field Sales
            </div>
          </div>

          {navItems.map((it) => {
            const Icon = it.icon;
            return (
              <Link
                key={it.key}
                href={it.href}
                className={`oh-nav ${current === it.key ? 'active' : ''}`}
              >
                <Icon size={16} /> {it.label}
              </Link>
            );
          })}

          <div style={{ flex: 1 }} />

          <div className="oh-side-user">
            <UserAvatar user={user} size={28} />
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <div
                style={{
                  color: 'var(--ink)',
                  fontWeight: 500,
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.name || user.email}
              </div>
              <div className="role">{isAdmin ? 'Admin · Sales' : 'Sales RM'}</div>
            </div>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/login' });
              }}
            >
              <button
                type="submit"
                className="oh-nav"
                style={{ padding: 6, color: 'var(--ink-3)' }}
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            </form>
          </div>
        </aside>

        <main className="oh-main">
          {/* Mobile top bar */}
          <header className="oh-mobile-top">
            <div className="oh-brand">
              Open<span>house</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <UserAvatar user={user} size={32} />
            </div>
          </header>

          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav className="oh-mobile-bottom" aria-label="Primary">
          {navItems.map((it) => {
            const Icon = it.icon;
            return (
              <Link
                key={it.key}
                href={it.href}
                className={`item ${current === it.key ? 'active' : ''}`}
              >
                <Icon size={20} />
                <span>{it.label}</span>
              </Link>
            );
          })}
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/login' });
            }}
            style={{ display: 'contents' }}
          >
            <button type="submit" className="item signout" aria-label="Sign out">
              <LogOut size={20} />
              <span>Sign out</span>
            </button>
          </form>
        </nav>
      </div>
    </div>
  );
}

function UserAvatar({ user, size = 28 }) {
  if (user.image) {
    return (
      <img
        src={user.image}
        alt={user.name || user.email}
        style={{ width: size, height: size, borderRadius: '50%' }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--accent-soft)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.4),
        color: 'var(--accent)',
        fontWeight: 600,
      }}
    >
      {(user.name || user.email || '?').charAt(0).toUpperCase()}
    </div>
  );
}
