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
import type { Request, Response } from 'express';
import { JWT_COOKIE_NAME } from './auth.constants';
import { jwtCookieClearOptions, jwtCookieOptions } from './jwt-cookie.options';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { MercadoLivreCompleteDto } from './dto/mercadolivre-complete.dto';
import { RegisterDto } from './dto/register.dto';

type AuthedUser = { userId: string; email?: string };

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
    res.clearCookie(JWT_COOKIE_NAME, jwtCookieClearOptions());
    return { ok: true };
  }

  /**
   * Usuário logado no SPA: retorna URL de autorização do ML.
   * ML_REDIRECT_URI deve apontar para o front (ex.: /auth/ml/callback no Vite).
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('ml/connect')
  connectMercadoLivre(@Req() req: Request & { user: AuthedUser }) {
    return this.authService.authorizationUrlMercadoLivre(req.user.userId);
  }

  /**
   * SPA lê ?code=&state= do ML e chama esta rota para gravar tokens no MongoDB.
   */
  @Post('ml/complete')
  completeMercadoLivreFromFront(@Body() dto: MercadoLivreCompleteDto) {
    return this.authService.completeMercadoLivreOAuth(
      dto.code.trim(),
      dto.state.trim(),
    );
  }

  /** Legado: callback direto na API (prefira front + POST /auth/ml/complete). */
  @Get('ml/callback')
  async mercadoLivreCallback(
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
    return this.authService.completeMercadoLivreOAuth(code, state.trim());
  }
}
