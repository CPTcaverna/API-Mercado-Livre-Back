import { Injectable, Logger } from '@nestjs/common';
import { ItemsService } from '../items/items.service';
import { MercadoLivreApiService } from '../items/mercadolivre-api.service';
import { MercadoLivreTokenService } from '../auth/mercadolivre-token.service';
import { PrismaService } from '../prisma/prisma.service';
import type { MercadoLivreNotificationDto } from './dto/mercadolivre-notification.dto';

@Injectable()
export class MercadoLivreWebhookService {
  private readonly logger = new Logger(MercadoLivreWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly itemsService: ItemsService,
    private readonly mlApi: MercadoLivreApiService,
    private readonly mlToken: MercadoLivreTokenService,
  ) {}

  enqueueProcess(notification: MercadoLivreNotificationDto): void {
    setImmediate(() => {
      void this.process(notification).catch((err) => {
        this.logger.error(
          `Falha ao processar notificação ${notification.topic}: ${err instanceof Error ? err.message : err}`,
        );
      });
    });
  }

  private async process(notification: MercadoLivreNotificationDto) {
    const topic = notification.topic?.trim();
    const mlUserId = notification.user_id;
    const resource = notification.resource?.trim();

    if (!topic || mlUserId == null || !resource) {
      this.logger.warn('Notificação ignorada: campos obrigatórios ausentes.');
      return;
    }

    if (!this.isTrustedApplication(notification.application_id)) {
      this.logger.warn(
        `Notificação ignorada: application_id ${String(notification.application_id)}`,
      );
      return;
    }

    switch (topic) {
      case 'items':
        await this.handleItemsTopic(String(mlUserId), resource);
        break;
      case 'orders_v2':
        await this.handleOrdersTopic(String(mlUserId), resource);
        break;
      default:
        this.logger.debug(`Tópico não tratado: ${topic}`);
    }
  }

  private async handleItemsTopic(mlUserId: string, resource: string) {
    const mlItemId = extractResourceId(resource);
    if (!mlItemId) {
      this.logger.warn(`Resource de item inválido: ${resource}`);
      return;
    }

    const result = await this.itemsService.syncFromMercadoLivreByMlUserId(
      mlUserId,
      mlItemId,
    );

    if (!result.synced) {
      this.logger.warn(
        `Item ${mlItemId} não sincronizado (vendedor ML ${mlUserId} não encontrado).`,
      );
      return;
    }

    this.logger.log(`Item ${mlItemId} sincronizado via webhook items.`);
  }

  private async handleOrdersTopic(mlUserId: string, resource: string) {
    const orderId = extractResourceId(resource);
    if (!orderId) {
      this.logger.warn(`Resource de pedido inválido: ${resource}`);
      return;
    }

    const user = await this.prisma.user.findFirst({
      where: { mlUserId },
      select: { id: true },
    });
    if (!user) {
      this.logger.warn(`Pedido ${orderId}: vendedor ML ${mlUserId} não encontrado.`);
      return;
    }

    const accessToken = await this.mlToken.getValidMlAccessToken(user.id);
    const order = await this.mlApi.getOrder(accessToken, orderId);
    const itemIds = [
      ...new Set(
        (order.order_items ?? [])
          .map((row) => row.item?.id?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    for (const mlItemId of itemIds) {
      await this.itemsService.syncFromMercadoLivre(user.id, mlItemId);
      this.logger.log(
        `Item ${mlItemId} sincronizado via webhook orders_v2 (pedido ${orderId}).`,
      );
    }
  }

  private isTrustedApplication(applicationId: unknown): boolean {
    const expected = process.env.ML_CLIENT_ID?.trim();
    if (!expected) return true;
    return String(applicationId) === expected;
  }
}

function extractResourceId(resource: string): string | null {
  const trimmed = resource.replace(/^\//, '');
  const parts = trimmed.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last) return null;
  if (/^ML[A-Z]\d+$/i.test(last)) return last.toUpperCase();
  if (/^\d+$/.test(last)) return last;
  return null;
}
