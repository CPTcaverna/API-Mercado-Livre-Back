import { Body, Controller, HttpCode, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import { MercadoLivreNotificationDto } from './dto/mercadolivre-notification.dto';
import { MercadoLivreWebhookService } from './mercadolivre-webhook.service';

@Controller('webhooks/mercadolivre')
export class MercadoLivreWebhookController {
  constructor(private readonly webhookService: MercadoLivreWebhookService) {}

  @Post()
  @HttpCode(200)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  )
  receive(@Body() notification: MercadoLivreNotificationDto) {
    this.webhookService.enqueueProcess(notification);
    return { ok: true };
  }
}
