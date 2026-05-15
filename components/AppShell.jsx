import { signOut } from '@/auth';
import Link from 'next/link';
import { LayoutDashboard, Plus, Users, LogOut } from 'lucide-react';

export default function AppShell({ user, current, children }) {
  const isAdmin = user.role === 'admin';

  const navItems = isAdmin
    ? [
        { href: '/admin', key: 'admin', label: 'Overview', icon: LayoutDashboard },
        { href: '/admin/rms', key: 'rms', label: 'Manage RMs', icon: Users },
      ]
    : [
        { href: '/dashboard', key: 'dashboard', label: 'My meetings', icon: LayoutDashboard },
        { href: '/new-meeting', key: 'new', label: 'New meeting', icon: Plus },
      ];

  return (
    <div className="oh-shell">
      {/* Desktop sidebar */}
      <aside className="oh-side">
        <div className="oh-brand">
          Open<span>house</span>
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
            <div className="role">{isAdmin ? 'Admin' : 'RM'}</div>
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
        background: 'var(--paper-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.4),
        color: 'var(--ink-2)',
        fontWeight: 500,
      }}
    >
      {(user.name || user.email || '?').charAt(0).toUpperCase()}
    </div>
  );
}
