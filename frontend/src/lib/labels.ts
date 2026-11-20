import type { AnpStatus, EventType, KnowledgeCategory, RiskLevel, Role } from './types';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Адміністратор',
  COMPLIANCE_OFFICER: 'Уповноважений',
  RECTORATE: 'Ректорат',
  INSTITUTE_DIRECTOR: 'Директор підрозділу',
  RESPONSIBLE_PERSON: 'Відповідальна особа',
};

export const ANP_STATUS: Record<AnpStatus, { label: string; color: string }> = {
  PENDING: { label: 'Очікує звіту', color: 'default' },
  SUBMITTED: { label: 'На перевірці', color: 'processing' },
  APPROVED: { label: 'Затверджено', color: 'success' },
  REJECTED: { label: 'На доопрацюванні', color: 'warning' },
  OVERDUE: { label: 'Прострочено', color: 'error' },
};

export const RISK_LEVEL: Record<RiskLevel, { label: string; color: string }> = {
  HIGH: { label: 'Високий', color: '#b42318' },
  MEDIUM: { label: 'Середній', color: '#b54708' },
  LOW: { label: 'Низький', color: '#3b6d3f' },
};

export const KNOWLEDGE_CATEGORY: Record<KnowledgeCategory, string> = {
  COURSE: 'Курси',
  MEMO: 'Пам\'ятки',
  TEMPLATE: 'Шаблони документів',
  REGULATION: 'Нормативні акти',
};

export const EVENT_TYPE: Record<EventType, { label: string; color: string }> = {
  DEADLINE: { label: 'Дедлайн', color: '#b42318' },
  TRAINING: { label: 'Навчання', color: '#1b5e8a' },
  DECLARATION: { label: 'Декларування', color: '#8a5a00' },
};

export const TRUSTBOX_STATUS = {
  NEW: { label: 'Нове', color: 'blue' },
  IN_REVIEW: { label: 'Розглядається', color: 'gold' },
  CLOSED: { label: 'Закрито', color: 'default' },
} as const;

export const AUDIT_ACTIONS: Record<string, string> = {
  LOGIN: 'Вхід у систему',
  PASSWORD_CHANGE: 'Зміна пароля',
  USER_CREATE: 'Створення користувача',
  USER_UPDATE: 'Зміна користувача',
  DEPARTMENT_CREATE: 'Створення підрозділу',
  DEPARTMENT_UPDATE: 'Зміна підрозділу',
  DEPARTMENT_DELETE: 'Видалення підрозділу',
  ANP_CREATE: 'Створення пункту АНП',
  ANP_UPDATE: 'Зміна пункту АНП',
  ANP_DELETE: 'Видалення пункту АНП',
  ANP_SUBMIT: 'Подання звіту АНП',
  ANP_REVIEW: 'Рішення щодо звіту АНП',
  SURVEY_IMPORT: 'Імпорт опитування',
  SURVEY_DELETE: 'Видалення опитування',
  SURVEY_RAW_DOWNLOAD: 'Завантаження сирих даних опитування',
  INTEGRITY_PUBLISH: 'Публікація Integrity Index',
  INTEGRITY_UNPUBLISH: 'Зняття з публікації Integrity Index',
  TRUSTBOX_LIST_VIEW: 'Перегляд Скриньки довіри',
  TRUSTBOX_VIEW: 'Перегляд звернення',
  TRUSTBOX_ATTACHMENT_VIEW: 'Перегляд вкладення звернення',
  TRUSTBOX_UPDATE: 'Зміна статусу звернення',
  CONSULTATION_ANSWER: 'Відповідь на консультацію',
  TELEGRAM_LINK_CODE: 'Код прив\'язки Telegram',
  TELEGRAM_LINK: 'Прив\'язка Telegram',
  TELEGRAM_UNLINK: 'Відв\'язка Telegram',
};

export const AUDIT_ENTITIES: Record<string, string> = {
  User: 'Користувач',
  Department: 'Підрозділ',
  ANPItem: 'Пункт АНП',
  SurveyImport: 'Опитування',
  KnowledgeItem: 'База знань',
  RiskRegistryItem: 'Реєстр ризиків',
  CalendarEvent: 'Календар',
  TrustBoxMessage: 'Скринька довіри',
  FaqItem: 'Поширені запитання',
  ConsultationRequest: 'Консультація',
};
