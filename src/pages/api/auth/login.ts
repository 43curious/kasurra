import type { AstroCookies } from 'astro';
import { createSession, findUserByEmail, json, normalizeEmail, verifyPassword } from '../../../lib/server-auth';

export async function POST({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const data = await request.json();
  const email = normalizeEmail(String(data.email ?? ''));
  const password = String(data.password ?? '');

  if (!email || !password) {
    return json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return json({ error: 'Email or password is incorrect.' }, { status: 401 });
  }

  createSession(cookies, user.id);
  return json({ user: { id: user.id, name: user.name, email: user.email } });
}
