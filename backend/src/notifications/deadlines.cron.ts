import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ANPStatus, Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

const DAY = 24 * 3600 * 1000;
const fmt = (d: Date) => d.toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' });

/**
 * Щоденна перевірка дедлайнів:
 * 1) пункти АНП з минулим дедлайном отримують статус OVERDUE;
 * 2) внутрішні нагадування про дедлайни АНП (за 3 дні) і прострочення;
 * 3) нагадування про події календаря (за 2 дні).
 */
@Injectable()
export class DeadlinesCron implements OnApplicationBootstrap {
  private readonly logger = new Logger(DeadlinesCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Після перезапуску сервера одразу наздоганяємо пропущені перевірки. */
  onApplicationBootstrap() {
    if (process.env.NODE_ENV !== 'test') void this.run();
  }

  @Cron('5 0 * * *', { timeZone: 'Europe/Kyiv' })
  async run() {
    try {
      const overdue = await this.markOverdue();
      await this.remindAnp();
      await this.remindCalendar();
      this.logger.log(`Перевірку дедлайнів виконано, прострочено нових пунктів: ${overdue}`);
    } catch (e) {
      this.logger.error(`Помилка перевірки дедлайнів: ${(e as Error).message}`);
    }
  }

  async markOverdue(now = new Date()) {
    const items = await this.prisma.aNPItem.findMany({
      where: { deadline: { lt: now }, status: { in: [ANPStatus.PENDING, ANPStatus.REJECTED] } },
      select: { id: true, title: true, deadline: true, responsibleId: true, departmentId: true },
    });
    if (!items.length) return 0;
    await this.prisma.aNPItem.updateMany({
      where: { id: { in: items.map((i) => i.id) } },
      data: { status: ANPStatus.OVERDUE },
    });

    const officers = await this.notifications.officerIds();
    for (const item of items) {
      const directors = await this.prisma.user.findMany({
        where: { role: Role.INSTITUTE_DIRECTOR, departmentId: item.departmentId, isActive: true },
        select: { id: true },
      });
      await this.notifications.notify([item.responsibleId, ...officers, ...directors.map((d) => d.id)], {
        title: `Прострочено пункт АНП: ${item.title}`,
        body: `Дедлайн був ${fmt(item.deadline)}`,
        link: `/anp?item=${item.id}`,
        dedupeKey: `anp:${item.id}:overdue:${item.deadline.toISOString()}`,
      });
    }
    return items.length;
  }

  private async remindAnp(now = new Date()) {
    const soon = await this.prisma.aNPItem.findMany({
      where: {
        deadline: { gte: now, lte: new Date(now.getTime() + 3 * DAY) },
        status: { in: [ANPStatus.PENDING, ANPStatus.REJECTED] },
      },
      select: { id: true, title: true, deadline: true, responsibleId: true },
    });
    for (const item of soon) {
      await this.notifications.notify([item.responsibleId], {
        title: `Наближається дедлайн: ${item.title}`,
        body: `Звіт потрібно подати до ${fmt(item.deadline)}`,
        link: `/anp?item=${item.id}`,
        dedupeKey: `anp:${item.id}:due3:${item.deadline.toISOString()}`,
      });
    }
  }

  private async remindCalendar(now = new Date()) {
    const events = await this.prisma.calendarEvent.findMany({
      where: { date: { gte: now, lte: new Date(now.getTime() + 2 * DAY) } },
    });
    if (!events.length) return;
    const users = await this.prisma.user.findMany({
      where: { isActive: true, role: { not: Role.ADMIN } },
      select: { id: true },
    });
    for (const ev of events) {
      await this.notifications.notify(
        users.map((u) => u.id),
        {
          title: `Подія: ${ev.title}`,
          body: fmt(ev.date),
          link: '/calendar',
          dedupeKey: `cal:${ev.id}:${ev.date.toISOString()}`,
        },
      );
    }
  }
}
