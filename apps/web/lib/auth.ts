import crypto from 'node:crypto';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const SESSION_COOKIE = 'jobops_session';

type Session = {
  email: string;
};

function getAllowedEmails() {
  return (process.env.AUTH_ALLOWED_EMAILS ?? process.env.AUTH_ALLOWED_EMAILED ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function getSecret() {
  return process.env.SESSION_SECRET ?? 'dev-only-change-me';
}

function sign(payload: string) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

function encode(email: string) {
  const payload = Buffer.from(JSON.stringify({ email: email.toLowerCase() }), 'utf8').toString('base64url');
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function decode(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);

  if (signatureBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(signatureBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
    if (!parsed.email) return null;
    return { email: parsed.email.toLowerCase() };
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  return decode(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  return session;
}

export async function createSession(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const allowedEmails = getAllowedEmails();

  if (!allowedEmails.includes(normalizedEmail)) {
    throw new Error('That email is not allowed for this app.');
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encode(normalizedEmail), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
