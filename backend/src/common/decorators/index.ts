import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';
import { AuthUser } from '../types';

export const IS_PUBLIC_KEY = 'isPublic';
/** Ендпоінт без автентифікації. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Дозволені ролі. Ендпоінт без @Roles і без @Public відхиляється (deny by default). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const AUDIT_KEY = 'audit';
export interface AuditMeta {
  action: string;
  entity: string;
}
/** Записати дію в audit_log після успішного виконання. */
export const Audit = (action: string, entity: string) =>
  SetMetadata(AUDIT_KEY, { action, entity } as AuditMeta);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
