'use client';

// The supply (field-sales) shell. Client component so it derives the active nav
// from the pathname — which lets it live in app/supply/layout.jsx and PERSIST
// across navigation. Only the page content (children) swaps while data loads;
// the sidebar, top bar, and bottom nav stay put.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Plus, BarChart3, LogOut, MapPin, Search, ClipboardList, BookOpen,
} from 'lucide-react';
import Heartbeat from './Heartbeat';
import RecordingGuard from './RecordingGuard';
import Logo from './Logo';
import AnalyticsIdentify from './AnalyticsIdentify';
import MobileNav from './MobileNav';
import { isNavActive } from '@/lib/navActive';

const NAV = [
  { href: '/supply', key: 'home', label: 'Home', icon: LayoutDashboard, iconName: 'LayoutDashboard', primary: true },
  { href: '/supply/cps', key: 'cps', label: 'Partners', icon: Users, iconName: 'Users', primary: true },
  { href: '/supply/visits/new', key: 'new', label: 'New visit', icon: Plus, iconName: 'Plus' },
  { href: '/supply/map', key: 'map', label: 'Live map', icon: MapPin, iconName: 'MapPin', primary: true },
  { href: '/supply/performance', key: 'performance', label: 'Performance', icon: BarChart3, iconName: 'BarChart3' },
  { href: '/supply/search', key: 'search', label: 'Search', icon: Search, iconName: 'Search' },
  { href: '/supply/reports', key: 'reports', label: 'Reports', icon: ClipboardList, iconName: 'ClipboardList' },
  { href: '/supply/guide', key: 'guide', label: 'Guide', icon: BookOpen, iconName: 'BookOpen' },
];

export default function SalesShell({ user, signOutAction, children }) {
  const isAdmin = user.role === 'admin';
  const pathname = usePathname();
  const mobileItems = NAV.map(({ icon, ...rest }) => rest);

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
                fontFamily: 'var(--font-sans), sans-serif',
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

          {NAV.map((it) => {
            const Icon = it.icon;
            return (
              <Link
                key={it.key}
                href={it.href}
                className={`oh-nav ${isNavActive(it.href, pathname) ? 'active' : ''}`}
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
            <form action={signOutAction}>
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

        <main className="oh-main">{children}</main>

        <MobileNav
          items={mobileItems}
          user={{ name: user.name, email: user.email, image: user.image, role: user.role }}
          roleLabel={isAdmin ? 'Admin · Supply' : 'Supply'}
          signOutAction={signOutAction}
          fab={{ href: '/supply/visits/new', label: 'New visit' }}
        />
      </div>
    </div>
  );
}

function UserAvatar({ user, size = 28 }) {
  if (user.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
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
