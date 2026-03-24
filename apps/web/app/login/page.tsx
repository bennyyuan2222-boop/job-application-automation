import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSession } from '../../lib/auth';
import { sameOriginUrlFromHeaders } from '../../lib/redirects';
import { loginAction } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (session) {
    redirect(await sameOriginUrlFromHeaders('/'));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const error = resolvedSearchParams?.error;

  return (
    <main className="login-shell">
      <div className="login-card">
        <p className="eyebrow">Job Ops Console</p>
        <h1>Sign in</h1>
        <p className="muted">
          Phase 1 uses a minimal email allowlist gate. Replace this later with full Auth.js magic-link auth.
        </p>

        {error ? (
          <p className="error-banner">
            {error === 'not-allowed'
              ? 'That email is not allowed for this app.'
              : 'Enter an allowed email address to continue.'}
          </p>
        ) : null}

        <form action={loginAction} className="stack-form">
          <label className="stack-field">
            <span>Email</span>
            <input name="email" type="email" placeholder="benny@example.com" required />
          </label>
          <button type="submit">Enter app</button>
        </form>

        <p className="muted tiny">
          Allowed emails come from <code>AUTH_ALLOWED_EMAILS</code>.
        </p>
        <Link href="/health" className="tiny linkish">
          Healthcheck
        </Link>
      </div>
    </main>
  );
}
