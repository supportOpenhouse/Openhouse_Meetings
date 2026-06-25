import AppShellLayout from '@/components/AppShellLayout';

export const dynamic = 'force-dynamic';

export default function Layout({ children }) {
  return <AppShellLayout>{children}</AppShellLayout>;
}
