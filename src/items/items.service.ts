import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoLibreTokenService } from '../auth/mercadolibre-token.service';
import type { CreateItemDto } from './dto/create-item.dto';
import type { UpdateItemDto } from './dto/update-item.dto';
import {
  MercadoLibreApiService,
  type MercadoLibreItemSnapshot,
  type MercadoLibreUpdateItemPayload,
} from './mercadolibre-api.service';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mlToken: MercadoLibreTokenService,
    private readonly mlApi: MercadoLibreApiService,
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

    const updated = await this.prisma.item.update({
      where: { id: item.id },
      data: {
        active: false,
        ...this.mapMlToDb(mlItem),
      },
    });

    return { item: updated };
  }

  async reactivate(userId: string, id: string) {
    const item = await this.findOwnedItem(userId, id);
    if (item.active) {
      throw new BadRequestException('Anúncio já está ativo.');
    }

    const accessToken = await this.mlToken.getValidMlAccessToken(userId);
    let mlItem: MercadoLibreItemSnapshot;

    if (item.status === 'paused') {
      mlItem = await this.mlApi.updateItem(accessToken, item.mlItemId, {
        status: 'active',
      });
    } else {
      mlItem = await this.mlApi.relistItem(accessToken, item.mlItemId);
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

  async findAllByUser(userId: string, includeInactive = false) {
    const items = await this.prisma.item.findMany({
      where: {
        userId,
        ...(includeInactive ? {} : { active: true }),
      },
      orderBy: { createdAt: 'desc' },
    });
    return { items };
  }

  async findOneForUser(userId: string, id: string) {
    const item = await this.findOwnedItem(userId, id);
    return { item };
  }

  async syncFromMercadoLivre(userId: string, mlItemId: string) {
    const accessToken = await this.mlToken.getValidMlAccessToken(userId);
    const mlItem = await this.mlApi.getItem(accessToken, mlItemId);
    const data = {
      ...this.mapMlToDb(mlItem),
      active: mlItem.status !== 'closed',
    };

    const item = await this.prisma.item.upsert({
      where: { mlItemId },
      create: { userId, ...data },
      update: data,
    });

    return { item };
  }

  async syncFromMercadoLivreByMlUserId(mlUserId: string, mlItemId: string) {
    const user = await this.prisma.user.findFirst({
      where: { mlUserId: String(mlUserId) },
      select: { id: true },
    });
    if (!user) {
      return { synced: false as const, reason: 'user_not_found' };
    }
    const result = await this.syncFromMercadoLivre(user.id, mlItemId);
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

  private buildUpdatePayload(dto: UpdateItemDto): MercadoLibreUpdateItemPayload {
    const payload: MercadoLibreUpdateItemPayload = {};

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

  private mapMlToDb(ml: MercadoLibreItemSnapshot) {
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
