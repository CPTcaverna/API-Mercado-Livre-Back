import { Body, Controller, HttpCode, Post, Req, UsePipes, ValidationPipe } from '@nestjs/common';
import { MercadoLivreNotificationDto } from './dto/mercadolivre-notification.dto';
import { MercadoLivreWebhookService } from './mercadolivre-webhook.service';

@Controller('webhooks/mercadolivre')
export class MercadoLivreWebhookController {
  @Post()
  @HttpCode(200)
  receive(@Body() body: any) {
    console.log('CHEGOU');
    console.log(body);

    return { ok: true };
  }
}
