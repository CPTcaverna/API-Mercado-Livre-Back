import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoLibreOAuthService } from './mercadolibre-oauth.service';
import { MercadoLibreTokenService } from './mercadolibre-token.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

const ML_OAUTH_STATE_PROP = 'ml_oauth';

const userWithMlStatusSelect = {
  id: true,
  name: true,
  email: true,
  mlAccessToken: true,
} as const;

type UserWithMlToken = {
  id: string;
  name: string;
  email: string;
  mlAccessToken: string | null;
};

function toPublicUser(user: UserWithMlToken) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mlConnected: Boolean(user.mlAccessToken?.trim()),
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mercadoLibreOAuth: MercadoLibreOAuthService,
    private readonly mercadoLibreToken: MercadoLibreTokenService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('E-mail já cadastrado.');
    }
    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        password,
      },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    return user;
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { ...userWithMlStatusSelect, password: true },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    }
    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
    });
    const { password: _password, ...profile } = user;
    return {
      accessToken,
      user: toPublicUser(profile),
    };
  }

  signMercadoLibreOAuthState(userId: string): string {
    return this.jwt.sign(
      { sub: userId, [ML_OAUTH_STATE_PROP]: true },
      { expiresIn: '15m' },
    );
  }

  verifyMercadoLibreOAuthState(state: string): string {
    let payload: { sub?: string; ml_oauth?: boolean };
    try {
      payload = this.jwt.verify<{ sub?: string; ml_oauth?: boolean }>(state);
    } catch {
      throw new UnauthorizedException('Parâmetro state inválido ou expirado.');
    }
    if (!payload?.sub || payload[ML_OAUTH_STATE_PROP] !== true) {
      throw new UnauthorizedException('State OAuth inválido.');
    }
    return payload.sub;
  }

  authorizationUrlMercadoLibre(userId: string): { authorizationUrl: string } {
    const state = this.signMercadoLibreOAuthState(userId);
    return {
      authorizationUrl:
        this.mercadoLibreOAuth.buildAuthorizationUrl(state),
    };
  }

  async completeMercadoLibreOAuth(code: string, state: string) {
    const userId = this.verifyMercadoLibreOAuthState(state);
    const tokens = await this.mercadoLibreOAuth.exchangeCodeForTokens(code);
    await this.mercadoLibreToken.persistTokensForUser(userId, tokens);
    const me = await this.mercadoLibreOAuth.getMe(tokens.access_token);
    await this.prisma.user.update({
      where: { id: userId },
      data: { mlUserId: String(me.id) },
    });
    return { connected: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userWithMlStatusSelect,
    });
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado.');
    }
    return { user: toPublicUser(user) };
  }
}
