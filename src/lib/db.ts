import Database from 'better-sqlite3';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), 'kasurra.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

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

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    passwordHash TEXT,
    created TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    type TEXT NOT NULL, -- 'expense' or 'income'
    name TEXT NOT NULL,
    emoji TEXT,
    color TEXT,
    sortOrder INTEGER DEFAULT 0,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    type TEXT NOT NULL, -- 'expense' or 'income'
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    categoryId TEXT,
    location TEXT,
    date TEXT NOT NULL,
    created TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (categoryId) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS savings_pools (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    name TEXT NOT NULL,
    target REAL DEFAULT 0,
    balance REAL DEFAULT 0,
    created TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS pools (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    target REAL,
    created TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pool_categories (
    poolId TEXT NOT NULL,
    categoryId TEXT NOT NULL,
    PRIMARY KEY (poolId, categoryId),
    FOREIGN KEY (poolId) REFERENCES pools(id) ON DELETE CASCADE,
    FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pool_withdrawals (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    poolId TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    created TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (poolId) REFERENCES pools(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    created TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function addColumnIfMissing(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing('users', 'email', 'TEXT');
addColumnIfMissing('users', 'passwordHash', 'TEXT');
addColumnIfMissing('users', 'bankBalance', 'REAL DEFAULT 0');
addColumnIfMissing('categories', 'sortOrder', 'INTEGER DEFAULT 0');
addColumnIfMissing('pools', 'type', "TEXT NOT NULL DEFAULT 'savings'");
addColumnIfMissing('pools', 'target', 'REAL');
addColumnIfMissing('pools', 'isClosed', 'INTEGER DEFAULT 0');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL');
db.exec('CREATE INDEX IF NOT EXISTS pool_user_idx ON pools(userId)');
db.exec('CREATE INDEX IF NOT EXISTS pool_category_idx ON pool_categories(categoryId)');

const legacyPoolCount = (db.prepare('SELECT count(*) as count FROM savings_pools').get() as { count: number }).count;
const normalizedPoolCount = (db.prepare('SELECT count(*) as count FROM pools').get() as { count: number }).count;
if (legacyPoolCount > 0 && normalizedPoolCount === 0) {
  const legacyPools = db
    .prepare('SELECT id, userId, name, target, created FROM savings_pools ORDER BY created')
    .all() as Array<{ id: string; userId: string; name: string; target: number | null; created: string }>;

  const migrateLegacyPools = db.transaction(() => {
    legacyPools.forEach((pool) => {
      db.prepare(
        `INSERT OR IGNORE INTO pools (id, userId, name, type, target, created)
         VALUES (?, ?, ?, 'savings', ?, ?)`
      ).run(pool.id, pool.userId, pool.name, pool.target, pool.created);
    });
  });

  migrateLegacyPools();
}

const needsSortBackfill = db
  .prepare(
    `SELECT userId, type
     FROM categories
     GROUP BY userId, type
     HAVING COUNT(*) > 1 AND COUNT(DISTINCT sortOrder) = 1 AND MIN(sortOrder) = 0 AND MAX(sortOrder) = 0`
  )
  .all() as Array<{ userId: string; type: 'expense' | 'income' }>;

needsSortBackfill.forEach(({ userId, type }) => {
  const rows = db
    .prepare('SELECT id FROM categories WHERE userId = ? AND type = ? ORDER BY name')
    .all(userId, type) as Array<{ id: string }>;

  rows.forEach((row, index) => {
    db.prepare('UPDATE categories SET sortOrder = ? WHERE id = ?').run(index, row.id);
  });
});

export function seedDefaultCategories(userId: string) {
  const existing = db.prepare('SELECT count(*) as count FROM categories WHERE userId = ?').get(userId) as { count: number };
  if (existing.count > 0) return;

  const stmt = db.prepare('INSERT INTO categories (id, userId, type, name, emoji, color, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertCategory = (type: 'expense' | 'income', category: { name: string; emoji: string; color: string }, sortOrder: number) => {
    stmt.run(crypto.randomUUID(), userId, type, category.name, category.emoji, category.color, sortOrder);
  };

  DEFAULT_EXPENSE_CATEGORIES.forEach((category, index) => insertCategory('expense', category, index));
  DEFAULT_INCOME_CATEGORIES.forEach((category, index) => insertCategory('income', category, index));
}

export function resetUserBudgetData(userId: string) {
  const clearData = db.transaction(() => {
    db.prepare('DELETE FROM records WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM pool_categories WHERE poolId IN (SELECT id FROM pools WHERE userId = ?)').run(userId);
    db.prepare('DELETE FROM pools WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM categories WHERE userId = ?').run(userId);
    seedDefaultCategories(userId);
  });

  clearData();
}

function seedLegacyUser() {
  const userCount = (db.prepare('SELECT count(*) as count FROM users').get() as { count: number }).count;
  if (userCount === 0) {
    const defaultUserId = 'default-user';
    db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(defaultUserId, 'Default User');
    seedDefaultCategories(defaultUserId);
  }
}

seedLegacyUser();

export default db;
