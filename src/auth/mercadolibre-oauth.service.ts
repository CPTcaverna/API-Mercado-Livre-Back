import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

const DEFAULT_AUTH_URL =
  'https://auth.mercadolivre.com.br/authorization';
const TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';

export interface MercadoLibreTokens {
  access_token: string;
  refresh_token: string;
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

  async exchangeCodeForTokens(code: string): Promise<MercadoLibreTokens> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: code.trim(),
      redirect_uri: this.redirectUri,
    });

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
        'Resposta inválida ao trocar o código por tokens.',
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
            : `Falha na troca de token (${res.status})`;
      throw new BadRequestException(message);
    }

    const parsed = data as Partial<MercadoLibreTokens>;
    if (!parsed.access_token || !parsed.refresh_token) {
      throw new InternalServerErrorException(
        'Resposta do Mercado Livre sem access_token ou refresh_token.',
      );
    }

    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
    };
  }
}
