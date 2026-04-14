import db from '../../lib/db';
import { json, requireCurrentUser } from '../../lib/server-auth';
import type { AstroCookies } from 'astro';

export async function GET({ url, cookies }: { url: URL; cookies: AstroCookies }) {
  const { user, response } = await requireCurrentUser(cookies);
  if (!user) return response;

  const year = Number(url.searchParams.get('year') || new Date().getFullYear());

  const poolsRes = await db.execute({
    sql: 'SELECT * FROM pools WHERE userId = ? ORDER BY created ASC',
    args: [user.id]
  });

  const pools = [];
  for (const row of poolsRes.rows) {
    const poolId = row.id as string;

    // Get linked categories
    const categoriesRes = await db.execute({
        sql: `SELECT c.id, c.name, c.emoji, c.color 
              FROM pool_categories pc 
              JOIN categories c ON c.id = pc.categoryId 
              WHERE pc.poolId = ?`,
        args: [poolId]
    });

    // Get withdrawals for this year
    const withdrawalsRes = await db.execute({
        sql: `SELECT * FROM pool_withdrawals 
              WHERE poolId = ? AND date BETWEEN ? AND ?`,
        args: [poolId, `${year}-01-01`, `${year}-12-31`]
    });

    // Calculate balance (income - expenses for linked categories - withdrawals)
    const linkedIds = categoriesRes.rows.map(c => c.id as string);
    let incomeSum = 0;
    let expenseSum = 0;

    if (linkedIds.length > 0) {
        const placeHolders = linkedIds.map(() => '?').join(',');
        const recordsRes = await db.execute({
            sql: `SELECT type, SUM(amount) as total 
                  FROM records 
                  WHERE userId = ? AND categoryId IN (${placeHolders}) 
                  GROUP BY type`,
            args: [user.id, ...linkedIds]
        });

        recordsRes.rows.forEach(r => {
            if (r.type === 'income') incomeSum = Number(r.total);
            else expenseSum = Number(r.total);
        });
    }

    const withdrawalsSum = withdrawalsRes.rows.reduce((sum, w) => sum + Number(w.amount), 0);
    const balance = incomeSum - expenseSum - withdrawalsSum;

    pools.push({
      ...row,
      balance,
      linkedCategories: categoriesRes.rows,
      withdrawals: withdrawalsRes.rows,
      linkedCategoryIds: linkedIds
    });
  }

  return json(pools);
}

export async function POST({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { user, response } = await requireCurrentUser(cookies);
  if (!user) return response;

  const data = await request.json();
  const { name, linkedCategoryIds, target, type = 'savings' } = data;

  if (!name || !Array.isArray(linkedCategoryIds)) {
    return json({ error: 'Name and linked categories are required.' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  await db.batch([
    {
        sql: 'INSERT INTO pools (id, userId, name, type, target) VALUES (?, ?, ?, ?, ?)',
        args: [id, user.id, name, type, target || null]
    },
    ...linkedCategoryIds.map(catId => ({
        sql: 'INSERT INTO pool_categories (poolId, categoryId) VALUES (?, ?)',
        args: [id, catId]
    }))
  ], "write");

  return json({ id, success: true }, { status: 201 });
}

export async function PATCH({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { user, response } = await requireCurrentUser(cookies);
  if (!user) return response;

  const data = await request.json();
  const { poolId, amount, description, date, isClosed } = data;

  if (isClosed !== undefined) {
    if (!poolId) return json({ error: 'Pool ID is required.' }, { status: 400 });
    await db.execute({
        sql: 'UPDATE pools SET isClosed = ? WHERE id = ? AND userId = ?',
        args: [isClosed ? 1 : 0, poolId, user.id]
    });
    return json({ success: true });
  }

  if (!poolId || !amount || !date) {
    return json({ error: 'Pool ID, amount, and date are required.' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  await db.execute({
    sql: 'INSERT INTO pool_withdrawals (id, userId, poolId, amount, description, date) VALUES (?, ?, ?, ?, ?, ?)',
    args: [id, user.id, poolId, amount, description || '', date]
  });

  return json({ id, success: true });
}
