import type { AstroCookies } from 'astro';
import { clearSession, json } from '../../../lib/server-auth';

export async function POST({ cookies }: { cookies: AstroCookies }) {
  clearSession(cookies);
  return json({ success: true });
}
