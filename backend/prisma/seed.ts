/**
 * Демо-дані: підрозділи, по користувачу на кожну роль, пункти АНП у різних статусах,
 * база знань, реєстр ризиків, календар, FAQ і два імпорти опитувань.
 *
 * Запуск: npm run seed  (повторний запуск очищає демо-дані й створює їх заново)
 * У продакшні скрипт відмовиться працювати без SEED_FORCE=true.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';
import { ANPStatus, CalendarEventType, KnowledgeCategory, RiskLevel, Role } from '../src/generated/prisma/enums';
import { computeIntegrityIndex, FORMULA_VERSION } from '../src/integrity-index/integrity-formula';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
export const DEMO_PASSWORD = 'Demo-Portal-2026';
const DAY = 24 * 3600 * 1000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);
const atTen = (n: number) => { const d = daysFromNow(n); d.setHours(10, 0, 0, 0); return d; };

/** Детермінований генератор, щоб демо-дані були однаковими при кожному запуску. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const QUESTIONS = [
  '[Освітній процес] Оцінювання знань у моєму підрозділі є чесним і прозорим',
  '[Освітній процес] Мені пропонували неправомірну вигоду за оцінку (R)',
  '[Закупівлі] Процедури закупівель в університеті відкриті та зрозумілі',
  '[Закупівлі] Я знаю, куди повідомити про порушення під час закупівель',
  '[Кадри] Призначення на посади відбуваються на конкурсній основі',
  '[Кадри] Родинні зв\'язки впливають на кар\'єру в університеті (R)',
  '[Культура доброчесності] Я довіряю Скриньці довіри',
  '[Культура доброчесності] Керівництво особисто демонструє доброчесну поведінку',
];

function syntheticSurvey(respondents: number, bias: number, seed: number) {
  const r = rng(seed);
  const header = ['Позначка часу', ...QUESTIONS, 'Ваші пропозиції'];
  const lines = [header];
  for (let i = 0; i < respondents; i++) {
    const row = [`2026-0${(seed % 5) + 3}-1${i % 9} 10:${String(i % 60).padStart(2, '0')}:00`];
    QUESTIONS.forEach((q) => {
      const reversed = q.endsWith('(R)');
      let v = Math.round(1 + r() * 4 + bias);
      if (reversed) v = 6 - v;
      row.push(String(Math.min(5, Math.max(1, v))));
    });
    row.push(i % 4 === 0 ? 'Більше тренінгів' : '');
    lines.push(row);
  }
  return lines;
}

const toCsv = (rows: string[][]) =>
  '﻿' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');

async function saveFile(folder: string, name: string, content: string) {
  const root = resolve(process.env.UPLOAD_DIR ?? './uploads');
  const key = `${folder}/${randomUUID()}.csv`;
  await mkdir(join(root, folder), { recursive: true });
  await writeFile(join(root, key), content, 'utf8');
  return key;
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== 'true') {
    throw new Error('Seed у продакшні заборонено. Для примусового запуску задайте SEED_FORCE=true');
  }

  console.log('Очищення таблиць...');
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.consultationRequest.deleteMany(),
    prisma.trustBoxMessage.deleteMany(),
    prisma.faqItem.deleteMany(),
    prisma.calendarEvent.deleteMany(),
    prisma.riskRegistryItem.deleteMany(),
    prisma.knowledgeItem.deleteMany(),
    prisma.surveyImport.deleteMany(),
    prisma.aNPItem.deleteMany(),
    prisma.user.deleteMany(),
    prisma.department.deleteMany(),
  ]);

  const [iit, law, econ] = await Promise.all(
    ['Інститут інформаційних технологій', 'Юридичний інститут', 'Інститут економіки та управління'].map((name) =>
      prisma.department.create({ data: { name } }),
    ),
  );
  const accounting = await prisma.department.create({ data: { name: 'Бухгалтерія' } });

  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const mk = (email: string, fullName: string, role: Role, departmentId?: string) =>
    prisma.user.create({ data: { email, fullName, role, departmentId, passwordHash: hash } });

  const admin = await mk('admin@univ.edu.ua', 'Кравченко Андрій Олегович', Role.ADMIN);
  const officer = await mk('officer@univ.edu.ua', 'Мельник Олена Петрівна', Role.COMPLIANCE_OFFICER);
  await mk('rector@univ.edu.ua', 'Шевченко Ігор Васильович', Role.RECTORATE);
  await mk('director@univ.edu.ua', 'Бондаренко Наталія Сергіївна', Role.INSTITUTE_DIRECTOR, iit.id);
  await mk('director.law@univ.edu.ua', 'Ткаченко Віктор Іванович', Role.INSTITUTE_DIRECTOR, law.id);
  const resp = await mk('responsible@univ.edu.ua', 'Коваленко Марія Андріївна', Role.RESPONSIBLE_PERSON, iit.id);
  const respLaw = await mk('responsible.law@univ.edu.ua', 'Олійник Дмитро Павлович', Role.RESPONSIBLE_PERSON, law.id);
  const respEcon = await mk('responsible.econ@univ.edu.ua', 'Лисенко Ірина Миколаївна', Role.RESPONSIBLE_PERSON, econ.id);
  const respAcc = await mk('responsible.acc@univ.edu.ua', 'Савченко Оксана Юріївна', Role.RESPONSIBLE_PERSON, accounting.id);

  const anp: Array<{
    title: string; dept: string; resp: string; deadline: Date; status: ANPStatus; report?: string; comment?: string;
  }> = [
    { title: 'Оновити антикорупційну пам\'ятку для працівників інституту', dept: iit.id, resp: resp.id, deadline: daysFromNow(5), status: ANPStatus.PENDING },
    { title: 'Провести навчання з конфлікту інтересів для кафедр', dept: iit.id, resp: resp.id, deadline: daysFromNow(20), status: ANPStatus.PENDING },
    { title: 'Звіт про перевірку процедур оцінювання здобувачів', dept: iit.id, resp: resp.id, deadline: daysFromNow(-3), status: ANPStatus.OVERDUE },
    { title: 'Аналіз скарг здобувачів за семестр', dept: iit.id, resp: resp.id, deadline: daysFromNow(-10), status: ANPStatus.APPROVED, report: 'Скарги проаналізовано, підсумки обговорено на вченій раді інституту.' },
    { title: 'Перевірка декларацій доброчесності викладачів', dept: law.id, resp: respLaw.id, deadline: daysFromNow(2), status: ANPStatus.SUBMITTED, report: 'Зібрано 46 декларацій із 48. Двоє викладачів у відпустці, подадуть після повернення.' },
    { title: 'Оцінка корупційних ризиків у приймальній комісії', dept: law.id, resp: respLaw.id, deadline: daysFromNow(12), status: ANPStatus.REJECTED, report: 'Ризики оцінено.', comment: 'Додайте перелік виявлених ризиків і заходи щодо кожного.' },
    { title: 'Публікація звітів про використання коштів на сайті', dept: econ.id, resp: respEcon.id, deadline: daysFromNow(30), status: ANPStatus.PENDING },
    { title: 'Ревізія договорів з постачальниками', dept: accounting.id, resp: respAcc.id, deadline: daysFromNow(-25), status: ANPStatus.APPROVED, report: 'Перевірено 112 договорів, порушень не виявлено.' },
    { title: 'Впровадження двоетапного погодження закупівель понад 50 тис. грн', dept: accounting.id, resp: respAcc.id, deadline: daysFromNow(7), status: ANPStatus.SUBMITTED, report: 'Порядок затверджено наказом, процедура працює з 1 листопада.' },
  ];
  for (const a of anp) {
    await prisma.aNPItem.create({
      data: {
        title: a.title, departmentId: a.dept, responsibleId: a.resp, deadline: a.deadline, status: a.status,
        description: 'Пункт Антикорупційної програми університету на 2026 рік.',
        reportText: a.report, submittedAt: a.report ? daysFromNow(-1) : null,
        reviewComment: a.comment ?? null,
        reviewedById: a.status === ANPStatus.APPROVED || a.status === ANPStatus.REJECTED ? officer.id : null,
        reviewedAt: a.status === ANPStatus.APPROVED || a.status === ANPStatus.REJECTED ? daysFromNow(-1) : null,
      },
    });
  }

  // Опитування: два періоди, перший опубліковано
  for (const [i, s] of [
    { label: '2025, осінь', n: 64, bias: -0.3, published: true },
    { label: '2026, весна', n: 81, bias: 0.2, published: true },
  ].entries()) {
    const rows = syntheticSurvey(s.n, s.bias, 7 + i);
    const result = computeIntegrityIndex(rows[0], rows.slice(1), { scaleMin: 1, scaleMax: 5 });
    const key = await saveFile('surveys', `survey-${i}.csv`, toCsv(rows));
    await prisma.surveyImport.create({
      data: {
        uploadedById: officer.id, periodLabel: s.label, rawFileUrl: key, rawFileName: `Опитування ${s.label}.csv`,
        respondentsCount: result.respondents, integrityIndex: result.index,
        riskAreas: { areas: result.areas, questions: result.questions } as any, formulaVersion: FORMULA_VERSION,
        published: s.published, publishedAt: s.published ? daysFromNow(-30 + i * 20) : null,
        createdAt: daysFromNow(-60 + i * 30),
      },
    });
  }

  await prisma.knowledgeItem.createMany({
    data: [
      { category: KnowledgeCategory.COURSE, title: 'Онлайн-курс НАЗК "Антикорупційна політика"', url: 'https://nazk.gov.ua', description: 'Базовий курс для працівників закладів освіти.' },
      { category: KnowledgeCategory.MEMO, title: 'Пам\'ятка: як діяти при конфлікті інтересів', description: 'Покроковий порядок повідомлення про реальний чи потенційний конфлікт інтересів.' },
      { category: KnowledgeCategory.TEMPLATE, title: 'Шаблон повідомлення про конфлікт інтересів', description: 'Форма для подання безпосередньому керівнику.' },
      { category: KnowledgeCategory.REGULATION, title: 'Закон України "Про запобігання корупції"', url: 'https://zakon.rada.gov.ua/laws/show/1700-18' },
    ],
  });

  await prisma.riskRegistryItem.createMany({
    data: [
      { area: 'Освітній процес', description: 'Неправомірна вигода за позитивну оцінку під час сесії', riskLevel: RiskLevel.HIGH, mitigation: 'Анонімне тестування, ротація екзаменаторів, опитування здобувачів.' },
      { area: 'Закупівлі', description: 'Дроблення закупівель для уникнення відкритих торгів', riskLevel: RiskLevel.HIGH, mitigation: 'Щоквартальний аналіз закупівель, двоетапне погодження.' },
      { area: 'Кадри', description: 'Призначення близьких осіб у пряме підпорядкування', riskLevel: RiskLevel.MEDIUM, mitigation: 'Декларування родинних зв\'язків під час конкурсу.' },
      { area: 'Гуртожитки', description: 'Непрозорий розподіл місць у гуртожитках', riskLevel: RiskLevel.MEDIUM, mitigation: 'Публічний рейтинг і черга на сайті.' },
      { area: 'Наука', description: 'Конфлікт інтересів під час рецензування', riskLevel: RiskLevel.LOW, mitigation: 'Декларація відсутності конфлікту для рецензентів.' },
    ],
  });

  await prisma.calendarEvent.createMany({
    data: [
      { title: 'Тренінг з академічної доброчесності', date: atTen(4), type: CalendarEventType.TRAINING },
      { title: 'Кінцевий строк подання щорічних декларацій', date: atTen(9), type: CalendarEventType.DECLARATION },
      { title: 'Звіт уповноваженого ректорату', date: atTen(16), type: CalendarEventType.DEADLINE },
    ],
  });

  await prisma.faqItem.createMany({
    data: [
      { sortOrder: 1, question: 'Чи справді анонімне звернення до Скриньки довіри?', answer: 'Так. Якщо позначка анонімності увімкнена, система не зберігає ваше ім\'я, IP-адресу чи дані браузера. Звернення надсилається без прив\'язки до облікового запису. Не вказуйте у тексті відомостей, за якими вас можна впізнати, і пам\'ятайте, що файли (фото, документи) можуть містити метадані автора.' },
      { sortOrder: 2, question: 'Що таке конфлікт інтересів?', answer: 'Це ситуація, коли особистий інтерес працівника впливає або може вплинути на об\'єктивність його службових рішень.' },
      { sortOrder: 3, question: 'Хто бачить мої запитання на консультацію?', answer: 'Лише ви та антикорупційний уповноважений.' },
    ],
  });

  await prisma.trustBoxMessage.create({
    data: { isAnonymous: true, message: 'Під час заліку з дисципліни однієї з кафедр студентам натякали, що оцінку можна покращити за оплату.' },
  });

  console.log('\nДемо-дані створено. Пароль усіх користувачів:', DEMO_PASSWORD);
  console.table(
    (await prisma.user.findMany({ select: { email: true, role: true }, orderBy: { role: 'asc' } })).map((u) => ({ ...u })),
  );
  void admin;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
