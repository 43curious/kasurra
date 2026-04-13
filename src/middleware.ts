import { defineMiddleware } from 'astro:middleware';
import { getCurrentUser } from './lib/server-auth';

const PUBLIC_PATHS = new Set(['/', '/login']);
const PUBLIC_PREFIXES = ['/api', '/favicon', '/_astro'];

export const onRequest = defineMiddleware((context, next) => {
  const { pathname } = context.url;
  const isPublic =
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  const user = getCurrentUser(context.cookies);
  context.locals.user = user;

  if (!user && !isPublic) {
    return context.redirect('/login');
  }

  if (user && pathname === '/login') {
    return context.redirect('/dashboard');
  }

  return next();
});
