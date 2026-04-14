import { getCurrentUser, json } from '../../../lib/server-auth';
import type { AstroCookies } from 'astro';

export async function GET({ cookies }: { cookies: AstroCookies }) {
  const user = await getCurrentUser(cookies);
  if (!user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  return json(user);
}
