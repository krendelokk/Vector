import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

export const BCRYPT_ROUNDS = 12;
// Хеш для вирівнювання часу відповіді, коли користувача не існує
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', BCRYPT_ROUNDS);

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/**
 * Захист від підбору пароля до конкретного облікового запису.
 * Ліміт рахується за email, а не за IP: в університетській мережі всі користувачі
 * часто виходять в інтернет з однієї IP-адреси, і ліміт за IP блокував би всіх одразу.
 */
const MAX_FAILED_LOGINS = Number(process.env.MAX_FAILED_LOGINS ?? 5);
const LOCK_MINUTES = 15;
const failedLogins = new Map<string, { count: number; until: number }>();

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditLogService,
  ) {}

  async login(email: string, password: string) {
    const key = sha256(email.toLowerCase().trim());
    const now = Date.now();
    const failed = failedLogins.get(key);
    if (failed && failed.until > now && failed.count >= MAX_FAILED_LOGINS) {
      const minutes = Math.ceil((failed.until - now) / 60000);
      throw new HttpException(
        `Забагато невдалих спроб входу. Спробуйте через ${minutes} хв або зверніться до адміністратора.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { department: { select: { id: true, name: true } } },
    });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.isActive) {
      const prev = failed && failed.until > now ? failed.count : 0;
      failedLogins.set(key, { count: prev + 1, until: now + LOCK_MINUTES * 60_000 });
      throw new UnauthorizedException('Невірний email або пароль');
    }
    failedLogins.delete(key);
    const tokens = await this.issueTokens(user.id, user.role);
    await this.audit.log(user.id, 'LOGIN', 'User', user.id);
    return { ...tokens, user: this.publicUser(user) };
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new UnauthorizedException();
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { department: { select: { id: true, name: true } } },
    });
    if (!user || !user.isActive || user.refreshTokenHash !== sha256(refreshToken)) {
      // Повторне використання старого refresh-токена: відкликаємо сесію
      if (user) await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: null } });
      throw new UnauthorizedException();
    }
    const tokens = await this.issueTokens(user.id, user.role);
    return { ...tokens, user: this.publicUser(user) };
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      await this.prisma.user.update({ where: { id: payload.sub }, data: { refreshTokenHash: null } });
    } catch {
      /* токен недійсний: нічого відкликати */
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { department: { select: { id: true, name: true } } },
    });
    return this.publicUser(user);
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(current, user.passwordHash))) {
      throw new BadRequestException('Поточний пароль невірний');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(next, BCRYPT_ROUNDS), refreshTokenHash: null },
    });
    await this.audit.log(userId, 'PASSWORD_CHANGE', 'User', userId);
    return { ok: true };
  }

  private async issueTokens(userId: string, role: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, role },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: (process.env.JWT_ACCESS_TTL ?? '15m') as any },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, jti: randomUUID() },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: `${this.refreshDays()}d` as any },
    );
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: sha256(refreshToken) } });
    return { accessToken, refreshToken };
  }

  refreshDays() {
    return Number(process.env.JWT_REFRESH_TTL_DAYS ?? 7);
  }

  private publicUser(user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    departmentId: string | null;
    department?: { id: string; name: string } | null;
    telegramChatId?: string | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      departmentId: user.departmentId,
      department: user.department ?? null,
      telegramLinked: Boolean(user.telegramChatId),
    };
  }
}
