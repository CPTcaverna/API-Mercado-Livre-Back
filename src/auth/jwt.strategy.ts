import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import { JWT_COOKIE_NAME } from './auth.constants';

function jwtFromCookie(req: Request): string | null {
  const fromCookie = req?.cookies?.[JWT_COOKIE_NAME];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) {
    return fromCookie;
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) {
      throw new Error('JWT_SECRET não configurado no ambiente.');
    }
    super({
      jwtFromRequest: jwtFromCookie,
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: { sub?: string; email?: string }) {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }
    return { userId: payload.sub, email: payload.email };
  }
}
