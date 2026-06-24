import AppSkeleton from '@/components/AppSkeleton';

// Covers /admin and every nested admin route (insights, salestrail, rms, …) that
// doesn't define its own loading boundary.
export default function AdminLoading() {
  return <AppSkeleton />;
}
