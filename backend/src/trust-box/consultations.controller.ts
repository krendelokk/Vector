import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ConsultationStatus } from '../generated/prisma/enums';
import { Audit, CurrentUser, Roles } from '../common/decorators';
import { AuthUser, CONSULTATION_AUTHORS, Role } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

class QuestionDto {
  @IsString() @MinLength(10, { message: 'Сформулюйте запитання детальніше' }) @MaxLength(10000) question: string;
}
class AnswerDto {
  @IsString() @MinLength(2) @MaxLength(20000) answer: string;
}

const include = {
  user: { select: { id: true, fullName: true, role: true, department: { select: { name: true } } } },
  answeredBy: { select: { fullName: true } },
} as const;

/** Консультації: запит бачать лише автор і уповноважений. */
@Controller('consultations')
export class ConsultationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Post()
  @Roles(...CONSULTATION_AUTHORS)
  async create(@CurrentUser() user: AuthUser, @Body() dto: QuestionDto) {
    const c = await this.prisma.consultationRequest.create({
      data: { userId: user.id, question: dto.question.trim() },
      include,
    });
    await this.notifications.notify(await this.notifications.officerIds(), {
      title: 'Новий запит на консультацію',
      body: user.fullName,
      link: '/trust-box?tab=consultations',
      dedupeKey: `consult:${c.id}:new`,
    });
    return c;
  }

  @Get()
  @Roles(Role.COMPLIANCE_OFFICER, ...CONSULTATION_AUTHORS)
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.consultationRequest.findMany({
      where: user.role === Role.COMPLIANCE_OFFICER ? {} : { userId: user.id },
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  @Patch(':id/answer')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('CONSULTATION_ANSWER', 'ConsultationRequest')
  async answer(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AnswerDto) {
    const existing = await this.prisma.consultationRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Запит не знайдено');
    if (existing.status === ConsultationStatus.ANSWERED && existing.answer === dto.answer) {
      throw new BadRequestException('Відповідь не змінилася');
    }
    const c = await this.prisma.consultationRequest.update({
      where: { id },
      data: { answer: dto.answer.trim(), answeredById: user.id, answeredAt: new Date(), status: ConsultationStatus.ANSWERED },
      include,
    });
    await this.notifications.notify([existing.userId], {
      title: 'Отримано відповідь на ваше запитання',
      link: '/trust-box?tab=consultations',
      dedupeKey: `consult:${id}:answer:${c.answeredAt!.toISOString()}`,
    });
    return c;
  }
}
