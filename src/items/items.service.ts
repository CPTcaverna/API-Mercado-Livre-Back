import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoLivreTokenService } from '../auth/mercadolivre-token.service';
import type { CreateItemDto } from './dto/create-item.dto';
import type { ResolveCategoryAttributesDto } from './dto/resolve-category-attributes.dto';
import type { UpdateItemDto } from './dto/update-item.dto';
import {
  MercadoLivreApiService,
  type MercadoLivreItemSnapshot,
  type MercadoLivreUpdateItemPayload,
} from './mercadolivre-api.service';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mlToken: MercadoLivreTokenService,
    private readonly mlApi: MercadoLivreApiService,
  ) {}

  async predictCategoryFromTitle(query: string, siteId = 'MLB') {
    const term = query.trim();
    if (term.length < 3) {
      throw new BadRequestException(
        'Informe um título com pelo menos 3 caracteres para prever a categoria.',
      );
    }

    const normalizedSite = siteId.trim().toUpperCase();
    if (!/^ML[A-Z]$/.test(normalizedSite)) {
      throw new BadRequestException('siteId inválido (ex.: MLB).');
    }

    const results = await this.mlApi.domainDiscoverySearch(normalizedSite, term);
    const suggestions = results
      .filter((row) => row.category_id?.trim() && row.category_name?.trim())
      .map((row) => ({
        category_id: row.category_id.trim().toUpperCase(),
        category_name: row.category_name.trim(),
        domain_id: row.domain_id?.trim() ?? null,
        domain_name: row.domain_name?.trim() ?? null,
      }));

    return {
      query: term,
      site_id: normalizedSite,
      suggestions,
      predicted: suggestions[0] ?? null,
    };
  }

  async create(userId: string, dto: CreateItemDto) {
    const accessToken = await this.mlToken.getValidMlAccessToken(userId);
    const pictureSource = dto.pictures[0]?.source?.trim();

    const mlItem = await this.mlApi.createItem(accessToken, {
      title: dto.title,
      category_id: dto.category_id,
      price: dto.price,
      available_quantity: dto.available_quantity,
      condition: dto.condition,
      listing_type_id: dto.listing_type_id,
      pictures: dto.pictures,
      attributes: dto.attributes.map((attr) => ({
        id: attr.id,
        ...(attr.value_id ? { value_id: attr.value_id } : {}),
        ...(attr.value_name ? { value_name: attr.value_name } : {}),
      })),
      currency_id: 'BRL',
      buying_mode: 'buy_it_now',
      shipping: {
        mode: 'me2',
        local_pick_up: false,
      },
    });

    const mlData = this.mapMlToDb(mlItem);
    const item = await this.prisma.item.create({
      data: {
        userId,
        active: true,
        ...mlData,
        thumbnail: pictureSource ?? mlData.thumbnail,
      },
    });

    return { item };
  }

  async update(userId: string, id: string, dto: UpdateItemDto) {
    const item = await this.findOwnedItem(userId, id);
    this.ensureItemIsActive(item);

    const payload = this.buildUpdatePayload(dto);
    if (Object.keys(payload).length === 0) {
      throw new BadRequestException('Envie ao menos um campo para atualizar.');
    }

    const accessToken = await this.mlToken.getValidMlAccessToken(userId);
    const mlItem = await this.mlApi.updateItem(
      accessToken,
      item.mlItemId,
      payload,
    );

    const pictureSource = dto.pictures?.[0]?.source?.trim();
    const mlData = this.mapMlToDb(mlItem);
    const updated = await this.prisma.item.update({
      where: { id: item.id },
      data: {
        ...mlData,
        ...(pictureSource ? { thumbnail: pictureSource } : {}),
      },
    });

    return { item: updated };
  }

  async deactivate(userId: string, id: string) {
    const item = await this.findOwnedItem(userId, id);
    if (!item.active) {
      throw new BadRequestException('Anúncio já está inativo.');
    }

    const accessToken = await this.mlToken.getValidMlAccessToken(userId);
    const mlItem = await this.mlApi.closeItem(accessToken, item.mlItemId);
    if (mlItem.status !== 'closed') {
      throw new BadRequestException(
        'Não foi possível inativar o anúncio no Mercado Livre.',
      );
    }

    const updated = await this.prisma.item.update({
      where: { id: item.id },
      data: {
        active: false,
        ...this.mapMlToDb(mlItem),
      },
    });

    return { item: updated };
  }

  async removeInactive(userId: string, id: string) {
    const item = await this.findOwnedItem(userId, id);
    if (item.active) {
      throw new BadRequestException(
        'Inative o anúncio antes de excluir.',
      );
    }

    const accessToken = await this.mlToken.getValidMlAccessToken(userId);
    await this.ensureItemClosedOnMl(accessToken, item.mlItemId);

    await this.prisma.item.delete({ where: { id: item.id } });
    return { ok: true };
  }

  async reactivate(userId: string, id: string) {
    const item = await this.findOwnedItem(userId, id);
    if (item.active) {
      throw new BadRequestException('Anúncio já está ativo.');
    }

    const accessToken = await this.mlToken.getValidMlAccessToken(userId);
    let mlItem: MercadoLivreItemSnapshot;

    if (item.status === 'paused') {
      mlItem = await this.mlApi.updateItem(accessToken, item.mlItemId, {
        status: 'active',
      });
    } else {
      const snapshot = await this.mlApi.getItem(accessToken, item.mlItemId);
      mlItem = await this.mlApi.relistItem(accessToken, item.mlItemId, {
        price: item.price,
        quantity: item.availableQty,
        listing_type_id: snapshot.listing_type_id?.trim() || 'silver',
      });
    }

    if (mlItem.status === 'closed') {
      throw new BadRequestException(
        'Não foi possível reativar o anúncio no Mercado Livre.',
      );
    }

    const updated = await this.prisma.item.update({
      where: { id: item.id },
      data: {
        active: true,
        ...this.mapMlToDb(mlItem),
      },
    });

    return { item: updated };
  }

  getCategoryAttributes(categoryId: string) {
    if (!/^ML[A-Z]\d+$/.test(categoryId)) {
      throw new BadRequestException('categoryId inválido (ex.: MLB3530).');
    }
    return this.mlApi.getCategoryAttributes(categoryId);
  }

  async resolveCategoryAttributes(
    userId: string,
    categoryId: string,
    dto: ResolveCategoryAttributesDto,
  ) {
    if (!/^ML[A-Z]\d+$/.test(categoryId)) {
      throw new BadRequestException('categoryId inválido (ex.: MLB3530).');
    }

    const base = await this.mlApi.getCategoryAttributes(categoryId);
    const requiredIds = new Set(base.required.map((attr) => attr.id));

    try {
      const accessToken = await this.mlToken.getValidMlAccessToken(userId);
      const conditional = await this.mlApi.getConditionalRequiredAttributes(
        accessToken,
        categoryId,
        {
          category_id: categoryId,
          title: dto.title?.trim() || 'Produto',
          condition: dto.condition ?? 'new',
          buying_mode: 'buy_it_now',
          listing_type_id: dto.listing_type_id ?? 'gold_special',
          currency_id: 'BRL',
          attributes: dto.attributes.map((attr) => ({
            id: attr.id,
            ...(attr.value_id ? { value_id: attr.value_id } : {}),
            ...(attr.value_name ? { value_name: attr.value_name } : {}),
          })),
        },
      );
      for (const row of conditional) {
        requiredIds.add(row.id);
      }
    } catch {
      // Mantém obrigatórios base se a validação condicional falhar.
    }

    const required = base.all.filter((attr) => requiredIds.has(attr.id));

    return { required, all: base.all };
  }

  async findAllByUser(
    userId: string,
    options: {
      q?: string;
      visibility?: 'all' | 'active' | 'inactive';
      status?: string;
      stock?: 'all' | 'in' | 'out';
      sort?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const term = options.q?.trim();
    const visibility = options.visibility ?? 'active';
    const statusFilter = options.status?.trim();
    const stock = options.stock ?? 'all';
    const pageSize = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const requestedPage = Math.max(options.page ?? 1, 1);

    const where = {
      userId,
      ...(visibility === 'active'
        ? { active: true }
        : visibility === 'inactive'
          ? { active: false }
          : {}),
      ...(statusFilter && statusFilter !== 'all' ? { status: statusFilter } : {}),
      ...(stock === 'in'
        ? { availableQty: { gt: 0 } }
        : stock === 'out'
          ? { availableQty: 0 }
          : {}),
      ...(term
        ? {
            OR: [
              { title: { contains: term, mode: 'insensitive' as const } },
              { mlItemId: { contains: term, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const total = await this.prisma.item.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const skip = (page - 1) * pageSize;

    const items = await this.prisma.item.findMany({
      where,
      orderBy: this.resolveItemOrderBy(options.sort),
      skip,
      take: pageSize,
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  private resolveItemOrderBy(sort?: string) {
    switch (sort) {
      case 'oldest':
        return { createdAt: 'asc' as const };
      case 'price_asc':
        return { price: 'asc' as const };
      case 'price_desc':
        return { price: 'desc' as const };
      case 'title_asc':
        return { title: 'asc' as const };
      case 'title_desc':
        return { title: 'desc' as const };
      case 'newest':
      default:
        return { createdAt: 'desc' as const };
    }
  }

  async findOneForUser(userId: string, id: string) {
    const local = await this.findOwnedItem(userId, id);
    const base = {
      id: local.id,
      mlItemId: local.mlItemId,
      title: local.title,
      price: local.price,
      availableQty: local.availableQty,
      status: local.status,
      active: local.active,
      thumbnail: local.thumbnail,
      categoryId: local.categoryId,
      createdAt: local.createdAt.toISOString(),
      updatedAt: local.updatedAt.toISOString(),
    };

    try {
      const accessToken = await this.mlToken.getValidMlAccessToken(userId);
      const ml = await this.mlApi.getItem(accessToken, local.mlItemId);

      let categoryName: string | null = null;
      if (ml.category_id) {
        try {
          const category = await this.mlApi.getCategoryInfo(ml.category_id);
          categoryName = category.name;
        } catch {
          categoryName = null;
        }
      }

      const pictures = (ml.pictures ?? [])
        .map((pic) => pic.secure_url ?? pic.url ?? pic.source ?? '')
        .filter((url) => url.length > 0);

      const attributes = (ml.attributes ?? [])
        .filter((attr) => attr.value_name || attr.value_id)
        .map((attr) => ({
          id: attr.id,
          name: attr.name,
          value_name: attr.value_name ?? undefined,
          value_id: attr.value_id ?? undefined,
        }));

      return {
        item: {
          ...base,
          permalink: ml.permalink ?? null,
          condition: ml.condition ?? null,
          listingTypeId: ml.listing_type_id ?? null,
          currencyId: ml.currency_id ?? null,
          categoryName,
          soldQuantity: ml.sold_quantity ?? null,
          pictures,
          attributes,
        },
      };
    } catch {
      return { item: base };
    }
  }

  async importAllFromMercadoLivre(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mlUserId: true },
    });
    if (!user?.mlUserId?.trim()) {
      throw new BadRequestException(
        'Conta Mercado Livre não conectada. Conecte antes de importar.',
      );
    }

    const accessToken = await this.mlToken.getValidMlAccessToken(userId);
    const mlUserId = user.mlUserId.trim();
    const limit = 50;
    let offset = 0;
    let totalOnMl = 0;

    const summary = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [] as string[],
    };

    do {
      const page = await this.mlApi.searchUserItemIds(accessToken, mlUserId, {
        offset,
        limit,
      });
      totalOnMl = page.paging?.total ?? page.results.length;

      for (const mlItemId of page.results) {
        try {
          const result = await this.syncFromMercadoLivre(userId, mlItemId);
          if (result.action === 'created') summary.created += 1;
          else if (result.action === 'updated') summary.updated += 1;
          else summary.skipped += 1;
        } catch (err) {
          summary.failed += 1;
          if (summary.errors.length < 10) {
            const msg =
              err instanceof Error ? err.message : 'Erro desconhecido';
            summary.errors.push(`${mlItemId}: ${msg}`);
          }
        }
      }

      offset += page.results.length;
      if (page.results.length === 0) break;
    } while (offset < totalOnMl);

    return {
      ...summary,
      totalOnMercadoLivre: totalOnMl,
      processed: summary.created + summary.updated + summary.skipped + summary.failed,
    };
  }

  async syncFromMercadoLivre(userId: string, mlItemId: string) {
    const normalizedId = mlItemId.trim().toUpperCase();
    const existing = await this.prisma.item.findUnique({
      where: { mlItemId: normalizedId },
    });

    if (existing && existing.userId !== userId) {
      return {
        item: existing,
        action: 'skipped' as const,
        reason: 'owned_by_other_user' as const,
      };
    }

    const accessToken = await this.mlToken.getValidMlAccessToken(userId);
    const mlItem = await this.mlApi.getItem(accessToken, normalizedId);
    const data = {
      ...this.mapMlToDb(mlItem),
      active: mlItem.status !== 'closed',
    };

    const item = await this.prisma.item.upsert({
      where: { mlItemId: normalizedId },
      create: { userId, ...data },
      update: data,
    });

    return {
      item,
      action: (existing ? 'updated' : 'created') as 'updated' | 'created',
    };
  }

  async syncFromMercadoLivreByMlUserId(mlUserId: string, mlItemId: string) {
    const user = await this.prisma.user.findFirst({
      where: { mlUserId: String(mlUserId) },
      select: { id: true },
    });
    if (!user) {
      return { synced: false as const, reason: 'user_not_found' as const };
    }
    const result = await this.syncFromMercadoLivre(user.id, mlItemId);
    if (result.action === 'skipped') {
      return {
        synced: false as const,
        reason: result.reason,
        item: result.item,
      };
    }
    return { synced: true as const, ...result };
  }

  private async findOwnedItem(userId: string, id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, userId },
    });
    if (!item) {
      throw new NotFoundException('Anúncio não encontrado.');
    }
    return item;
  }

  private ensureItemIsActive(item: { active: boolean }) {
    if (!item.active) {
      throw new BadRequestException(
        'Anúncio inativo. Reative antes de atualizar.',
      );
    }
  }

  private async ensureItemClosedOnMl(
    accessToken: string,
    mlItemId: string,
  ): Promise<void> {
    let mlItem = await this.mlApi.getItem(accessToken, mlItemId);

    if (mlItem.status !== 'closed') {
      mlItem = await this.mlApi.closeItem(accessToken, mlItemId);
    }

    if (mlItem.status !== 'closed') {
      throw new BadRequestException(
        'Não foi possível encerrar o anúncio no Mercado Livre. Exclusão cancelada.',
      );
    }
  }

  private buildUpdatePayload(dto: UpdateItemDto): MercadoLivreUpdateItemPayload {
    const payload: MercadoLivreUpdateItemPayload = {};

    if (dto.title !== undefined) payload.title = dto.title;
    if (dto.price !== undefined) payload.price = dto.price;
    if (dto.available_quantity !== undefined) {
      payload.available_quantity = dto.available_quantity;
    }
    if (dto.pictures?.length) {
      payload.pictures = dto.pictures.map((p) => ({ source: p.source }));
    }
    if (dto.attributes?.length) {
      payload.attributes = dto.attributes.map((attr) => ({
        id: attr.id,
        ...(attr.value_id ? { value_id: attr.value_id } : {}),
        ...(attr.value_name ? { value_name: attr.value_name } : {}),
      }));
    }

    return payload;
  }

  private mapMlToDb(ml: MercadoLivreItemSnapshot) {
    return {
      mlItemId: ml.id,
      title: ml.title,
      price: ml.price,
      availableQty: ml.available_quantity,
      status: ml.status,
      thumbnail: ml.thumbnail ?? null,
      categoryId: ml.category_id,
    };
  }
}
