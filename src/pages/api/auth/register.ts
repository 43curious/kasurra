import { createUser, findUserByEmail, createSession, json } from '../../../lib/server-auth';
import type { AstroCookies } from 'astro';
import db from '../../../lib/db';

export async function POST({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { name, email, password } = await request.json();

  if (!name || !email || !password) {
    return json({ error: 'Name, email, and password are required.' }, { status: 400 });
  }

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    return json({ error: 'User already exists with this email.' }, { status: 400 });
  }

  // Check if this is the first user
  const userCountRes = await db.execute('SELECT count(*) as count FROM users');
  const userCount = Number(userCountRes.rows[0].count);
  const role = userCount === 0 ? 'admin' : 'user';

  try {
    const user = await createUser(name, email, password, role);
    await createSession(cookies, user.id);
    return json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
  } catch (error) {
    return json({ error: 'Could not create account.' }, { status: 500 });
  }
}
