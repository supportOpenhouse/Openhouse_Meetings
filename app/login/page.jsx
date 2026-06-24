import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { Mic, Sparkles, MapPin } from 'lucide-react';
import LoginPanel from '@/components/LoginPanel';
import Logo from '@/components/Logo';

// Where each role lands after sign-in. Mirrors middleware's homeFor() so the
// post-login hop is direct (no bounce through /dashboard for supply reps).
function homeFor(role) {
  if (role === 'admin') return '/admin';
  if (role === 'supply_manager') return '/admin/supply';
  if (role === 'supply_rm') return '/supply';
  return '/dashboard';
}

export default async function LoginPage({ searchParams }) {
  const session = await auth();
  if (session?.user) {
    redirect(homeFor(session.user.role));
  }

  const params = await searchParams;
  const error = params?.error;

  let errorMsg = null;
  if (error === 'not_invited' || error === 'AccessDenied') {
    errorMsg = "This email isn't registered yet. Ask an admin to add you, then try again.";
  } else if (error) {
    errorMsg = 'Sign-in failed. Please try again.';
  }

  return (
    // oh-sales scopes the page to the Instagram-sunset palette so the form and
    // brand panel share the same identity as the rest of the app.
    <div className="oh-auth oh-sales">
      {/* Brand panel (desktop) */}
      <aside className="oh-auth-brand">
        <div className="wordmark">
          <Logo />
        </div>

        <div>
          <h2>Field intelligence for every meeting.</h2>
          <p className="lede">
            Record CP meetings and site visits, get instant transcripts and AI summaries, and keep
            the whole field team moving in sync.
          </p>
        </div>

        <div className="oh-auth-features">
          <div className="oh-auth-feature">
            <span className="ic">
              <Mic size={18} />
            </span>
            Record &amp; auto-transcribe in any language
          </div>
          <div className="oh-auth-feature">
            <span className="ic">
              <Sparkles size={18} />
            </span>
            AI summaries the moment you finish
          </div>
          <div className="oh-auth-feature">
            <span className="ic">
              <MapPin size={18} />
            </span>
            Channel-partner registry &amp; field-visit tracking
          </div>
        </div>

        <div className="oh-auth-foot">Internal tool · Openhouse</div>
      </aside>

      {/* Sign-in panel */}
      <main className="oh-auth-side">
        <div className="oh-auth-form">
          <div className="wm">
            <Logo />
          </div>

          <div className="eyebrow">Internal access</div>
          <h1>
            Welcome <em>back</em>
          </h1>
          <p className="sub">
            Sign in with your Openhouse Google account. Access is invite-only — for admins, RMs, and
            supply.
          </p>

          {errorMsg && (
            <div className="oh-auth-error" role="alert">
              {errorMsg}
            </div>
          )}

          <LoginPanel webClientId={process.env.GOOGLE_CLIENT_ID} />

          <p className="oh-auth-fineprint">
            Trouble signing in? Confirm your Openhouse email has been added by an admin.
          </p>
        </div>
      </main>
    </div>
  );
}
