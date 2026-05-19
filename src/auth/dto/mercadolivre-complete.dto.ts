import { IsString, MinLength } from 'class-validator';

export class MercadoLivreCompleteDto {
  @IsString()
  @MinLength(1)
  code: string;

  @IsString()
  @MinLength(1)
  state: string;
}
