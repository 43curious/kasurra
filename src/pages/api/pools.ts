import type { AstroCookies } from 'astro';
import db from '../../lib/db';
import { json, requireCurrentUser } from '../../lib/server-auth';
import type { Pool, PoolLinkedCategory } from '../../lib/types';

type PoolRow = {
  id: string;
  name: string;
  type: 'savings';
  target: number | null;
  isClosed: number;
};

type LinkedCategoryRow = PoolLinkedCategory & {
  poolId: string;
};

function getRequestedYear(request: Request) {
  const url = new URL(request.url);
  const parsed = Number(url.searchParams.get('year'));
  const year = Number.isInteger(parsed) ? parsed : new Date().getFullYear();
  return year;
}

function getSavingsPools(userId: string, year: number): Pool[] {
  const pools = db
    .prepare(
      `SELECT id, name, type, target, isClosed
       FROM pools
       WHERE userId = ? AND type = 'savings'
       ORDER BY isClosed ASC, created DESC, name ASC`
    )
    .all(userId) as PoolRow[];

  if (pools.length === 0) return [];

  const linkedCategories = db
    .prepare(
      `SELECT pc.poolId, c.id, c.name, c.emoji, c.color
       FROM pool_categories pc
       JOIN categories c ON c.id = pc.categoryId
       JOIN pools p ON p.id = pc.poolId
       WHERE p.userId = ? AND c.userId = ? AND c.type = 'expense'
       ORDER BY c.sortOrder, c.name`
    )
    .all(userId, userId) as LinkedCategoryRow[];

  // Sum up all records of linked categories for this POOL up to the CURRENTLY VIEWED year
  const balances = db
    .prepare(
      `SELECT pc.poolId, COALESCE(SUM(r.amount), 0) AS balance
       FROM pool_categories pc
       JOIN pools p ON p.id = pc.poolId
       LEFT JOIN records r
         ON r.categoryId = pc.categoryId
        AND r.userId = p.userId
        AND r.type = 'expense'
        AND CAST(strftime('%Y', r.date) AS INTEGER) <= ?
       WHERE p.userId = ? AND p.type = 'savings'
       GROUP BY pc.poolId`
    )
    .all(year, userId) as Array<{ poolId: string; balance: number }>;

  // Sum up all withdrawals for this POOL up to the CURRENTLY VIEWED year
  const withdrawals = db
    .prepare(
      `SELECT poolId, COALESCE(SUM(amount), 0) AS total, GROUP_CONCAT(json_object('id', id, 'amount', amount, 'description', description, 'date', date, 'created', created)) as history
       FROM pool_withdrawals
       WHERE userId = ? AND CAST(strftime('%Y', date) AS INTEGER) <= ?
       GROUP BY poolId`
    )
    .all(userId, year) as Array<{ poolId: string; total: number; history: string }>;

  const categoriesByPool = new Map<string, PoolLinkedCategory[]>();
  linkedCategories.forEach(({ poolId, ...category }) => {
    const existing = categoriesByPool.get(poolId) ?? [];
    existing.push(category);
    categoriesByPool.set(poolId, existing);
  });

  const balancesByPool = new Map<string, number>();
  balances.forEach(({ poolId, balance }) => {
    balancesByPool.set(poolId, balance ?? 0);
  });

  const withdrawalsByPool = new Map<string, { total: number; list: any[] }>();
  withdrawals.forEach(({ poolId, total, history }) => {
    try {
        const list = history ? JSON.parse(`[${history}]`) : [];
        withdrawalsByPool.set(poolId, { total: total ?? 0, list });
    } catch(e) {
        withdrawalsByPool.set(poolId, { total: total ?? 0, list: [] });
    }
  });

  return pools.map((pool) => {
    const poolCategories = categoriesByPool.get(pool.id) ?? [];
    const saved = balancesByPool.get(pool.id) ?? 0;
    const spentData = withdrawalsByPool.get(pool.id) ?? { total: 0, list: [] };
    
    return {
      id: pool.id,
      name: pool.name,
      type: pool.type,
      balance: saved,
      totalWithdrawals: spentData.total,
      availableBalance: saved - spentData.total,
      isClosed: pool.isClosed === 1,
      target: pool.target,
      linkedCategoryIds: poolCategories.map((category) => category.id),
      linkedCategories: poolCategories,
      withdrawals: spentData.list
    };
  });
}

function getRolloverPool(userId: string, year: number): Pool {
  const monthlyRows = db
    .prepare(
      `SELECT
          CAST(strftime('%m', date) AS INTEGER) AS monthIndex,
          type,
          COALESCE(SUM(amount), 0) AS total
       FROM records
       WHERE userId = ?
         AND CAST(strftime('%Y', date) AS INTEGER) = ?
       GROUP BY monthIndex, type`
    )
    .all(userId, year) as Array<{ monthIndex: number; type: 'expense' | 'income'; total: number }>;

  const months = Array.from({ length: 12 }, (_, index) => ({
    monthIndex: index + 1,
    income: 0,
    expense: 0
  }));

  monthlyRows.forEach((row) => {
    const month = months[row.monthIndex - 1];
    if (!month) return;
    if (row.type === 'income') month.income = row.total;
    if (row.type === 'expense') month.expense = row.total;
  });

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const balance = months.reduce((sum, month) => {
    const isFuture = year === currentYear && month.monthIndex > currentMonth;
    if (isFuture) return sum;
    return sum + (month.income - month.expense);
  }, 0);

  return {
    id: 'rollover',
    name: 'Rollover',
    type: 'rollover',
    balance,
    totalWithdrawals: 0,
    availableBalance: balance,
    isClosed: false,
    target: null,
    linkedCategoryIds: [],
    linkedCategories: []
  };
}

export async function GET({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { user, response } = requireCurrentUser(cookies);
  if (!user) return response;

  const year = getRequestedYear(request);
  const pools = [getRolloverPool(user.id, year), ...getSavingsPools(user.id, year)];
  return json(pools);
}

export async function PATCH({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { user, response } = requireCurrentUser(cookies);
  if (!user) return response;

  const data = await request.json();
  const poolId = data.poolId;

  const pool = db.prepare('SELECT id FROM pools WHERE id = ? AND userId = ?').get(poolId, user.id);
  if (!pool) {
    return json({ error: 'Pool not found.' }, { status: 404 });
  }

  // If payload contains isClosed, we are toggling status
  if (typeof data.isClosed === 'boolean') {
    db.prepare('UPDATE pools SET isClosed = ? WHERE id = ?').run(data.isClosed ? 1 : 0, poolId);
    return json({ success: true });
  }

  // Otherwise, it's a withdrawal
  const amount = Number(data.amount);
  const description = String(data.description ?? '').trim();
  const date = data.date || new Date().toISOString().split('T')[0];

  if (!poolId || isNaN(amount) || amount <= 0) {
    return json({ error: 'Valid pool ID and amount are required.' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const updateWithdrawal = db.transaction(() => {
    db.prepare(
      `INSERT INTO pool_withdrawals (id, userId, poolId, amount, description, date)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, user.id, poolId, amount, description, date);

    db.prepare('UPDATE users SET bankBalance = bankBalance - ? WHERE id = ?').run(amount, user.id);
  });

  updateWithdrawal();

  return json({ id, success: true }, { status: 201 });
}

export async function POST({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const { user, response } = requireCurrentUser(cookies);
  if (!user) return response;

  const data = await request.json();
  const name = String(data.name ?? '').trim();
  const targetValue = data.target;
  const target = targetValue === '' || targetValue === null || typeof targetValue === 'undefined'
    ? null
    : Number(targetValue);
  const linkedCategoryIds = Array.isArray(data.linkedCategoryIds)
    ? data.linkedCategoryIds.filter((entry: any): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];

  if (!name) {
    return json({ error: 'Pool name is required.' }, { status: 400 });
  }

  if (linkedCategoryIds.length === 0) {
    return json({ error: 'Choose at least one expense category.' }, { status: 400 });
  }

  if (target !== null && (!Number.isFinite(target) || target < 0)) {
    return json({ error: 'Target must be a positive number.' }, { status: 400 });
  }

  const categories = db
    .prepare(
      `SELECT id
       FROM categories
       WHERE userId = ? AND type = 'expense' AND id IN (${linkedCategoryIds.map(() => '?').join(', ')})`
    )
    .all(user.id, ...linkedCategoryIds) as Array<{ id: string }>;

  if (categories.length !== linkedCategoryIds.length) {
    return json({ error: 'All linked categories must be expense categories from your account.' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const createPool = db.transaction(() => {
    db.prepare(
      `INSERT INTO pools (id, userId, name, type, target)
       VALUES (?, ?, ?, 'savings', ?)`
    ).run(id, user.id, name, target);

    const linkStmt = db.prepare('INSERT INTO pool_categories (poolId, categoryId) VALUES (?, ?)');
    linkedCategoryIds.forEach((categoryId: string) => {
      linkStmt.run(id, categoryId);
    });
  });

  createPool();
  return json({ id, success: true }, { status: 201 });
}
