import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client';
import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { BCRYPT_ROUNDS } from '../auth/auth.service';
import { AuthUser } from '../common/types';
import { CreateUserDto, UpdateUserDto } from './dto';

/** Ролі, прив'язані до підрозділу. */
const DEPARTMENT_ROLES: Role[] = [Role.INSTITUTE_DIRECTOR, Role.RESPONSIBLE_PERSON];

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  departmentId: true,
  department: { select: { id: true, name: true } },
  isActive: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: { role?: Role; departmentId?: string }) {
    return this.prisma.user.findMany({
      where: { role: filter.role, departmentId: filter.departmentId },
      select: userSelect,
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    });
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    this.assertCanManageRole(actor, dto.role);
    const departmentId = await this.resolveDepartment(dto.role, dto.departmentId ?? null);
    try {
      return await this.prisma.user.create({
        data: {
          email: dto.email,
          fullName: dto.fullName,
          role: dto.role,
          departmentId,
          passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        },
        select: userSelect,
      });
    } catch (e) {
      if ((e as any)?.code === 'P2002') throw new ConflictException('Користувач з таким email уже існує');
      throw e;
    }
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Користувача не знайдено');
    this.assertCanManageRole(actor, existing.role);
    if (dto.role) this.assertCanManageRole(actor, dto.role);
    if (id === actor.id && (dto.role || dto.isActive === false)) {
      throw new BadRequestException('Не можна змінити власну роль або деактивувати себе');
    }

    const role = dto.role ?? existing.role;
    const departmentId = await this.resolveDepartment(
      role,
      dto.departmentId !== undefined ? dto.departmentId : existing.departmentId,
    );

    return this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        role,
        departmentId,
        isActive: dto.isActive,
        ...(dto.password ? { passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS) } : {}),
        // Зміна ролі, пароля чи деактивація завершує активні сесії
        ...(dto.role || dto.password || dto.isActive === false ? { refreshTokenHash: null } : {}),
      },
      select: userSelect,
    });
  }

  /** Лише ADMIN може створювати чи змінювати адміністраторів. */
  private assertCanManageRole(actor: AuthUser, role: Role) {
    if (role === Role.ADMIN && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Лише адміністратор може керувати обліковими записами адміністраторів');
    }
  }

  private async resolveDepartment(role: Role, departmentId: string | null) {
    if (DEPARTMENT_ROLES.includes(role)) {
      if (!departmentId) throw new BadRequestException('Для цієї ролі потрібно вказати підрозділ');
      const exists = await this.prisma.department.count({ where: { id: departmentId } });
      if (!exists) throw new BadRequestException('Підрозділ не знайдено');
      return departmentId;
    }
    return departmentId ?? null;
  }
}
