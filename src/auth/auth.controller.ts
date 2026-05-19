import {
  Body,
  Controller,
  Get,
  Post,
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

  @UseGuards(AuthGuard('jwt'))
  @Get('ml/connect')
  connectMercadoLivre(@Req() req: Request & { user: AuthedUser }) {
    return this.authService.authorizationUrlMercadoLivre(req.user.userId);
  }

  @Post('ml/complete')
  completeMercadoLivre(@Body() dto: MercadoLivreCompleteDto) {
    return this.authService.completeMercadoLivreOAuth(
      dto.code.trim(),
      dto.state.trim(),
    );
  }
}
