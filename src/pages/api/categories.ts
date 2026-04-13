import type { AstroCookies } from 'astro';
import db from '../../lib/db';
import { json, requireCurrentUser } from '../../lib/server-auth';

type CategoryType = 'expense' | 'income';

function isCategoryType(value: unknown): value is CategoryType {
  return value === 'expense' || value === 'income';
}

export async function GET({ cookies }: { cookies: AstroCookies }) {
  const { user, response } = requireCurrentUser(cookies);
  if (!user) return response;

  const categories = db
    .prepare('SELECT * FROM categories WHERE userId = ? ORDER BY type, sortOrder, name')
    .all(user.id);

  return json(categories);
}

export async function POST({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { user, response } = requireCurrentUser(cookies);
  if (!user) return response;

  const data = await request.json();
  const type = data.type;
  const name = String(data.name ?? '').trim();
  const emoji = String(data.emoji ?? '•').trim().slice(0, 8);
  const color = String(data.color ?? '#64748b').trim();

  if (!isCategoryType(type) || !name) {
    return json({ error: 'Please provide a valid category type and name.' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const nextOrderRow = db
    .prepare('SELECT COALESCE(MAX(sortOrder), -1) AS maxOrder FROM categories WHERE userId = ? AND type = ?')
    .get(user.id, type) as { maxOrder: number };
  db.prepare(
    `INSERT INTO categories (id, userId, type, name, emoji, color, sortOrder)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, user.id, type, name, emoji || '•', color, nextOrderRow.maxOrder + 1);

  return json({ id, success: true }, { status: 201 });
}

export async function PATCH({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { user, response } = requireCurrentUser(cookies);
  if (!user) return response;

  const data = await request.json();
  const type = data.type;
  const id = typeof data.id === 'string' ? data.id : '';

  if (!isCategoryType(type)) {
    return json({ error: 'A valid category type is required.' }, { status: 400 });
  }

  if (id) {
    const name = String(data.name ?? '').trim();
    const emoji = String(data.emoji ?? '•').trim().slice(0, 8);
    const color = String(data.color ?? '#64748b').trim();

    if (!name) {
      return json({ error: 'Category name is required.' }, { status: 400 });
    }

    const updated = db
      .prepare('UPDATE categories SET name = ?, emoji = ?, color = ? WHERE id = ? AND userId = ? AND type = ?')
      .run(name, emoji || '•', color, id, user.id, type);

    return json({ success: updated.changes > 0 });
  }

  const orderedIds = Array.isArray(data.orderedIds) ? data.orderedIds.filter((entry): entry is string => typeof entry === 'string') : [];
  if (orderedIds.length === 0) {
    return json({ error: 'A category id or ordered ids are required.' }, { status: 400 });
  }

  const categories = db.prepare('SELECT id FROM categories WHERE userId = ? AND type = ?').all(user.id, type) as Array<{ id: string }>;
  if (categories.length !== orderedIds.length || categories.some(({ id: categoryId }) => !orderedIds.includes(categoryId))) {
    return json({ error: 'The category order is invalid.' }, { status: 400 });
  }

  db.transaction(() => {
    orderedIds.forEach((orderedId, index) => {
      db.prepare('UPDATE categories SET sortOrder = ? WHERE id = ? AND userId = ?').run(index, orderedId, user.id);
    });
  })();

  return json({ success: true });
}

export async function DELETE({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { user, response } = requireCurrentUser(cookies);
  if (!user) return response;

  const { id } = await request.json();
  if (!id) return json({ error: 'Category id is required.' }, { status: 400 });

  const category = db
    .prepare('SELECT id, type FROM categories WHERE id = ? AND userId = ?')
    .get(id, user.id) as { id: string; type: CategoryType } | undefined;

  if (!category) return json({ success: false });

  const fallback = db
    .prepare(
      `SELECT id FROM categories
       WHERE userId = ? AND type = ? AND lower(name) LIKE 'other%'
       ORDER BY name
       LIMIT 1`
    )
    .get(user.id, category.type) as { id: string } | undefined;

  const removeCategory = db.transaction(() => {
    if (fallback && fallback.id !== id) {
      db.prepare('UPDATE records SET categoryId = ? WHERE userId = ? AND categoryId = ?').run(fallback.id, user.id, id);
    }

    db.prepare('DELETE FROM categories WHERE id = ? AND userId = ?').run(id, user.id);
  });

  removeCategory();
  return json({ success: true });
}
