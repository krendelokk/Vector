import { Injectable } from '@nestjs/common';
import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

export interface NotifyInput {
  title: string;
  body?: string;
  link?: string;
  /** Унікальний ключ: однакове нагадування не створюється двічі. */
  dedupeKey: string;
}

/** Нагадування лише всередині вебдодатку (без email, SMS, Telegram). */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(userIds: string[], input: NotifyInput) {
    const unique = [...new Set(userIds)];
    if (!unique.length) return;
    await this.prisma.notification.createMany({
      data: unique.map((userId) => ({
        userId,
        title: input.title,
        body: input.body,
        link: input.link,
        dedupeKey: `${input.dedupeKey}:${userId}`,
      })),
      skipDuplicates: true,
    });
  }

  async officerIds() {
    const officers = await this.prisma.user.findMany({
      where: { role: Role.COMPLIANCE_OFFICER, isActive: true },
      select: { id: true },
    });
    return officers.map((o) => o.id);
  }

  list(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return { ok: true };
  }
}
