import Link from 'next/link';
import { PropsWithChildren } from 'react';

const navItems = [
  { href: '/inbox', label: 'Inbox' },
  { href: '/shortlist', label: 'Shortlist' },
  { href: '/tailoring', label: 'Tailoring' },
  { href: '/applying', label: 'Applying' },
  { href: '/submit-review', label: 'Submit Review' },
  { href: '/activity', label: 'Activity' },
];

export function AppShell({ children, userEmail }: PropsWithChildren<{ userEmail: string }>) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Job Ops Console</p>
          <h2>Phase 1</h2>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Signed in</p>
            <strong>{userEmail}</strong>
          </div>
          <Link href="/logout" className="nav-link">
            Sign out
          </Link>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
