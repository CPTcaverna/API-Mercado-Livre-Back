import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { MercadoLibreApiService } from './mercadolibre-api.service';

@Module({
  imports: [AuthModule],
  controllers: [ItemsController],
  providers: [ItemsService, MercadoLibreApiService],
  exports: [ItemsService, MercadoLibreApiService],
})
export class ItemsModule {}
