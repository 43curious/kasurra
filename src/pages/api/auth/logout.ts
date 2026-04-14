import { clearSession, json } from '../../../lib/server-auth';
import type { AstroCookies } from 'astro';

export async function POST({ cookies }: { cookies: AstroCookies }) {
  await clearSession(cookies);
  return json({ success: true });
}
