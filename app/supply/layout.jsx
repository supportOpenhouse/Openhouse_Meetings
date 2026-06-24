import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';
import SalesShell from '@/components/SalesShell';

export const dynamic = 'force-dynamic';

// The shell lives here (not in each page), so it PERSISTS across navigation
// within /supply — only the page content swaps while data loads. Auth + the
// role gate also live here, so pages just fetch their data.
export default async function SupplyLayout({ children }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;
  if (role !== 'supply_rm' && role !== 'admin') {
    redirect(role === 'admin' ? '/admin' : '/dashboard');
  }

  async function handleSignOut() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <SalesShell
      user={{
        id: session.user.id,
        name: session.user.name || '',
        email: session.user.email,
        image: session.user.image || null,
        role,
      }}
      signOutAction={handleSignOut}
    >
      {children}
    </SalesShell>
  );
}
