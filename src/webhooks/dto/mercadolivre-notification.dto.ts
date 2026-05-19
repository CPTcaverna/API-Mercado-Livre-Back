import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class MercadoLivreNotificationDto {
  @IsOptional()
  @IsString()
  _id?: string;

  @IsOptional()
  @IsString()
  resource?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  user_id?: number;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  application_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  attempts?: number;

  @IsOptional()
  @IsString()
  sent?: string;

  @IsOptional()
  @IsString()
  received?: string;
}
