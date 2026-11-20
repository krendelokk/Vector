export type Role = 'ADMIN' | 'COMPLIANCE_OFFICER' | 'RECTORATE' | 'INSTITUTE_DIRECTOR' | 'RESPONSIBLE_PERSON';
export type AnpStatus = 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'OVERDUE';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type KnowledgeCategory = 'COURSE' | 'MEMO' | 'TEMPLATE' | 'REGULATION';
export type EventType = 'DEADLINE' | 'TRAINING' | 'DECLARATION';

export interface Department {
  id: string;
  name: string;
  _count?: { users: number; anpItems: number };
}

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  telegramLinked: boolean;
}

export interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  isActive: boolean;
  createdAt: string;
}

export interface AnpItem {
  id: string;
  title: string;
  description: string | null;
  deadline: string;
  departmentId: string;
  department: { id: string; name: string };
  responsibleId: string;
  responsible: { id: string; fullName: string; email: string };
  status: AnpStatus;
  reportText: string | null;
  attachmentName: string | null;
  attachmentUrl: string | null;
  submittedAt: string | null;
  reviewedBy: { id: string; fullName: string } | null;
  reviewComment: string | null;
  reviewedAt: string | null;
}

export interface StatusCounts {
  total: number;
  PENDING: number;
  SUBMITTED: number;
  APPROVED: number;
  REJECTED: number;
  OVERDUE: number;
  completionRate: number;
}

export interface AnpStats {
  scope: 'university' | 'department' | 'personal';
  total: StatusCounts;
  departments: Array<StatusCounts & { departmentId: string; name: string }>;
}

export interface AreaResult {
  area: string;
  index: number;
  questions: number;
  answers: number;
}
export interface QuestionResult {
  question: string;
  area: string;
  reversed: boolean;
  answers: number;
  index: number;
}

export interface SurveySummary {
  id: string;
  periodLabel: string;
  integrityIndex: number;
  respondentsCount: number;
  riskAreas: { areas: AreaResult[]; questions: QuestionResult[] };
  publishedAt: string | null;
}

export interface SurveyImportRow extends SurveySummary {
  rawFileName: string;
  channel: 'WEB' | 'TELEGRAM';
  formulaVersion: string;
  published: boolean;
  createdAt: string;
  uploadedBy: string;
}

export interface KnowledgeItem {
  id: string;
  category: KnowledgeCategory;
  title: string;
  description: string | null;
  url: string | null;
  fileName: string | null;
  createdAt: string;
}

export interface RiskItem {
  id: string;
  area: string;
  description: string;
  riskLevel: RiskLevel;
  mitigation: string | null;
  updatedAt: string;
}

export interface CalendarItem {
  id: string;
  title: string;
  description: string | null;
  date: string;
  type: EventType;
  source: 'calendar' | 'anp';
  editable: boolean;
  status?: AnpStatus;
  anpId?: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
}

export interface Consultation {
  id: string;
  question: string;
  answer: string | null;
  status: 'OPEN' | 'ANSWERED';
  createdAt: string;
  answeredAt: string | null;
  user: { id: string; fullName: string; role: Role; department: { name: string } | null };
  answeredBy: { fullName: string } | null;
}

export interface TrustBoxMessage {
  id: string;
  isAnonymous: boolean;
  contactInfo: string | null;
  message: string;
  attachmentName: string | null;
  status: 'NEW' | 'IN_REVIEW' | 'CLOSED';
  officerNote: string | null;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  user: { fullName: string; role: Role } | null;
}
