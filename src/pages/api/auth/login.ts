import { findUserByEmail, verifyPassword, createSession, json } from '../../../lib/server-auth';
import type { AstroCookies } from 'astro';

export async function POST({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user || !user.passwordHash) {
    return json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  const isValid = verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  await createSession(cookies, user.id);
  return json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
}
