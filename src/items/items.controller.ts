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
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemsService } from './items.service';

type AuthedUser = { userId: string; email?: string };

@Controller('items')
@UseGuards(AuthGuard('jwt'))
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  /** Importa anúncios existentes no ML para o Mongo (sem duplicar por mlItemId). */
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

  @Get('categories/:categoryId/attributes')
  getCategoryAttributes(@Param('categoryId') categoryId: string) {
    return this.itemsService.getCategoryAttributes(categoryId);
  }

  @Get()
  findAll(
    @Req() req: Request & { user: AuthedUser },
    @Query('includeInactive') includeInactive?: string,
    @Query('q') q?: string,
  ) {
    return this.itemsService.findAllByUser(req.user.userId, {
      includeInactive: includeInactive === 'true',
      q,
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
