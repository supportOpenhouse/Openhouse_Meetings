import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import SearchClient from './client';

export const dynamic = 'force-dynamic';

export default async function SalesSearchPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;
  if (role !== 'supply_rm' && role !== 'admin') {
    redirect(role === 'admin' ? '/admin' : '/dashboard');
  }

  return (
      <SearchClient
        user={{
          id: session.user.id,
          name: session.user.name || '',
          email: session.user.email,
          role,
        }}
      />
  );
}
