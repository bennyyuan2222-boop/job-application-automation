import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="login-shell">
      <div className="login-card">
        <p className="eyebrow">Job Ops Console</p>
        <h1>Not found</h1>
        <p className="muted">That record or page does not exist in the Phase 1 scaffold.</p>
        <Link href="/" className="button-link">
          Back to app
        </Link>
      </div>
    </main>
  );
}
