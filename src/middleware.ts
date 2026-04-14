import { defineMiddleware } from 'astro:middleware';
import { getCurrentUser } from './lib/server-auth';

const PUBLIC_PATHS = new Set(['/', '/login']);
const PUBLIC_PREFIXES = ['/api', '/favicon', '/_astro'];

export const onRequest = defineMiddleware(async (context, next) => {
  try {
    const { pathname } = context.url;
    const isPublic =
      PUBLIC_PATHS.has(pathname) ||
      PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

    const user = await getCurrentUser(context.cookies);
    context.locals.user = user;

    if (!user && !isPublic) {
      return context.redirect('/login');
    }

    if (user && pathname === '/login') {
      return context.redirect('/dashboard');
    }

    return next();
  } catch (error) {
    console.error('Middleware error:', error);
    return next(); // Fallback to let the page or a 500 handler deal with it
  }
});
