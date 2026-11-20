import type { Role } from '../lib/types';

const ALL: Role[] = ['ADMIN', 'COMPLIANCE_OFFICER', 'RECTORATE', 'INSTITUTE_DIRECTOR', 'RESPONSIBLE_PERSON'];
const STAFF: Role[] = ['COMPLIANCE_OFFICER', 'RECTORATE', 'INSTITUTE_DIRECTOR', 'RESPONSIBLE_PERSON'];

/**
 * Єдине джерело правди для меню й захисту роутів на фронті.
 * Це лише зручність інтерфейсу: реальну перевірку прав робить сервер.
 */
export const ROUTE_ROLES = {
  dashboard: ALL,
  anp: STAFF,
  integrity: STAFF,
  knowledge: ALL,
  risks: ALL,
  calendar: ALL,
  trustBox: STAFF,
  inbox: ['COMPLIANCE_OFFICER'] as Role[],
  users: ['ADMIN', 'COMPLIANCE_OFFICER'] as Role[],
  audit: ['ADMIN', 'COMPLIANCE_OFFICER'] as Role[],
  profile: ALL,
} satisfies Record<string, Role[]>;
