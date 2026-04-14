import db from '../../lib/db';
import { json, requireCurrentUser } from '../../lib/server-auth';
import type { AstroCookies } from 'astro';

export async function GET({ cookies }: { cookies: AstroCookies }) {
  const { user, response } = await requireCurrentUser(cookies);
  if (!user) return response;

  const res = await db.execute({
    sql: 'SELECT id, name, email, bankBalance, role FROM users WHERE id = ?',
    args: [user.id]
  });

  return json(res.rows[0]);
}

export async function PATCH({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { user, response } = await requireCurrentUser(cookies);
  if (!user) return response;

  const data = await request.json();
  const { name, bankBalance } = data;

  if (name !== undefined) {
    await db.execute({
      sql: 'UPDATE users SET name = ? WHERE id = ?',
      args: [name, user.id]
    });
  }

  if (bankBalance !== undefined) {
    await db.execute({
      sql: 'UPDATE users SET bankBalance = ? WHERE id = ?',
      args: [bankBalance, user.id]
    });
  }

  const res = await db.execute({
    sql: 'SELECT id, name, email, bankBalance, role FROM users WHERE id = ?',
    args: [user.id]
  });

  return json(res.rows[0]);
}

export async function DELETE({ cookies }: { cookies: AstroCookies }) {
  const { user, response } = await requireCurrentUser(cookies);
  if (!user) return response;

  await db.batch([
    { sql: 'DELETE FROM records WHERE userId = ?', args: [user.id] },
    { sql: 'DELETE FROM pool_categories WHERE poolId IN (SELECT id FROM pools WHERE userId = ?)', args: [user.id] },
    { sql: 'DELETE FROM pools WHERE userId = ?', args: [user.id] },
    { sql: 'DELETE FROM categories WHERE userId = ?', args: [user.id] }
  ], "write");

  return json({ success: true });
}
