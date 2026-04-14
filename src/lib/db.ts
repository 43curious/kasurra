import { createClient } from '@libsql/client';

const url = import.meta.env.TURSO_DATABASE_URL || 'file:zeken.db';
const authToken = import.meta.env.TURSO_AUTH_TOKEN;

const db = createClient({
  url,
  authToken,
});

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Food & Drink', emoji: '🍕', color: '#f59e0b' },
  { name: 'Transport', emoji: '🚇', color: '#3b82f6' },
  { name: 'Shopping', emoji: '🛍️', color: '#ec4899' },
  { name: 'Entertainment', emoji: '🎬', color: '#22c55e' },
  { name: 'Health', emoji: '💊', color: '#14b8a6' },
  { name: 'Home', emoji: '🏠', color: '#ef4444' },
  { name: 'Other', emoji: '📦', color: '#64748b' }
] as const;

export const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Salary / Wages', emoji: '💼', color: '#3b82f6' },
  { name: 'Freelance / Gig', emoji: '💻', color: '#14b8a6' },
  { name: 'Gift / Bonus', emoji: '🎁', color: '#ec4899' },
  { name: 'Investment', emoji: '📈', color: '#22c55e' },
  { name: 'Other Income', emoji: '⊞', color: '#64748b' }
] as const;

// Schema initialization
async function initSchema() {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'user',
      passwordHash TEXT,
      bankBalance REAL DEFAULT 0,
      created TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT,
      color TEXT,
      sortOrder INTEGER DEFAULT 0,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      categoryId TEXT,
      location TEXT,
      date TEXT NOT NULL,
      created TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS pools (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'savings',
      target REAL,
      isClosed INTEGER DEFAULT 0,
      created TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS pool_categories (
      poolId TEXT NOT NULL,
      categoryId TEXT NOT NULL,
      PRIMARY KEY (poolId, categoryId),
      FOREIGN KEY (poolId) REFERENCES pools(id) ON DELETE CASCADE,
      FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS pool_withdrawals (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      poolId TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      created TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (poolId) REFERENCES pools(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      created TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )`
  ], "write");

  // Migration: Add role column if missing (LibSQL doesn't have PRAGMA table_info in the same way, but better safe than sorry)
  try {
    await db.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
  } catch (e) {}
  
  try {
    await db.execute("ALTER TABLE users ADD COLUMN bankBalance REAL DEFAULT 0");
  } catch (e) {}

  await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL');
  await db.execute('CREATE INDEX IF NOT EXISTS pool_user_idx ON pools(userId)');
  await db.execute('CREATE INDEX IF NOT EXISTS pool_category_idx ON pool_categories(categoryId)');
}

// Ensure the schema is ready (Note: in a serverless env, we might want to call this elsewhere, 
// but for simplicity we'll try to run it on import or first use)
initSchema().catch(console.error);

export async function seedDefaultCategories(userId: string) {
  const existing = await db.execute({
    sql: 'SELECT count(*) as count FROM categories WHERE userId = ?',
    args: [userId]
  });
  
  const count = Number(existing.rows[0].count);
  if (count > 0) return;

  const batch: any[] = [];
  
  DEFAULT_EXPENSE_CATEGORIES.forEach((category, index) => {
    batch.push({
      sql: 'INSERT INTO categories (id, userId, type, name, emoji, color, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [crypto.randomUUID(), userId, 'expense', category.name, category.emoji, category.color, index]
    });
  });

  DEFAULT_INCOME_CATEGORIES.forEach((category, index) => {
    batch.push({
      sql: 'INSERT INTO categories (id, userId, type, name, emoji, color, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [crypto.randomUUID(), userId, 'income', category.name, category.emoji, category.color, index]
    });
  });

  if (batch.length > 0) {
    await db.batch(batch, "write");
  }
}

export async function resetUserBudgetData(userId: string) {
  await db.batch([
    { sql: 'DELETE FROM records WHERE userId = ?', args: [userId] },
    { sql: 'DELETE FROM pool_categories WHERE poolId IN (SELECT id FROM pools WHERE userId = ?)', args: [userId] },
    { sql: 'DELETE FROM pools WHERE userId = ?', args: [userId] },
    { sql: 'DELETE FROM categories WHERE userId = ?', args: [userId] }
  ], "write");
  
  await seedDefaultCategories(userId);
}

export default db;
