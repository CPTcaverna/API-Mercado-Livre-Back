import { Body, Controller, HttpCode, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import { MercadoLibreNotificationDto } from './dto/mercadolibre-notification.dto';
import { MercadoLibreWebhookService } from './mercadolibre-webhook.service';

@Controller('webhooks/mercadolibre')
export class MercadoLibreWebhookController {
  constructor(private readonly webhookService: MercadoLibreWebhookService) {}

  @Post()
  @HttpCode(200)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  )
  receive(@Body() notification: MercadoLibreNotificationDto) {
    this.webhookService.enqueueProcess(notification);
    return { ok: true };
  }
}
