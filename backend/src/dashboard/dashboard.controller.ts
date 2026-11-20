import { Controller, Get } from '@nestjs/common';
import { ANPStatus, ConsultationStatus, Role, TrustBoxStatus } from '../generated/prisma/enums';
import { CurrentUser, Roles } from '../common/decorators';
import { ALL_ROLES, AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { AnpService } from '../anp/anp.service';

const DAY = 24 * 3600 * 1000;

/** Зведення для головної сторінки. Набір блоків залежить від ролі. */
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anp: AnpService,
  ) {}

  @Get()
  @Roles(...ALL_ROLES)
  async get(@CurrentUser() user: AuthUser) {
    const now = new Date();
    const upcomingEvents = await this.prisma.calendarEvent.findMany({
      where: { date: { gte: now } },
      orderBy: { date: 'asc' },
      take: 5,
    });

    if (user.role === Role.ADMIN) {
      const [byRole, departments, inactive, recentAudit] = await Promise.all([
        this.prisma.user.groupBy({ by: ['role'], _count: { _all: true }, where: { isActive: true } }),
        this.prisma.department.count(),
        this.prisma.user.count({ where: { isActive: false } }),
        this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
      ]);
      return {
        role: user.role,
        admin: {
          usersByRole: byRole.map((r) => ({ role: r.role, count: r._count._all })),
          departments,
          inactiveUsers: inactive,
          recentAudit,
        },
        upcomingEvents,
      };
    }

    const scope = this.anp.scope(user);
    const [stats, deadlines, latestIndex] = await Promise.all([
      this.anp.stats(user),
      this.prisma.aNPItem.findMany({
        where: {
          AND: [
            scope,
            { status: { in: [ANPStatus.PENDING, ANPStatus.REJECTED, ANPStatus.OVERDUE] } },
            { deadline: { lte: new Date(now.getTime() + 14 * DAY) } },
          ],
        },
        include: { department: { select: { name: true } }, responsible: { select: { fullName: true } } },
        orderBy: { deadline: 'asc' },
        take: 10,
      }),
      this.prisma.surveyImport.findMany({
        where: { published: true },
        orderBy: { createdAt: 'desc' },
        take: 2,
        select: { periodLabel: true, integrityIndex: true, respondentsCount: true },
      }),
    ]);

    // red: прострочено; yellow: до дедлайну 7 днів або менше
    const deadlineItems = deadlines.map((d) => {
      const days = Math.ceil((d.deadline.getTime() - now.getTime()) / DAY);
      return {
        id: d.id,
        title: d.title,
        deadline: d.deadline,
        status: d.status,
        department: d.department.name,
        responsible: d.responsible.fullName,
        daysLeft: days,
        level: d.status === ANPStatus.OVERDUE || days < 0 ? 'red' : days <= 7 ? 'yellow' : 'normal',
      };
    });

    let officer: Record<string, number> | undefined;
    if (user.role === Role.COMPLIANCE_OFFICER) {
      const [newMessages, openConsultations, awaitingReview, unpublished] = await Promise.all([
        this.prisma.trustBoxMessage.count({ where: { status: TrustBoxStatus.NEW } }),
        this.prisma.consultationRequest.count({ where: { status: ConsultationStatus.OPEN } }),
        this.prisma.aNPItem.count({ where: { status: ANPStatus.SUBMITTED } }),
        this.prisma.surveyImport.count({ where: { published: false } }),
      ]);
      officer = { newMessages, openConsultations, awaitingReview, unpublished };
    }

    return {
      role: user.role,
      anp: stats,
      deadlines: deadlineItems,
      integrity: {
        latest: latestIndex[0] ?? null,
        previous: latestIndex[1] ?? null,
      },
      officer,
      upcomingEvents,
    };
  }
}
