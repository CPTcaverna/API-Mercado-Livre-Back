import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  MercadoLibreOAuthService,
  type MercadoLibreTokenBundle,
} from './mercadolibre-oauth.service';

const EXPIRY_BUFFER_MS = 300_000;

@Injectable()
export class MercadoLibreTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoLibreOAuth: MercadoLibreOAuthService,
  ) {}

  async persistTokensForUser(
    userId: string,
    tokens: MercadoLibreTokenBundle,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mlAccessToken: tokens.access_token,
        mlRefreshToken: tokens.refresh_token,
        mlTokenExpiresAt: tokens.expires_at,
      },
    });
  }

  async getValidMlAccessToken(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        mlAccessToken: true,
        mlRefreshToken: true,
        mlTokenExpiresAt: true,
      },
    });

    if (!user?.mlAccessToken?.trim() || !user?.mlRefreshToken?.trim()) {
      throw new UnauthorizedException(
        'Conta Mercado Livre não conectada. Conecte novamente.',
      );
    }

    if (this.isAccessTokenStillValid(user.mlTokenExpiresAt)) {
      return user.mlAccessToken;
    }

    try {
      const tokens = await this.mercadoLibreOAuth.refreshTokens(
        user.mlRefreshToken,
      );
      await this.persistTokensForUser(userId, tokens);
      return tokens.access_token;
    } catch {
      await this.clearMlTokens(userId);
      throw new UnauthorizedException(
        'Sessão do Mercado Livre expirada. Conecte a conta novamente.',
      );
    }
  }

  private isAccessTokenStillValid(expiresAt: Date | null): boolean {
    if (!expiresAt) {
      return false;
    }
    return expiresAt.getTime() - EXPIRY_BUFFER_MS > Date.now();
  }

  private async clearMlTokens(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mlAccessToken: null,
        mlRefreshToken: null,
        mlTokenExpiresAt: null,
      },
    });
  }
}
