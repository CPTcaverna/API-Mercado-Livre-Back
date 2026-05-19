import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { MercadoLivreNotificationDto } from './dto/mercadolivre-notification.dto';
import { MercadoLivreWebhookService } from './mercadolivre-webhook.service';

@Controller('webhooks/mercadolivre')
export class MercadoLivreWebhookController {
  constructor(private readonly webhookService: MercadoLivreWebhookService) {}

  @Post()
  @HttpCode(200)
  receive(@Body() notification: MercadoLivreNotificationDto) {
    this.webhookService.enqueueProcess(notification);
    return { ok: true };
  }
}
