import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';

// Server wrapper that hosts the persistent AppShell in a route-group layout.
// Auth + the sign-out action live here; the shell derives its nav, active item,
// and demand↔supply section from the pathname (client-side), so it stays mounted
// across navigation and only the page content reloads while data fetches.
export default async function AppShellLayout({ children }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  async function handleSignOut() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <AppShell
      user={{
        id: session.user.id,
        name: session.user.name || '',
        email: session.user.email,
        image: session.user.image || null,
        role: session.user.role,
      }}
      signOutAction={handleSignOut}
    >
      {children}
    </AppShell>
  );
}
