import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { Response } from 'express';
import { KnowledgeCategory } from '../generated/prisma/enums';
import { Audit, Roles } from '../common/decorators';
import { assertAllowedFile, decodeFileName, uploadOptions } from '../common/files/file-validation';
import { StorageService } from '../common/files/storage.service';
import { ALL_ROLES, Role } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

class KnowledgeDto {
  @IsEnum(KnowledgeCategory)
  category: KnowledgeCategory;

  @IsString()
  @MinLength(2)
  @MaxLength(300)
  title: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(3000)
  description?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @ValidateIf((_o, v) => v !== undefined)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'Посилання має починатися з http:// або https://' })
  url?: string;
}

class UpdateKnowledgeDto {
  @IsOptional() @IsEnum(KnowledgeCategory) category?: KnowledgeCategory;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url?: string;
}

const publicFields = {
  id: true, category: true, title: true, description: true, url: true, fileName: true, createdAt: true,
} as const;

@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @Roles(...ALL_ROLES)
  list(@Query('category') category?: KnowledgeCategory) {
    const valid = Object.values(KnowledgeCategory).includes(category as KnowledgeCategory);
    return this.prisma.knowledgeItem.findMany({
      where: valid ? { category } : {},
      select: publicFields,
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':id/file')
  @Roles(...ALL_ROLES)
  async file(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const item = await this.prisma.knowledgeItem.findUnique({ where: { id } });
    if (!item?.fileUrl) throw new NotFoundException('Файл не знайдено');
    this.storage.send(res, item.fileUrl, item.fileName ?? 'file');
  }

  @Post()
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('KNOWLEDGE_CREATE', 'KnowledgeItem')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  async create(@Body() dto: KnowledgeDto, @UploadedFile() file?: Express.Multer.File) {
    if (!file && !dto.url) throw new BadRequestException('Додайте файл або посилання');
    let fileUrl: string | undefined;
    let fileName: string | undefined;
    if (file) {
      assertAllowedFile(file);
      fileName = decodeFileName(file.originalname);
      fileUrl = await this.storage.save('knowledge', file.buffer, fileName);
    }
    return this.prisma.knowledgeItem.create({
      data: { category: dto.category, title: dto.title, description: dto.description, url: dto.url, fileUrl, fileName },
      select: publicFields,
    });
  }

  @Patch(':id')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('KNOWLEDGE_UPDATE', 'KnowledgeItem')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateKnowledgeDto) {
    return this.prisma.knowledgeItem.update({ where: { id }, data: dto, select: publicFields });
  }

  @Delete(':id')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('KNOWLEDGE_DELETE', 'KnowledgeItem')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const item = await this.prisma.knowledgeItem.delete({ where: { id } });
    await this.storage.remove(item.fileUrl);
    return { id };
  }
}
