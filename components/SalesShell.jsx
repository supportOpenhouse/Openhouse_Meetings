import { signOut } from '@/auth';
import Link from 'next/link';
import { LayoutDashboard, Users, Plus, BarChart3, LogOut, MapPin, Search, ClipboardList, BookOpen } from 'lucide-react';
import Heartbeat from './Heartbeat';
import RecordingGuard from './RecordingGuard';
import Logo from './Logo';
import AnalyticsIdentify from './AnalyticsIdentify';
import MobileNav from './MobileNav';

// The field-sales experience lives entirely under /supply. This shell reuses the
// shared .oh-shell / .oh-side / .oh-mobile-* layout primitives but wraps them in
// .oh-sales, which remaps the CSS variables to the teal/amber palette — so the
// reused nav/cards pick up the new look without touching the demand/direct RM UI.
export default function SalesShell({ user, current, children }) {
  const isAdmin = user.role === 'admin';

  // `primary: true` → mobile bottom bar (Home, Partners, Live map); the central
  // FAB is New visit; the rest live in the Menu drawer. Desktop shows them all.
  const navItems = [
    { href: '/supply', key: 'home', label: 'Home', icon: LayoutDashboard, iconName: 'LayoutDashboard', primary: true },
    { href: '/supply/cps', key: 'cps', label: 'Partners', icon: Users, iconName: 'Users', primary: true },
    { href: '/supply/visits/new', key: 'new', label: 'New visit', icon: Plus, iconName: 'Plus' },
    { href: '/supply/map', key: 'map', label: 'Live map', icon: MapPin, iconName: 'MapPin', primary: true },
    { href: '/supply/performance', key: 'performance', label: 'Performance', icon: BarChart3, iconName: 'BarChart3' },
    { href: '/supply/search', key: 'search', label: 'Search', icon: Search, iconName: 'Search' },
    { href: '/supply/reports', key: 'reports', label: 'Reports', icon: ClipboardList, iconName: 'ClipboardList' },
    { href: '/supply/guide', key: 'guide', label: 'Guide', icon: BookOpen, iconName: 'BookOpen' },
  ];

  // Serializable copy (no icon component) for the client MobileNav.
  const mobileItems = navItems.map(({ icon, ...rest }) => rest);
  async function handleSignOut() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <div className="oh-sales">
      <div className="oh-shell">
        <Heartbeat />
        <RecordingGuard />
        <AnalyticsIdentify user={user} />

        {/* Desktop sidebar */}
        <aside className="oh-side">
          <div className="oh-brand">
            <Logo />
            <div
              style={{
                fontFamily: "var(--font-sans), sans-serif",
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--accent)',
                marginTop: 2,
                fontStyle: 'normal',
              }}
            >
              Supply
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
              <div className="role">{isAdmin ? 'Admin · Supply' : 'Supply RM'}</div>
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
              <Logo />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <UserAvatar user={user} size={32} />
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/login' });
                }}
                style={{ display: 'flex' }}
              >
                <button
                  type="submit"
                  className="oh-nav"
                  style={{ padding: 6, color: 'var(--ink-3)' }}
                  aria-label="Sign out"
                >
                  <LogOut size={16} />
                </button>
              </form>
            </div>
          </header>

          {children}
        </main>

        {/* Mobile bottom bar: primary CTAs + central FAB + Menu drawer */}
        <MobileNav
          items={mobileItems}
          current={current}
          user={{ name: user.name, email: user.email, image: user.image, role: user.role }}
          roleLabel={isAdmin ? 'Admin' : 'Supply'}
          signOutAction={handleSignOut}
          fab={{ href: '/supply/visits/new', label: 'New visit' }}
        />
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
