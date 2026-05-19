import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ItemAttributeDto } from './create-item.dto';

export class ResolveCategoryAttributesDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(['new', 'used', 'not_specified'])
  condition?: string;

  @IsOptional()
  @IsString()
  listing_type_id?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemAttributeDto)
  attributes: ItemAttributeDto[];
}
