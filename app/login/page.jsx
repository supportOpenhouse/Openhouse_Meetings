import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import LoginPanel from '@/components/LoginPanel';

export default async function LoginPage({ searchParams }) {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.role === 'admin' ? '/admin' : '/dashboard');
  }

  const params = await searchParams;
  const error = params?.error;

  let errorMsg = null;
  if (error === 'not_invited' || error === 'AccessDenied') {
    errorMsg = "This email isn't registered. Ask an admin to add you first.";
  } else if (error) {
    errorMsg = 'Sign-in failed. Please try again.';
  }

  return (
    <div className="oh-login-wrap">
      <div className="oh-login-card">
        <div className="oh-brand" style={{ marginBottom: 8 }}>
          Open<span>house</span>
        </div>
        <div className="oh-eyebrow">Internal · Meetings</div>
        <h1 className="oh-h1" style={{ fontSize: 32, marginBottom: 24 }}>
          Sign <em>in</em>
        </h1>
        <p style={{ color: 'var(--ink-2)', marginBottom: 28, fontSize: 13.5 }}>
          Use your Openhouse Google account. Only invited RMs and admins can access the
          system.
        </p>

        {errorMsg && (
          <div
            style={{
              background: 'var(--danger-soft)',
              color: 'var(--danger)',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 18,
            }}
          >
            {errorMsg}
          </div>
        )}

        <LoginPanel webClientId={process.env.GOOGLE_CLIENT_ID} />
      </div>
    </div>
  );
}
