import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { CreateItemDto } from './dto/create-item.dto';
import { ResolveCategoryAttributesDto } from './dto/resolve-category-attributes.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemsService } from './items.service';

type AuthedUser = { userId: string; email?: string };

@Controller('items')
@UseGuards(AuthGuard('jwt'))
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post('import')
  importFromMercadoLivre(@Req() req: Request & { user: AuthedUser }) {
    return this.itemsService.importAllFromMercadoLivre(req.user.userId);
  }

  @Post()
  create(
    @Req() req: Request & { user: AuthedUser },
    @Body() createItemDto: CreateItemDto,
  ) {
    return this.itemsService.create(req.user.userId, createItemDto);
  }

  @Get('categories/predict')
  predictCategory(@Query('q') q?: string, @Query('site') site?: string) {
    return this.itemsService.predictCategoryFromTitle(q ?? '', site);
  }

  @Get('categories/:categoryId/attributes')
  getCategoryAttributes(@Param('categoryId') categoryId: string) {
    return this.itemsService.getCategoryAttributes(categoryId);
  }

  @Post('categories/:categoryId/attributes/resolve')
  resolveCategoryAttributes(
    @Req() req: Request & { user: AuthedUser },
    @Param('categoryId') categoryId: string,
    @Body() dto: ResolveCategoryAttributesDto,
  ) {
    return this.itemsService.resolveCategoryAttributes(
      req.user.userId,
      categoryId,
      dto,
    );
  }

  @Get()
  findAll(
    @Req() req: Request & { user: AuthedUser },
    @Query('q') q?: string,
    @Query('visibility') visibility?: string,
    @Query('status') status?: string,
    @Query('stock') stock?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedPage = page ? Number.parseInt(page, 10) : undefined;
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.itemsService.findAllByUser(req.user.userId, {
      q,
      visibility: visibility as 'all' | 'active' | 'inactive' | undefined,
      status,
      stock: stock as 'all' | 'in' | 'out' | undefined,
      sort,
      page: Number.isFinite(parsedPage) ? parsedPage : undefined,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Get(':id')
  findOne(
    @Req() req: Request & { user: AuthedUser },
    @Param('id') id: string,
  ) {
    return this.itemsService.findOneForUser(req.user.userId, id);
  }

  @Patch(':id')
  update(
    @Req() req: Request & { user: AuthedUser },
    @Param('id') id: string,
    @Body() updateItemDto: UpdateItemDto,
  ) {
    return this.itemsService.update(req.user.userId, id, updateItemDto);
  }

  @Post(':id/reactivate')
  reactivate(
    @Req() req: Request & { user: AuthedUser },
    @Param('id') id: string,
  ) {
    return this.itemsService.reactivate(req.user.userId, id);
  }

  @Delete(':id/permanent')
  removeInactive(
    @Req() req: Request & { user: AuthedUser },
    @Param('id') id: string,
  ) {
    return this.itemsService.removeInactive(req.user.userId, id);
  }

  @Delete(':id')
  deactivate(
    @Req() req: Request & { user: AuthedUser },
    @Param('id') id: string,
  ) {
    return this.itemsService.deactivate(req.user.userId, id);
  }
}
