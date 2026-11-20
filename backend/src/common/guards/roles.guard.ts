import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../generated/prisma/enums';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators';
import { AuthUser } from '../types';

/**
 * Перевірка ролі з request.user. Політика "deny by default":
 * якщо ендпоінт не позначено @Public і не вказано @Roles, доступ заборонено.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (!roles || !user || !roles.includes(user.role)) {
      throw new ForbiddenException('Недостатньо прав доступу');
    }
    return true;
  }
}
