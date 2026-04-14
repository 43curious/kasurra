import type { AstroCookies } from 'astro';
// @ts-ignore
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import db, { seedDefaultCategories } from './db';

export const SESSION_COOKIE = 'zeken_session';
const SESSION_DAYS = 14;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  bankBalance: number;
  role: 'user' | 'admin';
}

interface StoredUser extends AuthUser {
  passwordHash: string;
}

export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers
    }
  });
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;

  // @ts-ignore
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createUser(name: string, email: string, password: string, role: 'user' | 'admin' = 'user'): Promise<AuthUser> {
  const id = crypto.randomUUID();
  const passwordHash = hashPassword(password);

  await db.execute({
    sql: 'INSERT INTO users (id, name, email, passwordHash, role) VALUES (?, ?, ?, ?, ?)',
    args: [id, name, email, passwordHash, role]
  });
  
  await seedDefaultCategories(id);
  
  return { id, name, email, bankBalance: 0, role };
}

export async function findUserByEmail(email: string): Promise<StoredUser | undefined> {
  const res = await db.execute({
    sql: 'SELECT id, name, email, bankBalance, role, passwordHash FROM users WHERE email = ? AND passwordHash IS NOT NULL',
    args: [email]
  });
  
  if (res.rows.length === 0) return undefined;
  
  const row = res.rows[0];
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    bankBalance: Number(row.bankBalance),
    role: row.role as 'user' | 'admin',
    passwordHash: row.passwordHash as string
  };
}

export async function createSession(cookies: AstroCookies, userId: string) {
  const id = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.execute({
    sql: 'INSERT INTO sessions (id, userId, expiresAt) VALUES (?, ?, ?)',
    args: [id, userId, expiresAt.toISOString()]
  });

  cookies.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    path: '/',
    expires: expiresAt
  });
}

export async function clearSession(cookies: AstroCookies) {
  const sessionId = cookies.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    await db.execute({
      sql: 'DELETE FROM sessions WHERE id = ?',
      args: [sessionId]
    });
  }

  cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function getCurrentUser(cookies: AstroCookies): Promise<AuthUser | null> {
  const sessionId = cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const res = await db.execute({
    sql: `SELECT users.id, users.name, users.email, users.bankBalance, users.role
       FROM sessions
       JOIN users ON users.id = sessions.userId
       WHERE sessions.id = ? AND sessions.expiresAt > ?`,
    args: [sessionId, new Date().toISOString()]
  });

  if (res.rows.length === 0) {
    cookies.delete(SESSION_COOKIE, { path: '/' });
    return null;
  }

  const row = res.rows[0];
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    bankBalance: Number(row.bankBalance),
    role: row.role as 'user' | 'admin'
  };
}

export async function requireCurrentUser(cookies: AstroCookies) {
  const user = await getCurrentUser(cookies);
  if (!user) {
    return { user: null, response: json({ error: 'You need to log in first.' }, { status: 401 }) };
  }

  return { user, response: null };
}

export async function requireAdmin(cookies: AstroCookies) {
  const user = await getCurrentUser(cookies);
  if (!user || user.role !== 'admin') {
    return { user: null, response: json({ error: 'Forbidden. Admin access required.' }, { status: 403 }) };
  }
  return { user, response: null };
}
