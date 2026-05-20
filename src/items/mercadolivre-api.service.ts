import { Injectable } from '@nestjs/common';
import { mercadoLivreRequestJson } from '../common/mercadolivre-http';
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
  listing_type_id?: string;
}

export interface MercadoLivreItemDetail extends MercadoLivreItemSnapshot {
  currency_id?: string;
  condition?: string;
  permalink?: string;
  sold_quantity?: number;
  initial_quantity?: number;
  pictures?: Array<{
    id?: string;
    url?: string;
    secure_url?: string;
    source?: string;
  }>;
  attributes?: Array<{
    id: string;
    name: string;
    value_id?: string | null;
    value_name?: string | null;
  }>;
}

export interface MercadoLivreCategoryInfo {
  id: string;
  name: string;
}

export interface MercadoLivreRelistPayload {
  price: number;
  quantity: number;
  listing_type_id: string;
}

export interface MercadoLivreOrderSnapshot {
  id: number;
  order_items?: Array<{
    item?: { id?: string };
  }>;
}

export interface MercadoLivreUserItemsSearch {
  results: string[];
  paging: {
    limit: number;
    offset: number;
    total: number;
  };
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

export interface MercadoLivreDomainDiscoveryResult {
  domain_id: string;
  domain_name: string;
  category_id: string;
  category_name: string;
}

export interface MercadoLivreCategoryAttribute {
  id: string;
  name: string;
  tags?: {
    required?: boolean;
    catalog_required?: boolean;
    conditional_required?: boolean;
    catalog_listing_required?: boolean;
    hidden?: boolean;
    read_only?: boolean;
    used_hidden?: boolean;
  };
  value_type?: string;
  values?: { id: string; name: string }[];
  hint?: string;
  example?: string;
  default_unit?: string;
  allowed_units?: { id: string; name: string }[];
  value_max_length?: number;
  hierarchy?: string;
}

function filterPublishRequiredAttributes(
  all: MercadoLivreCategoryAttribute[],
): MercadoLivreCategoryAttribute[] {
  return all.filter((attr) => {
    const tags = attr.tags;
    if (tags?.hidden || tags?.read_only || tags?.used_hidden) return false;
    if (tags?.conditional_required || tags?.catalog_listing_required) return false;
    if (tags?.required) return true;
    if (attr.hierarchy === 'CHILD_PK') return true;
    return false;
  });
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
    payload: MercadoLivreRelistPayload,
  ): Promise<MercadoLivreItemSnapshot> {
    return this.requestJson<MercadoLivreItemSnapshot>(
      `/items/${encodeURIComponent(mlItemId)}/relist`,
      accessToken,
      { method: 'POST', body: JSON.stringify(payload) },
      'reativar o anúncio',
    );
  }

  async getItem(
    accessToken: string,
    mlItemId: string,
  ): Promise<MercadoLivreItemDetail> {
    return this.requestJson<MercadoLivreItemDetail>(
      `/items/${encodeURIComponent(mlItemId)}`,
      accessToken,
      { method: 'GET' },
      'buscar o anúncio',
    );
  }

  async getCategoryInfo(categoryId: string): Promise<MercadoLivreCategoryInfo> {
    return this.requestJson<MercadoLivreCategoryInfo>(
      `/categories/${encodeURIComponent(categoryId)}`,
      null,
      { method: 'GET' },
      'buscar categoria',
    );
  }

  async searchUserItemIds(
    accessToken: string,
    mlUserId: string,
    options: { offset?: number; limit?: number } = {},
  ): Promise<MercadoLivreUserItemsSearch> {
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 50;
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });

    return this.requestJson<MercadoLivreUserItemsSearch>(
      `/users/${encodeURIComponent(mlUserId)}/items/search?${params.toString()}`,
      accessToken,
      { method: 'GET' },
      'listar anúncios do vendedor',
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

  async domainDiscoverySearch(
    siteId: string,
    query: string,
  ): Promise<MercadoLivreDomainDiscoveryResult[]> {
    const params = new URLSearchParams({ q: query.trim() });
    return this.requestJson<MercadoLivreDomainDiscoveryResult[]>(
      `/sites/${encodeURIComponent(siteId)}/domain_discovery/search?${params.toString()}`,
      null,
      { method: 'GET' },
      'prever categoria pelo título',
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

    const required = filterPublishRequiredAttributes(all);

    return { required, all };
  }

  async getConditionalRequiredAttributes(
    accessToken: string,
    categoryId: string,
    payload: Record<string, unknown>,
  ): Promise<Array<{ id: string; name: string }>> {
    const result = await this.requestJson<{
      required_attributes?: Array<{ id: string; name: string }>;
    }>(
      `/categories/${encodeURIComponent(categoryId)}/attributes/conditional`,
      accessToken,
      { method: 'POST', body: JSON.stringify(payload) },
      'validar atributos condicionais',
    );
    return result.required_attributes ?? [];
  }

  private requestJson<T>(
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

    return mercadoLivreRequestJson<T>(
      `${ML_API_BASE}${path}`,
      { ...init, headers },
      actionLabel,
    );
  }
}
