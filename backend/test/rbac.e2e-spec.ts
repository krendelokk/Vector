/**
 * Наскрізна перевірка рольової моделі (ТЗ, розділ 5 і крок 15 плану).
 * Потребує БД із демо-даними: npm run seed, потім npm run test:e2e.
 */
import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.NODE_ENV = 'test';
process.env.LOGIN_RATE_LIMIT = '100';
process.env.TRUSTBOX_RATE_LIMIT = '3';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-test-access-secret-0001';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-test-refresh-secret-01';

const PASSWORD = 'Demo-Portal-2026';
const ACCOUNTS = {
  admin: 'admin@univ.edu.ua',
  officer: 'officer@univ.edu.ua',
  rector: 'rector@univ.edu.ua',
  director: 'director@univ.edu.ua',
  directorLaw: 'director.law@univ.edu.ua',
  responsible: 'responsible@univ.edu.ua',
  responsibleLaw: 'responsible.law@univ.edu.ua',
} as const;
type Who = keyof typeof ACCOUNTS;

let app: INestApplication;
let prisma: PrismaService;
const tokens = {} as Record<Who, string>;
const http = () => request(app.getHttpServer());
const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` });

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);

  for (const [who, email] of Object.entries(ACCOUNTS)) {
    const res = await http().post('/api/auth/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    tokens[who as Who] = res.body.accessToken;
  }
});

afterAll(async () => {
  await app?.close();
});

const ALL: Who[] = ['admin', 'officer', 'rector', 'director', 'responsible'];

/** Перевіряє, що ендпоінт доступний рівно вказаним ролям. */
async function expectOnly(method: 'get' | 'post', url: string, allowed: Who[], body?: object) {
  for (const who of ALL) {
    const req = http()[method](url).set(as(who));
    const res = body ? await req.send(body) : await req;
    if (allowed.includes(who)) {
      expect({ who, url, ok: res.status < 400 }).toEqual({ who, url, ok: true });
    } else {
      expect({ who, url, status: res.status }).toEqual({ who, url, status: 403 });
    }
  }
}

describe('Автентифікація', () => {
  it('без токена захищені ендпоінти повертають 401', async () => {
    await http().get('/api/dashboard').expect(401);
    await http().get('/api/anp/items').expect(401);
  });

  it('невірний пароль дає 401 без підказки, чи існує користувач', async () => {
    const a = await http().post('/api/auth/login').send({ email: ACCOUNTS.officer, password: 'wrong' });
    const b = await http().post('/api/auth/login').send({ email: 'nobody@univ.edu.ua', password: 'wrong' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });

  it('після 5 невдалих спроб обліковий запис тимчасово блокується, інші входять', async () => {
    const victim = 'responsible.econ@univ.edu.ua';
    for (let i = 0; i < 5; i++) {
      await http().post('/api/auth/login').send({ email: victim, password: 'wrong' }).expect(401);
    }
    // навіть правильний пароль тепер не пускає
    await http().post('/api/auth/login').send({ email: victim, password: PASSWORD }).expect(429);
    // інший користувач з тієї ж IP-адреси входить нормально
    await http().post('/api/auth/login').send({ email: ACCOUNTS.directorLaw, password: PASSWORD }).expect(200);
  });

  it('часте оновлення сесії не викидає користувача (немає ліміту на refresh)', async () => {
    const login = await http().post('/api/auth/login').send({ email: ACCOUNTS.director, password: PASSWORD });
    let cookie = (login.headers['set-cookie'][0] as string).split(';')[0];
    for (let i = 0; i < 40; i++) {
      const res = await http().post('/api/auth/refresh').set('Cookie', cookie).expect(200);
      cookie = (res.headers['set-cookie'][0] as string).split(';')[0];
      tokens.director = res.body.accessToken;
    }
  });

  it('refresh-токен видається в httpOnly cookie і ротується', async () => {
    const login = await http().post('/api/auth/login').send({ email: ACCOUNTS.rector, password: PASSWORD });
    const cookie = login.headers['set-cookie'][0] as string;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    const refreshed = await http().post('/api/auth/refresh').set('Cookie', cookie.split(';')[0]).expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    // старий refresh-токен після ротації недійсний
    await http().post('/api/auth/refresh').set('Cookie', cookie.split(';')[0]).expect(401);
    const login2 = await http().post('/api/auth/login').send({ email: ACCOUNTS.rector, password: PASSWORD });
    tokens.rector = login2.body.accessToken;
  });
});

describe('Модуль 1: АНП', () => {
  it('видимість пунктів обмежена роллю й підрозділом на сервері', async () => {
    const total = await prisma.aNPItem.count();
    const director = await prisma.user.findUniqueOrThrow({ where: { email: ACCOUNTS.director } });
    const responsible = await prisma.user.findUniqueOrThrow({ where: { email: ACCOUNTS.responsible } });

    const officer = await http().get('/api/anp/items').set(as('officer')).expect(200);
    const rector = await http().get('/api/anp/items').set(as('rector')).expect(200);
    const dir = await http().get('/api/anp/items').set(as('director')).expect(200);
    const resp = await http().get('/api/anp/items').set(as('responsible')).expect(200);

    expect(officer.body).toHaveLength(total);
    expect(rector.body).toHaveLength(total);
    expect(dir.body.length).toBeGreaterThan(0);
    expect(dir.body.every((i: any) => i.departmentId === director.departmentId)).toBe(true);
    expect(resp.body.every((i: any) => i.responsibleId === responsible.id)).toBe(true);

    // параметр departmentId не дозволяє директору вийти за межі свого підрозділу
    const law = await prisma.department.findFirstOrThrow({ where: { name: 'Юридичний інститут' } });
    const sneaky = await http().get(`/api/anp/items?departmentId=${law.id}`).set(as('director')).expect(200);
    expect(sneaky.body).toHaveLength(0);
    await http().get('/api/anp/items').set(as('admin')).expect(403);
  });

  it('чужий пункт за id недоступний (404, а не дані)', async () => {
    const lawItem = await prisma.aNPItem.findFirstOrThrow({ where: { department: { name: 'Юридичний інститут' } } });
    await http().get(`/api/anp/items/${lawItem.id}`).set(as('director')).expect(404);
    await http().get(`/api/anp/items/${lawItem.id}`).set(as('responsible')).expect(404);
    await http().get(`/api/anp/items/${lawItem.id}`).set(as('directorLaw')).expect(200);
  });

  it('створювати пункти може лише уповноважений', async () => {
    const dept = await prisma.department.findFirstOrThrow({ where: { name: 'Інститут інформаційних технологій' } });
    const resp = await prisma.user.findUniqueOrThrow({ where: { email: ACCOUNTS.responsible } });
    const body = { title: 'Тестовий пункт RBAC', deadline: new Date(Date.now() + 5 * 864e5).toISOString(), departmentId: dept.id, responsibleId: resp.id };
    for (const who of ['admin', 'rector', 'director', 'responsible'] as Who[]) {
      await http().post('/api/anp/items').set(as(who)).send(body).expect(403);
    }
    const created = await http().post('/api/anp/items').set(as('officer')).send(body).expect(201);
    expect(created.body.status).toBe('PENDING');

    // відповідальна особа з іншого підрозділу не може бути призначена
    const respLaw = await prisma.user.findUniqueOrThrow({ where: { email: ACCOUNTS.responsibleLaw } });
    await http().post('/api/anp/items').set(as('officer')).send({ ...body, responsibleId: respLaw.id }).expect(400);

    // звітує лише закріплена особа
    await http().patch(`/api/anp/items/${created.body.id}/submit`).set(as('responsibleLaw')).field('reportText', 'Спроба подати чужий звіт').expect(403);
    await http().patch(`/api/anp/items/${created.body.id}/submit`).set(as('responsible')).field('reportText', 'Виконано повністю, документи додано.').expect(200);

    // директор не може затверджувати; уповноважений може, причому відхилення без коментаря заборонене
    await http().patch(`/api/anp/items/${created.body.id}/review`).set(as('director')).send({ decision: 'APPROVE' }).expect(403);
    await http().patch(`/api/anp/items/${created.body.id}/review`).set(as('officer')).send({ decision: 'REJECT' }).expect(400);
    const approved = await http().patch(`/api/anp/items/${created.body.id}/review`).set(as('officer')).send({ decision: 'APPROVE' }).expect(200);
    expect(approved.body.status).toBe('APPROVED');

    const audit = await prisma.auditLog.findFirst({ where: { action: 'ANP_REVIEW', entityId: created.body.id } });
    expect(audit?.details).toMatchObject({ status: 'APPROVED' });

    await http().delete(`/api/anp/items/${created.body.id}`).set(as('officer')).expect(200);
  });

  it('файл із підробленим розширенням відхиляється', async () => {
    const item = await prisma.aNPItem.findFirstOrThrow({
      where: { responsible: { email: ACCOUNTS.responsible }, status: { in: ['PENDING', 'OVERDUE'] } },
    });
    await http()
      .patch(`/api/anp/items/${item.id}/submit`)
      .set(as('responsible'))
      .field('reportText', 'Звіт із вкладенням для перевірки')
      .attach('file', Buffer.from('MZ\x90\x00 not really a pdf'), 'report.pdf')
      .expect(400);
    await http()
      .patch(`/api/anp/items/${item.id}/submit`)
      .set(as('responsible'))
      .field('reportText', 'Звіт із вкладенням для перевірки')
      .attach('file', Buffer.from('fake'), 'virus.exe')
      .expect(400);
  });

  it('статистика: директор бачить лише свій підрозділ', async () => {
    const res = await http().get('/api/anp/stats').set(as('director')).expect(200);
    expect(res.body.scope).toBe('department');
    expect(res.body.departments).toHaveLength(1);
    const uni = await http().get('/api/anp/stats').set(as('rector')).expect(200);
    expect(uni.body.scope).toBe('university');
  });
});

describe('Модуль 2: Integrity Index', () => {
  it('сирі файли та список імпортів лише для уповноваженого', async () => {
    const imp = await prisma.surveyImport.findFirstOrThrow();
    await expectOnly('get', `/api/integrity-index/raw/${imp.id}`, ['officer']);
    await expectOnly('get', '/api/integrity-index/imports', ['officer']);
  });

  it('опубліковані підсумки бачать усі ролі, крім адміністратора, і без посилань на файли', async () => {
    await expectOnly('get', '/api/integrity-index/published', ['officer', 'rector', 'director', 'responsible']);
    const res = await http().get('/api/integrity-index/published').set(as('responsible')).expect(200);
    for (const row of res.body) {
      expect(row.rawFileUrl).toBeUndefined();
      expect(row.rawFileName).toBeUndefined();
    }
  });

  it('імпорт CSV розраховує індекс; публікація лише уповноваженим', async () => {
    const header = '"Позначка часу","[Закупівлі] Питання А","[Кадри] Питання Б (R)","Коментар"';
    const rows = Array.from({ length: 6 }, (_, i) => `"2026-01-0${i + 1}","5","1","ok"`);
    const csv = Buffer.from([header, ...rows].join('\n'));
    await http().post('/api/integrity-index/import').set(as('rector')).field('periodLabel', 'Тест').attach('file', csv, 's.csv').expect(403);
    const res = await http()
      .post('/api/integrity-index/import')
      .set(as('officer'))
      .field('periodLabel', 'Тест RBAC')
      .attach('file', csv, 's.csv')
      .expect(201);
    // 5 з 5 = 100; зворотне питання з відповіддю 1 = 100
    expect(res.body.integrityIndex).toBe(100);
    expect(res.body.respondentsCount).toBe(6);
    expect(res.body.published).toBe(false);

    await http().post(`/api/integrity-index/${res.body.id}/publish`).set(as('director')).expect(403);
    await http().post(`/api/integrity-index/${res.body.id}/publish`).set(as('officer')).expect(200);
    await http().delete(`/api/integrity-index/${res.body.id}`).set(as('officer')).expect(200);
  });
});

describe('Модулі 3-5: база знань, ризики, календар', () => {
  it('перегляд доступний усім, редагування лише уповноваженому', async () => {
    await expectOnly('get', '/api/knowledge-base', ALL);
    await expectOnly('get', '/api/risks', ALL);
    await expectOnly('get', '/api/calendar/events', ALL);
    for (const who of ['admin', 'rector', 'director', 'responsible'] as Who[]) {
      await http().post('/api/risks').set(as(who)).send({ area: 'Тест', description: 'Опис ризику', riskLevel: 'LOW' }).expect(403);
      await http().post('/api/calendar/events').set(as(who)).send({ title: 'Подія', date: new Date().toISOString(), type: 'TRAINING' }).expect(403);
    }
  });
});

describe('Модуль 6: Скринька довіри та консультації', () => {
  it('вхідні повідомлення бачить лише уповноважений', async () => {
    await expectOnly('get', '/api/trust-box/messages', ['officer']);
  });

  it('анонімне звернення не містить даних про відправника і не потрапляє в аудит', async () => {
    const before = await prisma.auditLog.count();
    const marker = `Анонімний тест ${Date.now()}`;
    // навіть якщо клієнт надіслав токен, він ігнорується
    await http()
      .post('/api/trust-box/message')
      .set(as('responsible'))
      .field('isAnonymous', 'true')
      .field('contactInfo', 'should-be-dropped@univ.edu.ua')
      .field('message', marker)
      .expect(201);
    const saved = await prisma.trustBoxMessage.findFirstOrThrow({ where: { message: marker } });
    expect(saved.isAnonymous).toBe(true);
    expect(saved.contactInfo).toBeNull();
    expect(Object.keys(saved).sort()).toEqual(
      ['attachmentName', 'attachmentUrl', 'contactInfo', 'createdAt', 'id', 'isAnonymous', 'message', 'officerNote', 'status'].sort(),
    );
    expect(await prisma.auditLog.count()).toBe(before);
    await prisma.trustBoxMessage.delete({ where: { id: saved.id } });
  });

  it('неанонімне звернення вимагає контакт', async () => {
    await http().post('/api/trust-box/message').field('isAnonymous', 'false').field('message', 'Повідомлення без контакту').expect(400);
  });

  it('rate limit на /trust-box/message', async () => {
    // ліміт 3 на хвилину: два запити вище вже враховано
    const third = await http().post('/api/trust-box/message').field('message', 'Третє тестове повідомлення');
    expect(third.status).toBe(201);
    const fourth = await http().post('/api/trust-box/message').field('message', 'Четверте тестове повідомлення');
    expect(fourth.status).toBe(429);
    await prisma.trustBoxMessage.deleteMany({ where: { message: 'Третє тестове повідомлення' } });
  });

  it('консультацію бачать лише автор і уповноважений', async () => {
    const created = await http().post('/api/consultations').set(as('responsible')).send({ question: 'Чи можна приймати подарунок від студента?' }).expect(201);
    await http().post('/api/consultations').set(as('officer')).send({ question: 'Уповноважений не ставить запитань сам собі' }).expect(403);
    await http().post('/api/consultations').set(as('admin')).send({ question: 'Адміністратор не має доступу до консультацій' }).expect(403);
    const mine = await http().get('/api/consultations').set(as('responsible')).expect(200);
    const others = await http().get('/api/consultations').set(as('director')).expect(200);
    const officer = await http().get('/api/consultations').set(as('officer')).expect(200);
    expect(mine.body.some((c: any) => c.id === created.body.id)).toBe(true);
    expect(others.body.some((c: any) => c.id === created.body.id)).toBe(false);
    expect(officer.body.some((c: any) => c.id === created.body.id)).toBe(true);
    await http().patch(`/api/consultations/${created.body.id}/answer`).set(as('rector')).send({ answer: 'Ні' }).expect(403);
    await http().patch(`/api/consultations/${created.body.id}/answer`).set(as('officer')).send({ answer: 'Ні, це заборонено.' }).expect(200);
    await prisma.consultationRequest.delete({ where: { id: created.body.id } });
  });
});

describe('Адміністрування', () => {
  it('користувачами керують лише адміністратор і уповноважений', async () => {
    await expectOnly('get', '/api/users', ['admin', 'officer']);
    await expectOnly('get', '/api/audit-log', ['admin', 'officer']);
  });

  it('уповноважений не може створити адміністратора', async () => {
    await http()
      .post('/api/users')
      .set(as('officer'))
      .send({ email: 'evil-admin@univ.edu.ua', password: 'LongPassword123', fullName: 'Тест Тест', role: 'ADMIN' })
      .expect(403);
  });

  it('директор і відповідальна особа потребують підрозділу', async () => {
    await http()
      .post('/api/users')
      .set(as('admin'))
      .send({ email: 'nodept@univ.edu.ua', password: 'LongPassword123', fullName: 'Без Підрозділу', role: 'RESPONSIBLE_PERSON' })
      .expect(400);
  });

  it('зайві поля в тілі запиту відхиляються (mass assignment)', async () => {
    const dept = await prisma.department.findFirstOrThrow();
    const resp = await prisma.user.findUniqueOrThrow({ where: { email: ACCOUNTS.responsible } });
    await http()
      .post('/api/anp/items')
      .set(as('officer'))
      .send({ title: 'Пункт', deadline: new Date().toISOString(), departmentId: dept.id, responsibleId: resp.id, status: 'APPROVED' })
      .expect(400);
  });
});
