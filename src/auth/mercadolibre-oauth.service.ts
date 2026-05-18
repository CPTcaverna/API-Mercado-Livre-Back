import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

const DEFAULT_AUTH_URL =
  'https://auth.mercadolivre.com.br/authorization';
const TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';

const DEFAULT_EXPIRES_IN_SEC = 6 * 60 * 60;

export interface MercadoLibreTokenBundle {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: Date;
}

@Injectable()
export class MercadoLibreOAuthService {
  private get clientId(): string {
    const v = process.env.ML_CLIENT_ID;
    if (!v?.trim()) {
      throw new InternalServerErrorException(
        'ML_CLIENT_ID não configurado no ambiente.',
      );
    }
    return v.trim();
  }

  private get clientSecret(): string {
    const v = process.env.ML_CLIENT_SECRET;
    if (!v?.trim()) {
      throw new InternalServerErrorException(
        'ML_CLIENT_SECRET não configurado no ambiente.',
      );
    }
    return v.trim();
  }

  private get redirectUri(): string {
    const v = process.env.ML_REDIRECT_URI;
    if (!v?.trim()) {
      throw new InternalServerErrorException(
        'ML_REDIRECT_URI não configurado no ambiente.',
      );
    }
    return v.trim();
  }

  private get authorizationBaseUrl(): string {
    return process.env.ML_AUTH_URL?.trim() || DEFAULT_AUTH_URL;
  }

  buildAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
    });
    const base = this.authorizationBaseUrl;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<MercadoLibreTokenBundle> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: code.trim(),
      redirect_uri: this.redirectUri,
    });
    return this.requestTokens(body, 'trocar o código por tokens');
  }

  async getMe(accessToken: string): Promise<{ id: number }> {
    const res = await fetch('https://api.mercadolibre.com/users/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
        Accept: 'application/json',
      },
    });

    const raw = await res.text();
    let data: unknown;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new InternalServerErrorException(
        'Resposta inválida ao buscar dados do usuário.',
      );
    }

    if (!res.ok) {
      throw new BadRequestException(
        `Falha ao buscar dados do usuário (${res.status}).`,
      );
    }

    const parsed = data as Partial<{ id: number }>;
    if (typeof parsed.id !== 'number') {
      throw new InternalServerErrorException(
        'Resposta do Mercado Livre sem id de usuário.',
      );
    }

    return { id: parsed.id };
  }

  async refreshTokens(refreshToken: string): Promise<MercadoLibreTokenBundle> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken.trim(),
    });
    return this.requestTokens(body, 'renovar o access token');
  }

  private async requestTokens(
    body: URLSearchParams,
    actionLabel: string,
  ): Promise<MercadoLibreTokenBundle> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    const raw = await res.text();
    let data: unknown;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new InternalServerErrorException(
        `Resposta inválida ao ${actionLabel}.`,
      );
    }

    if (!res.ok) {
      const message =
        typeof data === 'object' &&
        data !== null &&
        'message' in data &&
        typeof (data as { message: unknown }).message === 'string'
          ? (data as { message: string }).message
          : typeof data === 'object' &&
              data !== null &&
              'error' in data &&
              typeof (data as { error: unknown }).error === 'string'
            ? (data as { error: string }).error
            : `Falha ao ${actionLabel} (${res.status})`;
      throw new BadRequestException(message);
    }

    return this.parseTokenResponse(data);
  }

  private parseTokenResponse(data: unknown): MercadoLibreTokenBundle {
    const parsed = data as Partial<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>;

    if (!parsed.access_token || !parsed.refresh_token) {
      throw new InternalServerErrorException(
        'Resposta do Mercado Livre sem access_token ou refresh_token.',
      );
    }

    const expires_in =
      typeof parsed.expires_in === 'number' && parsed.expires_in > 0
        ? parsed.expires_in
        : DEFAULT_EXPIRES_IN_SEC;

    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      expires_in,
      expires_at: new Date(Date.now() + expires_in * 1000),
    };
  }
}
