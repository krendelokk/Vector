import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { ANPStatus, Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../common/files/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/types';
import { AnpQueryDto, CreateAnpItemDto, ReviewDto, UpdateAnpItemDto } from './dto';

const itemInclude = {
  department: { select: { id: true, name: true } },
  responsible: { select: { id: true, fullName: true, email: true } },
  reviewedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ANPItemInclude;

/** Ролі, які взагалі мають доступ до модуля АНП. */
export const ANP_ROLES: Role[] = [
  Role.COMPLIANCE_OFFICER,
  Role.RECTORATE,
  Role.INSTITUTE_DIRECTOR,
  Role.RESPONSIBLE_PERSON,
];

@Injectable()
export class AnpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Серверне обмеження видимості (головний механізм RBAC для АНП):
   * уповноважений і ректорат бачать усе, директор лише свій підрозділ,
   * відповідальна особа лише пункти, закріплені за нею.
   */
  scope(user: AuthUser): Prisma.ANPItemWhereInput {
    switch (user.role) {
      case Role.COMPLIANCE_OFFICER:
      case Role.RECTORATE:
        return {};
      case Role.INSTITUTE_DIRECTOR:
        return { departmentId: user.departmentId ?? '__none__' };
      case Role.RESPONSIBLE_PERSON:
        return { responsibleId: user.id };
      default:
        return { id: '__none__' };
    }
  }

  list(user: AuthUser, q: AnpQueryDto) {
    const where: Prisma.ANPItemWhereInput = {
      AND: [
        this.scope(user),
        q.status ? { status: q.status } : {},
        q.departmentId ? { departmentId: q.departmentId } : {},
        q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {},
      ],
    };
    return this.prisma.aNPItem.findMany({ where, include: itemInclude, orderBy: { deadline: 'asc' } });
  }

  async get(user: AuthUser, id: string) {
    const item = await this.prisma.aNPItem.findFirst({ where: { AND: [{ id }, this.scope(user)] }, include: itemInclude });
    if (!item) throw new NotFoundException('Пункт не знайдено');
    return item;
  }

  async create(dto: CreateAnpItemDto) {
    await this.assertResponsible(dto.responsibleId, dto.departmentId);
    const item = await this.prisma.aNPItem.create({
      data: {
        title: dto.title,
        description: dto.description,
        deadline: dto.deadline,
        departmentId: dto.departmentId,
        responsibleId: dto.responsibleId,
        status: dto.deadline < new Date() ? ANPStatus.OVERDUE : ANPStatus.PENDING,
      },
      include: itemInclude,
    });
    await this.notifications.notify([dto.responsibleId], {
      title: `Вам призначено пункт АНП: ${item.title}`,
      link: `/anp?item=${item.id}`,
      dedupeKey: `anp:${item.id}:assigned:${dto.responsibleId}`,
    });
    return item;
  }

  async update(id: string, dto: UpdateAnpItemDto) {
    const existing = await this.prisma.aNPItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Пункт не знайдено');
    const departmentId = dto.departmentId ?? existing.departmentId;
    const responsibleId = dto.responsibleId ?? existing.responsibleId;
    if (dto.departmentId || dto.responsibleId) await this.assertResponsible(responsibleId, departmentId);

    let status = existing.status;
    const deadline = dto.deadline ?? existing.deadline;
    // Перенесення дедлайну в майбутнє знімає статус OVERDUE
    if (status === ANPStatus.OVERDUE && deadline > new Date()) status = ANPStatus.PENDING;
    if (status === ANPStatus.PENDING && deadline < new Date()) status = ANPStatus.OVERDUE;

    return this.prisma.aNPItem.update({
      where: { id },
      data: { title: dto.title, description: dto.description, deadline, departmentId, responsibleId, status },
      include: itemInclude,
    });
  }

  async remove(id: string) {
    const item = await this.prisma.aNPItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Пункт не знайдено');
    await this.prisma.aNPItem.delete({ where: { id } });
    await this.storage.remove(item.attachmentUrl);
    return { id };
  }

  async submit(user: AuthUser, id: string, reportText: string, file?: { buffer: Buffer; name: string }) {
    const item = await this.prisma.aNPItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Пункт не знайдено');
    if (item.responsibleId !== user.id) {
      throw new ForbiddenException('Звітувати може лише відповідальна особа, закріплена за пунктом');
    }
    const allowed: ANPStatus[] = [ANPStatus.PENDING, ANPStatus.REJECTED, ANPStatus.OVERDUE];
    if (!allowed.includes(item.status)) {
      throw new BadRequestException('Звіт уже подано або затверджено');
    }

    let attachment: { attachmentUrl: string; attachmentName: string } | undefined;
    if (file) {
      attachment = { attachmentUrl: await this.storage.save('anp', file.buffer, file.name), attachmentName: file.name };
      await this.storage.remove(item.attachmentUrl);
    }

    const updated = await this.prisma.aNPItem.update({
      where: { id },
      data: {
        reportText,
        ...attachment,
        status: ANPStatus.SUBMITTED,
        submittedAt: new Date(),
        reviewComment: null,
        reviewedById: null,
        reviewedAt: null,
      },
      include: itemInclude,
    });
    await this.notifications.notify(await this.notifications.officerIds(), {
      title: `Новий звіт на перевірку: ${item.title}`,
      body: user.fullName,
      link: `/anp?item=${id}`,
      dedupeKey: `anp:${id}:submitted:${updated.submittedAt!.toISOString()}`,
    });
    return updated;
  }

  async review(reviewer: AuthUser, id: string, dto: ReviewDto) {
    const item = await this.prisma.aNPItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Пункт не знайдено');
    if (item.status !== ANPStatus.SUBMITTED) throw new BadRequestException('Пункт не очікує перевірки');
    if (dto.decision === 'REJECT' && !dto.comment?.trim()) {
      throw new BadRequestException('Для відхилення потрібно вказати коментар');
    }
    const approved = dto.decision === 'APPROVE';
    const updated = await this.prisma.aNPItem.update({
      where: { id },
      data: {
        status: approved ? ANPStatus.APPROVED : ANPStatus.REJECTED,
        reviewComment: dto.comment?.trim() || null,
        reviewedById: reviewer.id,
        reviewedAt: new Date(),
      },
      include: itemInclude,
    });
    await this.notifications.notify([item.responsibleId], {
      title: approved ? `Звіт затверджено: ${item.title}` : `Звіт повернуто на доопрацювання: ${item.title}`,
      body: dto.comment?.trim() || undefined,
      link: `/anp?item=${id}`,
      dedupeKey: `anp:${id}:review:${updated.reviewedAt!.toISOString()}`,
    });
    return updated;
  }

  async attachment(user: AuthUser, id: string) {
    const item = await this.get(user, id);
    if (!item.attachmentUrl) throw new NotFoundException('Файл не прикріплено');
    return { key: item.attachmentUrl, name: item.attachmentName ?? 'attachment' };
  }

  /** Статистика виконання в межах видимості користувача. */
  async stats(user: AuthUser) {
    const scope = this.scope(user);
    const groups = await this.prisma.aNPItem.groupBy({
      by: ['departmentId', 'status'],
      where: scope,
      _count: { _all: true },
    });
    const departments = await this.prisma.department.findMany({ select: { id: true, name: true } });
    const names = new Map(departments.map((d) => [d.id, d.name]));

    const empty = () => ({ total: 0, PENDING: 0, SUBMITTED: 0, APPROVED: 0, REJECTED: 0, OVERDUE: 0 });
    const total = empty();
    const byDept = new Map<string, ReturnType<typeof empty>>();
    for (const g of groups) {
      const n = g._count._all;
      total[g.status] += n;
      total.total += n;
      const d = byDept.get(g.departmentId) ?? empty();
      d[g.status] += n;
      d.total += n;
      byDept.set(g.departmentId, d);
    }
    const rate = (s: ReturnType<typeof empty>) => (s.total ? Math.round((s.APPROVED / s.total) * 1000) / 10 : 0);

    return {
      scope: user.role === Role.COMPLIANCE_OFFICER || user.role === Role.RECTORATE ? 'university' : user.role === Role.INSTITUTE_DIRECTOR ? 'department' : 'personal',
      total: { ...total, completionRate: rate(total) },
      departments: [...byDept.entries()]
        .map(([id, s]) => ({ departmentId: id, name: names.get(id) ?? '', ...s, completionRate: rate(s) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'uk')),
    };
  }

  /** Відповідальним може бути відповідальна особа або директор того самого підрозділу. */
  private async assertResponsible(responsibleId: string, departmentId: string) {
    const [dept, user] = await Promise.all([
      this.prisma.department.findUnique({ where: { id: departmentId } }),
      this.prisma.user.findUnique({ where: { id: responsibleId } }),
    ]);
    if (!dept) throw new BadRequestException('Підрозділ не знайдено');
    if (!user || !user.isActive) throw new BadRequestException('Відповідальну особу не знайдено');
    const roleOk = user.role === Role.RESPONSIBLE_PERSON || user.role === Role.INSTITUTE_DIRECTOR;
    if (!roleOk || user.departmentId !== departmentId) {
      throw new BadRequestException('Відповідальна особа має належати до обраного підрозділу');
    }
  }
}
