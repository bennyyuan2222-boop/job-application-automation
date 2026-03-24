'use server';

import { redirect } from 'next/navigation';

import { createSession } from '../../lib/auth';
import { sameOriginUrlFromHeaders } from '../../lib/redirects';

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();

  if (!email) {
    redirect(await sameOriginUrlFromHeaders('/login?error=missing-email'));
  }

  try {
    await createSession(email);
  } catch {
    redirect(await sameOriginUrlFromHeaders('/login?error=not-allowed'));
  }

  redirect(await sameOriginUrlFromHeaders('/'));
}
