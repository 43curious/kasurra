import db from '../../lib/db';
import { json, requireCurrentUser } from '../../lib/server-auth';
import type { AstroCookies } from 'astro';

export async function GET({ cookies }: { cookies: AstroCookies }) {
  const { user, response } = await requireCurrentUser(cookies);
  if (!user) return response;

  const res = await db.execute({
    sql: 'SELECT * FROM categories WHERE userId = ? ORDER BY sortOrder ASC, name ASC',
    args: [user.id]
  });

  return json(res.rows);
}

export async function POST({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { user, response } = await requireCurrentUser(cookies);
  if (!user) return response;

  const data = await request.json();
  const type = data.type;
  const name = String(data.name ?? '').trim();
  const emoji = String(data.emoji ?? '📦').trim();
  const color = String(data.color ?? '#64748b').trim();

  if (!name || (type !== 'expense' && type !== 'income')) {
    return json({ error: 'Valid name and type are required.' }, { status: 400 });
  }

  // Get max sortOrder for user and type
  const maxRes = await db.execute({
    sql: 'SELECT MAX(sortOrder) as maxSort FROM categories WHERE userId = ? AND type = ?',
    args: [user.id, type]
  });
  const maxSort = Number(maxRes.rows[0].maxSort ?? -1);

  const id = crypto.randomUUID();
  await db.execute({
    sql: 'INSERT INTO categories (id, userId, type, name, emoji, color, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [id, user.id, type, name, emoji, color, maxSort + 1]
  });

  return json({ id, success: true }, { status: 201 });
}

export async function PATCH({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { user, response } = await requireCurrentUser(cookies);
  if (!user) return response;

  const data = await request.json();
  const { id, type, name, emoji, color, orderedIds } = data;

  if (orderedIds && Array.isArray(orderedIds)) {
    // Reorder logic
    if (type !== 'expense' && type !== 'income') {
        return json({ error: 'Type is required for reordering.' }, { status: 400 });
    }

    const batch: any[] = [];
    orderedIds.forEach((catId, index) => {
        batch.push({
            sql: 'UPDATE categories SET sortOrder = ? WHERE id = ? AND userId = ? AND type = ?',
            args: [index, catId, user.id, type]
        });
    });

    await db.batch(batch, "write");
    return json({ success: true });
  }

  if (!id || !name) {
    return json({ error: 'ID and name are required.' }, { status: 400 });
  }

  await db.execute({
    sql: 'UPDATE categories SET name = ?, emoji = ?, color = ? WHERE id = ? AND userId = ?',
    args: [name, emoji, color, id, user.id]
  });

  return json({ success: true });
}

export async function DELETE({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { user, response } = await requireCurrentUser(cookies);
  if (!user) return response;

  const { id } = await request.json();
  if (!id) return json({ error: 'Category id is required.' }, { status: 400 });

  // Before deleting, check if it's used in records
  const countRes = await db.execute({
    sql: 'SELECT count(*) as count FROM records WHERE categoryId = ? AND userId = ?',
    args: [id, user.id]
  });
  
  if (Number(countRes.rows[0].count) > 0) {
    return json({ error: 'Category is in use and cannot be deleted.' }, { status: 400 });
  }

  await db.execute({
    sql: 'DELETE FROM categories WHERE id = ? AND userId = ?',
    args: [id, user.id]
  });

  return json({ success: true });
}
