import { signOut } from '@/auth';
import Link from 'next/link';
import { LayoutDashboard, Plus, Users, LogOut, Mic } from 'lucide-react';

export default function AppShell({ user, current, children }) {
  const isAdmin = user.role === 'admin';
  return (
    <div className="oh-shell">
      <aside className="oh-side">
        <div className="oh-brand">
          Open<span>house</span>
        </div>

        {isAdmin ? (
          <>
            <Link href="/admin" className={`oh-nav ${current === 'admin' ? 'active' : ''}`}>
              <LayoutDashboard size={16} /> Overview
            </Link>
            <Link href="/admin/rms" className={`oh-nav ${current === 'rms' ? 'active' : ''}`}>
              <Users size={16} /> Manage RMs
            </Link>
          </>
        ) : (
          <>
            <Link
              href="/dashboard"
              className={`oh-nav ${current === 'dashboard' ? 'active' : ''}`}
            >
              <LayoutDashboard size={16} /> My meetings
            </Link>
            <Link
              href="/new-meeting"
              className={`oh-nav ${current === 'new' ? 'active' : ''}`}
            >
              <Plus size={16} /> New meeting
            </Link>
          </>
        )}

        <div style={{ flex: 1 }} />

        <div className="oh-side-user">
          {user.image ? (
            <img src={user.image} alt={user.name || user.email} />
          ) : (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--paper-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
              }}
            >
              {(user.name || user.email || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={{ color: 'var(--ink)', fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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

      <main className="oh-main">{children}</main>
    </div>
  );
}
