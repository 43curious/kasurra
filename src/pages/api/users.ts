import type { AstroCookies } from 'astro';
import db, { resetUserBudgetData } from '../../lib/db';
import { json, requireCurrentUser } from '../../lib/server-auth';

export async function GET({ cookies }: { cookies: AstroCookies }) {
  const { user, response } = requireCurrentUser(cookies);
  if (!user) return response;

  return json(user);
}

export async function PATCH({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { user, response } = requireCurrentUser(cookies);
  if (!user) return response;

  const data = await request.json();
  const name = typeof data.name !== 'undefined' ? String(data.name).trim() : user.name;
  const bankBalance = typeof data.bankBalance !== 'undefined' ? Number(data.bankBalance) : user.bankBalance;

  if (typeof data.name !== 'undefined' && !name) {
    return json({ error: 'Name is required.' }, { status: 400 });
  }

  db.prepare('UPDATE users SET name = ?, bankBalance = ? WHERE id = ?').run(name, bankBalance, user.id);
  return json({ ...user, name, bankBalance });
}

export async function DELETE({ cookies }: { cookies: AstroCookies }) {
  const { user, response } = requireCurrentUser(cookies);
  if (!user) return response;

  resetUserBudgetData(user.id);
  return json({ success: true });
}
