import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoLivreTokenService } from '../auth/mercadolivre-token.service';
import type { CreateItemDto } from './dto/create-item.dto';
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

  async create(userId: string, dto: CreateItemDto) {
    const accessToken = await this.mlToken.getValidMlAccessToken(userId);

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

    const item = await this.prisma.item.create({
      data: {
        userId,
        active: true,
        ...this.mapMlToDb(mlItem),
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

    const updated = await this.prisma.item.update({
      where: { id: item.id },
      data: this.mapMlToDb(mlItem),
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

  /**
   * Exclui do painel somente após encerrar no Mercado Livre.
   * Só anúncios inativos no app.
   */
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
      // Inativar usa status closed — republicar exige POST /relist com preço, estoque e tipo.
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

  async findAllByUser(
    userId: string,
    options: { includeInactive?: boolean; q?: string } = {},
  ) {
    const { includeInactive = false, q } = options;
    const term = q?.trim();

    const items = await this.prisma.item.findMany({
      where: {
        userId,
        ...(includeInactive ? {} : { active: true }),
        ...(term
          ? {
              OR: [
                { title: { contains: term, mode: 'insensitive' } },
                { mlItemId: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return { items };
  }

  async findOneForUser(userId: string, id: string) {
    const item = await this.findOwnedItem(userId, id);
    return { item };
  }

  /**
   * Importa todos os anúncios do vendedor no ML (upsert por mlItemId — sem duplicar).
   */
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

  /** Encerra no ML; só segue se o status final for closed. */
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
