import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import SalesShell from '@/components/SalesShell';
import GuideClient from './client';

export const dynamic = 'force-dynamic';

export default async function SalesGuidePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;
  if (role !== 'sales_rm' && role !== 'admin') {
    redirect(role === 'admin' ? '/admin' : '/dashboard');
  }

  return (
    <SalesShell user={session.user} current="guide">
      <GuideClient />
    </SalesShell>
  );
}
