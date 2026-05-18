import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ItemsModule } from '../items/items.module';
import { MercadoLibreWebhookController } from './mercadolibre-webhook.controller';
import { MercadoLibreWebhookService } from './mercadolibre-webhook.service';

@Module({
  imports: [ItemsModule, AuthModule],
  controllers: [MercadoLibreWebhookController],
  providers: [MercadoLibreWebhookService],
})
export class WebhooksModule {}
