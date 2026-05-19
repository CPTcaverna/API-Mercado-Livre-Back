import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

const DEFAULT_TIMEOUT_MS = 30_000;

export function mercadoLivreFetchInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  };
}

/**
 * Dispara fetch ao Mercado Livre com timeout e trata falhas de rede.
 * Não interpreta o corpo — use {@link mercadoLivreRequestJson} na maioria dos casos.
 */
export async function mercadoLivreFetch(
  url: string,
  init: RequestInit | undefined,
  actionLabel: string,
): Promise<Response> {
  try {
    return await fetch(url, mercadoLivreFetchInit(init));
  } catch (err) {
    if (err instanceof HttpException) {
      throw err;
    }
    throwMercadoLivreNetworkError(actionLabel, err);
  }
}

/**
 * Fetch + leitura segura do corpo + validação de `res.ok` antes de interpretar JSON.
 */
export async function mercadoLivreRequestJson<T>(
  url: string,
  init: RequestInit | undefined,
  actionLabel: string,
): Promise<T> {
  const res = await mercadoLivreFetch(url, init, actionLabel);
  const raw = await readMercadoLivreResponseText(res, actionLabel);

  if (!res.ok) {
    throwMercadoLivreHttpError(
      res.status,
      parseMercadoLivreJsonLenient(raw),
      actionLabel,
    );
  }

  return parseMercadoLivreJson(raw, actionLabel) as T;
}

/** Lê o corpo da resposta; falhas de leitura viram erro de gateway. */
export async function readMercadoLivreResponseText(
  res: Response,
  actionLabel: string,
): Promise<string> {
  try {
    return await res.text();
  } catch (err) {
    throwMercadoLivreNetworkError(actionLabel, err);
  }
}

/** Corpo de erro: vazio ou JSON inválido não quebram o fluxo. */
export function parseMercadoLivreJsonLenient(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return {};
  }
}

/** Corpo de sucesso: exige JSON válido. */
export function parseMercadoLivreJson(
  raw: string,
  actionLabel: string,
): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new InternalServerErrorException(
      `Resposta vazia ao ${actionLabel} no Mercado Livre.`,
    );
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new InternalServerErrorException(
      `Resposta inválida ao ${actionLabel} no Mercado Livre.`,
    );
  }
}

export function extractMercadoLivreErrorMessage(
  data: unknown,
  actionLabel: string,
): string {
  if (typeof data !== 'object' || data === null) {
    return `Falha ao ${actionLabel} no Mercado Livre.`;
  }

  const record = data as Record<string, unknown>;
  const causes = record.cause;
  if (Array.isArray(causes) && causes.length > 0) {
    const parts = causes
      .map((c) => {
        if (typeof c !== 'object' || c === null) return null;
        const row = c as Record<string, unknown>;
        return typeof row.message === 'string' ? row.message : null;
      })
      .filter((m): m is string => Boolean(m));
    if (parts.length > 0) return parts.join(' ');
  }

  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message;
  }
  if (typeof record.error === 'string' && record.error.trim()) {
    return record.error;
  }

  return `Falha ao ${actionLabel} no Mercado Livre.`;
}

export function throwMercadoLivreHttpError(
  status: number,
  data: unknown,
  actionLabel: string,
): never {
  const message = extractMercadoLivreErrorMessage(data, actionLabel);

  if (status === 401 || status === 403) {
    throw new UnauthorizedException(
      status === 401
        ? 'Sessão do Mercado Livre expirada. Conecte a conta novamente.'
        : message,
    );
  }
  if (status === 404) {
    throw new NotFoundException(message);
  }
  if (status === 408 || status === 504) {
    throw new GatewayTimeoutException(
      `Tempo esgotado ao ${actionLabel} no Mercado Livre. Tente novamente.`,
    );
  }
  if (status === 429) {
    throw new BadGatewayException(
      'Muitas requisições ao Mercado Livre. Aguarde um momento e tente de novo.',
    );
  }
  if (status === 503) {
    throw new ServiceUnavailableException(
      `O Mercado Livre está temporariamente indisponível. Não foi possível ${actionLabel}. Tente novamente em instantes.`,
    );
  }
  if (status >= 500) {
    throw new BadGatewayException(
      `O Mercado Livre retornou um erro (${status}). Não foi possível ${actionLabel}. Tente novamente em instantes.`,
    );
  }
  if (status === 400 || status === 422) {
    throw new BadRequestException(message);
  }

  throw new BadRequestException(message);
}

export function throwMercadoLivreNetworkError(
  actionLabel: string,
  cause?: unknown,
): never {
  const isTimeout =
    cause instanceof Error &&
    (cause.name === 'TimeoutError' || cause.name === 'AbortError');

  if (isTimeout) {
    throw new GatewayTimeoutException(
      `Tempo esgotado ao ${actionLabel} no Mercado Livre. Verifique sua conexão e tente novamente.`,
    );
  }

  throw new BadGatewayException(
    `Não foi possível comunicar com o Mercado Livre para ${actionLabel}. Verifique sua conexão ou tente novamente em instantes.`,
  );
}
