import type { CookieOptions } from 'express';

function useCrossSiteCookie(): boolean {
  if (process.env.COOKIE_CROSS_SITE === 'true') return true;
  return process.env.NODE_ENV === 'production';
}

function cookieBaseOptions(): Pick<
  CookieOptions,
  'httpOnly' | 'secure' | 'sameSite' | 'path'
> {
  const crossSite = useCrossSiteCookie();
  return {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? 'none' : 'lax',
    path: '/',
  };
}

export function jwtCookieOptions(): CookieOptions {
  return {
    ...cookieBaseOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function jwtCookieClearOptions(): CookieOptions {
  return cookieBaseOptions();
}
