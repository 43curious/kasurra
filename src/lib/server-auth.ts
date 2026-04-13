import type { AstroCookies } from 'astro';
// @ts-ignore
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import db, { seedDefaultCategories } from './db';

export const SESSION_COOKIE = 'kasurra_session';
const SESSION_DAYS = 14;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  bankBalance: number;
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

export function createUser(name: string, email: string, password: string): AuthUser {
  const id = crypto.randomUUID();
  const passwordHash = hashPassword(password);

  const create = db.transaction(() => {
    db.prepare('INSERT INTO users (id, name, email, passwordHash) VALUES (?, ?, ?, ?)').run(id, name, email, passwordHash);
    seedDefaultCategories(id);
  });

  create();
  return { id, name, email, bankBalance: 0 };
}

export function findUserByEmail(email: string): StoredUser | undefined {
  return db
    .prepare('SELECT id, name, email, bankBalance, passwordHash FROM users WHERE email = ? AND passwordHash IS NOT NULL')
    .get(email) as StoredUser | undefined;
}

export function createSession(cookies: AstroCookies, userId: string) {
  const id = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  db.prepare('INSERT INTO sessions (id, userId, expiresAt) VALUES (?, ?, ?)').run(id, userId, expiresAt.toISOString());

  cookies.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    path: '/',
    expires: expiresAt
  });
}

export function clearSession(cookies: AstroCookies) {
  const sessionId = cookies.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }

  cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function getCurrentUser(cookies: AstroCookies): AuthUser | null {
  const sessionId = cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const user = db
    .prepare(
      `SELECT users.id, users.name, users.email, users.bankBalance
       FROM sessions
       JOIN users ON users.id = sessions.userId
       WHERE sessions.id = ? AND sessions.expiresAt > ?`
    )
    .get(sessionId, new Date().toISOString()) as AuthUser | undefined;

  if (!user) {
    cookies.delete(SESSION_COOKIE, { path: '/' });
    return null;
  }

  return user;
}

export function requireCurrentUser(cookies: AstroCookies) {
  const user = getCurrentUser(cookies);
  if (!user) {
    return { user: null, response: json({ error: 'You need to log in first.' }, { status: 401 }) };
  }

  return { user, response: null };
}
