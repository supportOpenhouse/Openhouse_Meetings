import { signIn, auth } from '@/auth';
import { redirect } from 'next/navigation';

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

        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/' });
          }}
        >
          <button type="submit" className="oh-google-btn">
            <GoogleIcon />
            Continue with Google
          </button>
        </form>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
