import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  extractMercadoLivreErrorMessage,
  mercadoLivreFetch,
  mercadoLivreRequestJson,
  parseMercadoLivreJson,
  parseMercadoLivreJsonLenient,
  readMercadoLivreResponseText,
  throwMercadoLivreHttpError,
} from '../common/mercadolivre-http';

const DEFAULT_AUTH_URL =
  'https://auth.mercadolivre.com.br/authorization';
const TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';
const ML_API_BASE = 'https://api.mercadolibre.com';

const DEFAULT_EXPIRES_IN_SEC = 6 * 60 * 60;

export interface MercadoLivreTokenBundle {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: Date;
}

@Injectable()
export class MercadoLivreOAuthService {
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

  async exchangeCodeForTokens(code: string): Promise<MercadoLivreTokenBundle> {
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
    const data = await mercadoLivreRequestJson<Partial<{ id: number }>>(
      `${ML_API_BASE}/users/me`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken.trim()}`,
          Accept: 'application/json',
        },
      },
      'buscar dados do usuário',
    );

    const parsed = data;
    if (typeof parsed.id !== 'number') {
      throw new InternalServerErrorException(
        'Resposta do Mercado Livre sem id de usuário.',
      );
    }

    return { id: parsed.id };
  }

  async refreshTokens(refreshToken: string): Promise<MercadoLivreTokenBundle> {
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
  ): Promise<MercadoLivreTokenBundle> {
    const res = await mercadoLivreFetch(
      TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
      },
      actionLabel,
    );

    const raw = await readMercadoLivreResponseText(res, actionLabel);

    if (!res.ok) {
      const errorBody = parseMercadoLivreJsonLenient(raw);
      if (res.status === 400 || res.status === 401) {
        throw new BadRequestException(
          extractMercadoLivreErrorMessage(
            errorBody,
            `${actionLabel}. Verifique se a conta ainda está conectada`,
          ),
        );
      }
      throwMercadoLivreHttpError(res.status, errorBody, actionLabel);
    }

    return this.parseTokenResponse(parseMercadoLivreJson(raw, actionLabel));
  }

  private parseTokenResponse(data: unknown): MercadoLivreTokenBundle {
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
