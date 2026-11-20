import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Audit, Roles } from '../common/decorators';
import { ALL_ROLES, Role } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

class FaqDto {
  @IsString() @MinLength(5) @MaxLength(500) question: string;
  @IsString() @MinLength(5) @MaxLength(10000) answer: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
class UpdateFaqDto {
  @IsOptional() @IsString() @MinLength(5) @MaxLength(500) question?: string;
  @IsOptional() @IsString() @MinLength(5) @MaxLength(10000) answer?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

@Controller('faq')
export class FaqController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(...ALL_ROLES)
  list() {
    return this.prisma.faqItem.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  @Post()
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('FAQ_CREATE', 'FaqItem')
  create(@Body() dto: FaqDto) {
    return this.prisma.faqItem.create({ data: dto });
  }

  @Patch(':id')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('FAQ_UPDATE', 'FaqItem')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFaqDto) {
    return this.prisma.faqItem.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('FAQ_DELETE', 'FaqItem')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.faqItem.delete({ where: { id } });
    return { id };
  }
}
