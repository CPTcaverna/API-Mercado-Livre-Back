import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { CookieOptions, Request, Response } from 'express';
import { JWT_COOKIE_NAME } from './auth.constants';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { MercadoLibreCompleteDto } from './dto/mercadolibre-complete.dto';
import { RegisterDto } from './dto/register.dto';

type AuthedUser = { userId: string; email?: string };

function jwtCookieOptions(): CookieOptions {
  const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: maxAgeMs,
    path: '/',
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** JWT vai para cookie HttpOnly (`access_token`). Front cross-origin: `credentials: 'include'`. */
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, user } = await this.authService.login(dto);
    res.cookie(JWT_COOKIE_NAME, accessToken, jwtCookieOptions());
    return { user };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@Req() req: Request & { user: AuthedUser }) {
    return this.authService.me(req.user.userId);
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(JWT_COOKIE_NAME, { path: '/' });
    return { ok: true };
  }

  /**
   * Usuário logado no SPA: retorna URL de autorização do ML.
   * ML_REDIRECT_URI deve apontar para o front (ex.: /auth/ml/callback no Vite).
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('ml/connect')
  connectMercadoLibre(@Req() req: Request & { user: AuthedUser }) {
    return this.authService.authorizationUrlMercadoLibre(req.user.userId);
  }

  /**
   * SPA lê ?code=&state= do ML e chama esta rota para gravar tokens no MongoDB.
   */
  @Post('ml/complete')
  completeMercadoLibreFromFront(@Body() dto: MercadoLibreCompleteDto) {
    return this.authService.completeMercadoLibreOAuth(
      dto.code.trim(),
      dto.state.trim(),
    );
  }

  /** Legado: callback direto na API (prefira front + POST /auth/ml/complete). */
  @Get('ml/callback')
  async mercadoLibreCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
  ) {
    if (error) {
      throw new BadRequestException(
        errorDescription?.trim() ||
          `Autorização recusada ou cancelada (${error}).`,
      );
    }
    if (!state?.trim()) {
      throw new BadRequestException(
        'Parâmetro state ausente. Inicie a conexão pelo painel (GET /auth/ml/connect).',
      );
    }
    if (!code?.trim()) {
      throw new BadRequestException(
        'Parâmetro code ausente. O Mercado Livre deve enviar ?code= após autorizar.',
      );
    }
    return this.authService.completeMercadoLibreOAuth(code, state.trim());
  }
}
