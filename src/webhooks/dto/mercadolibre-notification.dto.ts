import { IsOptional, IsString } from 'class-validator';

export class MercadoLibreNotificationDto {
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
