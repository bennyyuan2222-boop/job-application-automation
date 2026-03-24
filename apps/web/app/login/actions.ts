'use server';

import { redirect } from 'next/navigation';

import { createSession } from '../../lib/auth';

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();

  if (!email) {
    redirect('/login?error=missing-email');
  }

  try {
    await createSession(email);
  } catch {
    redirect('/login?error=not-allowed');
  }

  redirect('/');
}
