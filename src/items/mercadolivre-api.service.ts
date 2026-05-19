import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { CreateItemDto } from './dto/create-item.dto';

const ML_API_BASE = 'https://api.mercadolibre.com';

export type MercadoLivreCreateItemPayload = Omit<CreateItemDto, 'attributes'> & {
  currency_id: string;
  buying_mode: string;
  shipping: {
    mode: string;
    local_pick_up: boolean;
  };
  attributes: { id: string; value_id?: string; value_name?: string }[];
};

export interface MercadoLivreItemSnapshot {
  id: string;
  title: string;
  category_id: string;
  price: number;
  available_quantity: number;
  status: string;
  thumbnail?: string;
}

export interface MercadoLivreOrderSnapshot {
  id: number;
  order_items?: Array<{
    item?: { id?: string };
  }>;
}

export type MercadoLivreItemCreated = MercadoLivreItemSnapshot;

export type MercadoLivreUpdateItemPayload = Partial<{
  title: string;
  price: number;
  available_quantity: number;
  pictures: { source: string }[];
  attributes: { id: string; value_id?: string; value_name?: string }[];
  status: string;
}>;

export interface MercadoLivreCategoryAttribute {
  id: string;
  name: string;
  tags?: {
    required?: boolean;
    catalog_required?: boolean;
    hidden?: boolean;
  };
  value_type?: string;
  values?: { id: string; name: string }[];
  hint?: string;
}

@Injectable()
export class MercadoLivreApiService {
  async createItem(
    accessToken: string,
    payload: MercadoLivreCreateItemPayload,
  ): Promise<MercadoLivreItemCreated> {
    return this.requestJson<MercadoLivreItemCreated>(
      '/items',
      accessToken,
      { method: 'POST', body: JSON.stringify(payload) },
      'criar o anúncio',
    );
  }

  async updateItem(
    accessToken: string,
    mlItemId: string,
    payload: MercadoLivreUpdateItemPayload,
  ): Promise<MercadoLivreItemSnapshot> {
    return this.requestJson<MercadoLivreItemSnapshot>(
      `/items/${encodeURIComponent(mlItemId)}`,
      accessToken,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      'atualizar o anúncio',
    );
  }

  async closeItem(
    accessToken: string,
    mlItemId: string,
  ): Promise<MercadoLivreItemSnapshot> {
    return this.updateItem(accessToken, mlItemId, { status: 'closed' });
  }

  async relistItem(
    accessToken: string,
    mlItemId: string,
  ): Promise<MercadoLivreItemSnapshot> {
    return this.requestJson<MercadoLivreItemSnapshot>(
      `/items/${encodeURIComponent(mlItemId)}/relist`,
      accessToken,
      { method: 'POST', body: JSON.stringify({}) },
      'reativar o anúncio',
    );
  }

  async getItem(
    accessToken: string,
    mlItemId: string,
  ): Promise<MercadoLivreItemSnapshot> {
    return this.requestJson<MercadoLivreItemSnapshot>(
      `/items/${encodeURIComponent(mlItemId)}`,
      accessToken,
      { method: 'GET' },
      'buscar o anúncio',
    );
  }

  async getOrder(
    accessToken: string,
    orderId: string,
  ): Promise<MercadoLivreOrderSnapshot> {
    return this.requestJson<MercadoLivreOrderSnapshot>(
      `/orders/${encodeURIComponent(orderId)}`,
      accessToken,
      { method: 'GET' },
      'buscar o pedido',
    );
  }

  async getCategoryAttributes(
    categoryId: string,
  ): Promise<{ required: MercadoLivreCategoryAttribute[]; all: MercadoLivreCategoryAttribute[] }> {
    const all = await this.requestJson<MercadoLivreCategoryAttribute[]>(
      `/categories/${encodeURIComponent(categoryId)}/attributes`,
      null,
      { method: 'GET' },
      'buscar atributos da categoria',
    );

    const required = all.filter(
      (attr) =>
        attr.tags?.required === true || attr.tags?.catalog_required === true,
    );

    return { required, all };
  }

  private async requestJson<T>(
    path: string,
    accessToken: string | null,
    init: RequestInit,
    actionLabel: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    if (init.body) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${ML_API_BASE}${path}`, {
      ...init,
      headers,
    });

    const raw = await res.text();
    let data: unknown;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new InternalServerErrorException(
        `Resposta inválida ao ${actionLabel} no Mercado Livre.`,
      );
    }

    if (!res.ok) {
      throw new BadRequestException(this.extractMlErrorMessage(data, actionLabel));
    }

    return data as T;
  }

  private extractMlErrorMessage(data: unknown, actionLabel: string): string {
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
}
