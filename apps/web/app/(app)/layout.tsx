import { AppShell } from '../../components/app-shell';
import { requireSession } from '../../lib/auth';

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return <AppShell userEmail={session.email}>{children}</AppShell>;
}
