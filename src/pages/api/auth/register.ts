import type { AstroCookies } from 'astro';
import { createSession, createUser, findUserByEmail, json, normalizeEmail } from '../../../lib/server-auth';

export async function POST({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const data = await request.json();
  const name = String(data.name ?? '').trim();
  const email = normalizeEmail(String(data.email ?? ''));
  const password = String(data.password ?? '');

  if (!name || !email || password.length < 8) {
    return json({ error: 'Name, email, and a password of at least 8 characters are required.' }, { status: 400 });
  }

  if (findUserByEmail(email)) {
    return json({ error: 'An account already exists for that email.' }, { status: 409 });
  }

  try {
    const user = createUser(name, email, password);
    createSession(cookies, user.id);
    return json({ user }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create account.';
    return json({ error: message }, { status: 500 });
  }
}
