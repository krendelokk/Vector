import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(userId: string | null, action: string, entity: string, entityId: string | null, details?: object) {
    try {
      await this.prisma.auditLog.create({
        data: { userId, action, entity, entityId, details: details ?? undefined },
      });
    } catch (e) {
      this.logger.error(`Не вдалося записати аудит ${action}: ${(e as Error).message}`);
    }
  }

  async list(params: { entity?: string; action?: string; page: number; pageSize: number }) {
    const where = {
      ...(params.entity ? { entity: params.entity } : {}),
      ...(params.action ? { action: params.action } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    // Підтягуємо імена користувачів окремим запитом (у AuditLog немає FK, щоб лог переживав видалення)
    const ids = [...new Set(items.map((i) => i.userId).filter(Boolean))] as string[];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, role: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return {
      total,
      items: items.map((i) => ({ ...i, user: i.userId ? (byId.get(i.userId) ?? null) : null })),
    };
  }
}
