import { signOut } from '@/auth';
import Link from 'next/link';
import { LayoutDashboard, Plus, Users, UserCog, LogOut, Building2, Activity, BarChart3, Upload, Cloud, Footprints, MapPin } from 'lucide-react';
import Heartbeat from './Heartbeat';
import RecordingGuard from './RecordingGuard';
import Logo from './Logo';
import AnalyticsIdentify from './AnalyticsIdentify';
import MobileNav from './MobileNav';

export default function AppShell({ user, current, section = 'demand', children }) {
  const isAdmin = user.role === 'admin';
  const isSupplyManager = user.role === 'supply_manager';
  const isDirectRm = user.role === 'direct_rm';
  // Supply oversight view: always for a supply_manager; for an admin only when
  // they've switched into it (section="supply", set by the /admin/supply pages).
  const inSupply = isSupplyManager || (isAdmin && section === 'supply');

  // Supply-side oversight (bird's-eye of all reps). Shown to supply_managers and
  // to admins who switch to Supply.
  const SUPPLY_NAV = [
    { href: '/admin/supply', key: 'supply', label: 'Overview', icon: LayoutDashboard, iconName: 'LayoutDashboard', primary: true },
    { href: '/admin/supply/visits', key: 'supply-visits', label: 'Visits', icon: Footprints, iconName: 'Footprints', primary: true },
    { href: '/admin/supply/reps', key: 'supply-reps', label: 'Reps', icon: Users, iconName: 'Users', primary: true },
    { href: '/admin/supply/map', key: 'supply-map', label: 'Live map', icon: MapPin, iconName: 'MapPin' },
    { href: '/admin/supply/performance', key: 'supply-performance', label: 'Performance', icon: BarChart3, iconName: 'BarChart3' },
    { href: '/admin/supply/cps', key: 'supply-cps', label: 'Partners', icon: Building2, iconName: 'Building2' },
  ];
  // Demand-side admin (the normal admin home + all its tools).
  const DEMAND_ADMIN_NAV = [
    { href: '/admin', key: 'admin', label: 'Overview', icon: LayoutDashboard, iconName: 'LayoutDashboard', primary: true },
    { href: '/admin/insights', key: 'insights', label: 'Insights', icon: BarChart3, iconName: 'BarChart3', primary: true },
    { href: '/dashboard/cp', key: 'cp', label: 'CP visits', icon: Building2, iconName: 'Building2', primary: true },
    { href: '/admin/cp-assignments', key: 'cp-assignments', label: 'CP assignments', icon: Users, iconName: 'Users' },
    { href: '/admin/rms', key: 'rms', label: 'Manage RMs', icon: UserCog, iconName: 'UserCog' },
    { href: '/admin/salestrail', key: 'salestrail', label: 'Call sync', icon: Cloud, iconName: 'Cloud' },
    { href: '/admin/logs', key: 'logs', label: 'Activity logs', icon: Activity, iconName: 'Activity' },
  ];

  let navItems;
  if (isAdmin || isSupplyManager) {
    navItems = inSupply ? SUPPLY_NAV : DEMAND_ADMIN_NAV;
  } else if (isDirectRm) {
    navItems = [
      { href: '/direct', key: 'direct', label: 'Recordings', icon: LayoutDashboard, iconName: 'LayoutDashboard', primary: true },
      { href: '/new-meeting', key: 'new', label: 'Start meeting', icon: Plus, iconName: 'Plus', primary: true },
    ];
  } else {
    navItems = [
      { href: '/dashboard', key: 'dashboard', label: 'My meetings', icon: LayoutDashboard, iconName: 'LayoutDashboard', primary: true },
      { href: '/dashboard/cp', key: 'cp', label: 'CP visits', icon: Building2, iconName: 'Building2', primary: true },
      { href: '/dashboard/insights', key: 'insights', label: 'Insights', icon: BarChart3, iconName: 'BarChart3' },
      { href: '/upload-recording', key: 'upload-recording', label: 'Upload recording', icon: Upload, iconName: 'Upload' },
      { href: '/new-meeting', key: 'new', label: 'New meeting', icon: Plus, iconName: 'Plus', primary: true },
    ];
  }

  // Serializable copy (no icon component) for the client MobileNav.
  const mobileItems = navItems.map(({ icon, ...rest }) => rest);
  const roleLabel = isAdmin
    ? inSupply ? 'Admin · Supply' : 'Admin'
    : isSupplyManager ? 'Supply Manager' : isDirectRm ? 'Direct RM' : 'RM';
  // Only admins can toggle demand ↔ supply (supply_manager is locked to supply).
  const sectionSwitch = isAdmin ? { inSupply } : null;
  async function handleSignOut() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    // V2: every role (admin, demand RM, direct RM) gets the full Field Connect
    // Pro teal/amber scope, so the whole app shares one design language.
    <div className="oh-shell oh-sales">
      <Heartbeat />
      <RecordingGuard />
      <AnalyticsIdentify user={user} />
      {/* Desktop sidebar */}
      <aside className="oh-side">
        <div className="oh-brand">
          <Logo />
        </div>

        {sectionSwitch && (
          <div className="oh-section-switch">
            <Link href="/admin" className={sectionSwitch.inSupply ? '' : 'on'}>
              Demand
            </Link>
            <Link href="/admin/supply" className={sectionSwitch.inSupply ? 'on' : ''}>
              Supply
            </Link>
          </div>
        )}

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
            <div className="role">{roleLabel}</div>
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

      <main className="oh-main">{children}</main>

      {/* Mobile bottom bar (3 CTAs) + slide-in drawer for everything else */}
      <MobileNav
        items={mobileItems}
        current={current}
        user={{ name: user.name, email: user.email, image: user.image, role: user.role }}
        roleLabel={roleLabel}
        signOutAction={handleSignOut}
        sectionSwitch={sectionSwitch}
      />
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
