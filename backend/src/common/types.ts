import { Role } from '../generated/prisma/enums';

export { Role };

/** Користувач, якого JwtStrategy кладе в request.user (завжди свіжі дані з БД). */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  departmentId: string | null;
}

export interface JwtPayload {
  sub: string;
  role: Role;
}

/** Групи ролей, щоб не дублювати списки в контролерах. */
export const STAFF_ROLES: Role[] = [
  Role.COMPLIANCE_OFFICER,
  Role.RECTORATE,
  Role.INSTITUTE_DIRECTOR,
  Role.RESPONSIBLE_PERSON,
];
export const ALL_ROLES: Role[] = [Role.ADMIN, ...STAFF_ROLES];
export const USER_MANAGERS: Role[] = [Role.ADMIN, Role.COMPLIANCE_OFFICER];
export const CONSULTATION_AUTHORS: Role[] = [
  Role.RECTORATE,
  Role.INSTITUTE_DIRECTOR,
  Role.RESPONSIBLE_PERSON,
];
