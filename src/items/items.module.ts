import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { MercadoLivreApiService } from './mercadolivre-api.service';

@Module({
  imports: [AuthModule],
  controllers: [ItemsController],
  providers: [ItemsService, MercadoLivreApiService],
  exports: [ItemsService, MercadoLivreApiService],
})
export class ItemsModule {}
