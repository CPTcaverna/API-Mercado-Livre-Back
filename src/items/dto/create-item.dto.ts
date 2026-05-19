import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PictureDto {
  @IsUrl()
  source: string;
}

export class ItemAttributeDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  value_id?: string;

  @IsOptional()
  @IsString()
  value_name?: string;
}

export class CreateItemDto {
  @IsString()
  @MinLength(3)
  title: string;

  @IsString()
  @Matches(/^ML[A-Z]\d+$/, {
    message: 'category_id inválido (ex.: MLB3530).',
  })
  category_id: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  price: number;

  @IsInt()
  @Min(1)
  available_quantity: number;

  @IsIn(['new', 'used', 'not_specified'])
  condition: string;

  @IsString()
  listing_type_id: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PictureDto)
  pictures: PictureDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemAttributeDto)
  attributes: ItemAttributeDto[];
}
