import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { RiskLevel } from '../generated/prisma/enums';
import { Audit, Roles } from '../common/decorators';
import { ALL_ROLES, Role } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

class RiskDto {
  @IsString() @MinLength(2) @MaxLength(200) area: string;
  @IsString() @MinLength(5) @MaxLength(5000) description: string;
  @IsEnum(RiskLevel) riskLevel: RiskLevel;
  @IsOptional() @IsString() @MaxLength(5000) mitigation?: string;
}

class UpdateRiskDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) area?: string;
  @IsOptional() @IsString() @MinLength(5) @MaxLength(5000) description?: string;
  @IsOptional() @IsEnum(RiskLevel) riskLevel?: RiskLevel;
  @IsOptional() @IsString() @MaxLength(5000) mitigation?: string;
}

const LEVEL_ORDER: Record<RiskLevel, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

@Controller('risks')
export class RiskRegistryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(...ALL_ROLES)
  async list(@Query('level') level?: RiskLevel, @Query('area') area?: string) {
    const items = await this.prisma.riskRegistryItem.findMany({
      where: {
        ...(Object.values(RiskLevel).includes(level as RiskLevel) ? { riskLevel: level } : {}),
        ...(area ? { area } : {}),
      },
      orderBy: { area: 'asc' },
    });
    return items.sort((a, b) => LEVEL_ORDER[a.riskLevel] - LEVEL_ORDER[b.riskLevel]);
  }

  @Post()
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('RISK_CREATE', 'RiskRegistryItem')
  create(@Body() dto: RiskDto) {
    return this.prisma.riskRegistryItem.create({ data: dto });
  }

  @Patch(':id')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('RISK_UPDATE', 'RiskRegistryItem')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRiskDto) {
    return this.prisma.riskRegistryItem.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('RISK_DELETE', 'RiskRegistryItem')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.riskRegistryItem.delete({ where: { id } });
    return { id };
  }
}
