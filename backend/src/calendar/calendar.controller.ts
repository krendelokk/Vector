import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CalendarEventType, Role as R } from '../generated/prisma/enums';
import { Audit, CurrentUser, Roles } from '../common/decorators';
import { ALL_ROLES, AuthUser, Role } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { AnpService } from '../anp/anp.service';

class EventDto {
  @IsString() @MinLength(2) @MaxLength(300) title: string;
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @Type(() => Date) @IsDate() date: Date;
  @IsEnum(CalendarEventType) type: CalendarEventType;
}

class UpdateEventDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @Type(() => Date) @IsDate() date?: Date;
  @IsOptional() @IsEnum(CalendarEventType) type?: CalendarEventType;
}

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anp: AnpService,
  ) {}

  /**
   * Події календаря плюс дедлайни АНП, видимі користувачу (у межах його ролі й підрозділу).
   */
  @Get('events')
  @Roles(...ALL_ROLES)
  async list(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const range = {
      ...(from && !isNaN(Date.parse(from)) ? { gte: new Date(from) } : {}),
      ...(to && !isNaN(Date.parse(to)) ? { lte: new Date(to) } : {}),
    };
    const events = await this.prisma.calendarEvent.findMany({ where: { date: range }, orderBy: { date: 'asc' } });
    const result = events.map((e) => ({ ...e, source: 'calendar' as const, editable: true }));

    if (user.role !== R.ADMIN) {
      const items = await this.prisma.aNPItem.findMany({
        where: { AND: [this.anp.scope(user), { deadline: range }] },
        select: { id: true, title: true, deadline: true, status: true },
      });
      for (const i of items) {
        result.push({
          id: `anp-${i.id}`,
          title: `АНП: ${i.title}`,
          description: null,
          date: i.deadline,
          type: CalendarEventType.DEADLINE,
          createdAt: i.deadline,
          source: 'anp' as any,
          editable: false,
          status: i.status,
          anpId: i.id,
        } as any);
      }
    }
    return result.sort((a, b) => +new Date(a.date) - +new Date(b.date));
  }

  @Post('events')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('CALENDAR_CREATE', 'CalendarEvent')
  create(@Body() dto: EventDto) {
    return this.prisma.calendarEvent.create({ data: dto });
  }

  @Patch('events/:id')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('CALENDAR_UPDATE', 'CalendarEvent')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEventDto) {
    return this.prisma.calendarEvent.update({ where: { id }, data: dto });
  }

  @Delete('events/:id')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('CALENDAR_DELETE', 'CalendarEvent')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.calendarEvent.delete({ where: { id } });
    return { id };
  }
}
