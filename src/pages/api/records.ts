import db from '../../lib/db';
import { json, requireCurrentUser } from '../../lib/server-auth';
import type { AstroCookies } from 'astro';

type RecordType = 'expense' | 'income';

function isRecordType(value: unknown): value is RecordType {
  return value === 'expense' || value === 'income';
}

export async function GET({ cookies }: { cookies: AstroCookies }) {
  const { user, response } = requireCurrentUser(cookies);
  if (!user) return response;

  const records = db
    .prepare('SELECT * FROM records WHERE userId = ? ORDER BY date DESC, created DESC')
    .all(user.id);

  return json(records);
}

export async function POST({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { user, response } = requireCurrentUser(cookies);
  if (!user) return response;

  const data = await request.json();
  const type = data.type;
  const name = String(data.name ?? '').trim();
  const amount = Number(data.amount);
  const categoryId = String(data.categoryId ?? '').trim();
  const location = String(data.location ?? '').trim();
  const date = String(data.date ?? '').trim();

  if (!isRecordType(type) || !name || !Number.isFinite(amount) || amount <= 0 || !categoryId || !date) {
    return json({ error: 'Please provide a valid type, name, amount, category, and date.' }, { status: 400 });
  }

  const category = db
    .prepare('SELECT id FROM categories WHERE id = ? AND userId = ? AND type = ?')
    .get(categoryId, user.id, type);

  if (!category) {
    return json({ error: 'That category does not belong to your account.' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const updateBalance = db.transaction(() => {
    db.prepare(
      `INSERT INTO records (id, userId, type, name, amount, categoryId, location, date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, user.id, type, name, amount, categoryId, location, date);

    if (type === 'income') {
      db.prepare('UPDATE users SET bankBalance = bankBalance + ? WHERE id = ?').run(amount, user.id);
    } else {
      db.prepare('UPDATE users SET bankBalance = bankBalance - ? WHERE id = ?').run(amount, user.id);
    }
  });

  updateBalance();

  const record = db.prepare('SELECT * FROM records WHERE id = ? AND userId = ?').get(id, user.id);
  return json(record, { status: 201 });
}

export async function DELETE({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { user, response } = requireCurrentUser(cookies);
  if (!user) return response;

  const { id } = await request.json();
  if (!id) return json({ error: 'Record id is required.' }, { status: 400 });

  const record = db.prepare('SELECT type, amount FROM records WHERE id = ? AND userId = ?').get(id, user.id) as { type: RecordType, amount: number } | undefined;
  if (!record) return json({ error: 'Record not found.' }, { status: 404 });

  const deleteAndUpdate = db.transaction(() => {
    db.prepare('DELETE FROM records WHERE id = ? AND userId = ?').run(id, user.id);
    
    if (record.type === 'income') {
        db.prepare('UPDATE users SET bankBalance = bankBalance - ? WHERE id = ?').run(record.amount, user.id);
    } else {
        db.prepare('UPDATE users SET bankBalance = bankBalance + ? WHERE id = ?').run(record.amount, user.id);
    }
  });

  deleteAndUpdate();
  return json({ success: true });
}
