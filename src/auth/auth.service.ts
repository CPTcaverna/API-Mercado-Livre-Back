import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoLivreOAuthService } from './mercadolivre-oauth.service';
import { MercadoLivreTokenService } from './mercadolivre-token.service';
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
    private readonly mercadoLivreOAuth: MercadoLivreOAuthService,
    private readonly mercadoLivreToken: MercadoLivreTokenService,
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

  signMercadoLivreOAuthState(userId: string): string {
    return this.jwt.sign(
      { sub: userId, [ML_OAUTH_STATE_PROP]: true },
      { expiresIn: '15m' },
    );
  }

  verifyMercadoLivreOAuthState(state: string): string {
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

  authorizationUrlMercadoLivre(userId: string): { authorizationUrl: string } {
    const state = this.signMercadoLivreOAuthState(userId);
    return {
      authorizationUrl:
        this.mercadoLivreOAuth.buildAuthorizationUrl(state),
    };
  }

  async completeMercadoLivreOAuth(code: string, state: string) {
    const userId = this.verifyMercadoLivreOAuthState(state);
    const tokens = await this.mercadoLivreOAuth.exchangeCodeForTokens(code);
    await this.mercadoLivreToken.persistTokensForUser(userId, tokens);
    const me = await this.mercadoLivreOAuth.getMe(tokens.access_token);
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
