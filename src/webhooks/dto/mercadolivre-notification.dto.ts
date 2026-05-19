import { IsOptional, IsString } from 'class-validator';

/** Payload enviado pelo Mercado Livre em POST na callback URL. */
export class MercadoLivreNotificationDto {
  @IsOptional()
  @IsString()
  resource?: string;

  @IsOptional()
  user_id?: number | string;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  application_id?: number | string;
}
