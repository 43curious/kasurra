import type { AstroCookies } from 'astro';
import { getCurrentUser, json } from '../../../lib/server-auth';

export async function GET({ cookies }: { cookies: AstroCookies }) {
  const user = getCurrentUser(cookies);
  return json({ user }, { status: user ? 200 : 401 });
}
