import db from '../../../lib/db';
import { json, requireAdmin, hashPassword } from '../../../lib/server-auth';
import type { AstroCookies } from 'astro';

export async function GET({ cookies }: { cookies: AstroCookies }) {
  const { response } = await requireAdmin(cookies);
  if (response) return response;

  const res = await db.execute('SELECT id, name, email, role, created, bankBalance FROM users ORDER BY created DESC');
  return json(res.rows);
}

export async function POST({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { response } = await requireAdmin(cookies);
  if (response) return response;

  const { name, email, password, role = 'user' } = await request.json();

  if (!name || !email || !password) {
    return json({ error: 'Name, email, and password are required.' }, { status: 400 });
  }

  const passwordHash = hashPassword(password);
  const id = crypto.randomUUID();

  try {
    await db.execute({
      sql: 'INSERT INTO users (id, name, email, passwordHash, role) VALUES (?, ?, ?, ?, ?)',
      args: [id, name, email, passwordHash, role]
    });
    return json({ success: true, id });
  } catch (error) {
    return json({ error: 'User already exists or database error.' }, { status: 400 });
  }
}

export async function DELETE({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { user: admin, response } = await requireAdmin(cookies);
  if (response) return response;

  const { id } = await request.json();
  if (!id) return json({ error: 'User ID is required.' }, { status: 400 });

  if (id === admin?.id) {
    return json({ error: 'You cannot delete yourself.' }, { status: 400 });
  }

  await db.execute({
    sql: 'DELETE FROM users WHERE id = ?',
    args: [id]
  });

  return json({ success: true });
}
