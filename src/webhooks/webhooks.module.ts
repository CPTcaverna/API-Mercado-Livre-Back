import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ItemsModule } from '../items/items.module';
import { MercadoLivreWebhookController } from './mercadolivre-webhook.controller';
import { MercadoLivreWebhookService } from './mercadolivre-webhook.service';

@Module({
  imports: [ItemsModule, AuthModule],
  controllers: [MercadoLivreWebhookController],
  providers: [MercadoLivreWebhookService],
})
export class WebhooksModule {}
