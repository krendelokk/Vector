# Антикорупційний вебпортал університету

Портал із рольовим доступом: контроль виконання Антикорупційної програми (АНП), Integrity Index за анонімними опитуваннями, база знань, реєстр корупційних ризиків, календар, Скринька довіри та консультації.

Знімки екранів: `docs/screenshots/`.

Стек за ТЗ: NestJS + Prisma + PostgreSQL 16 на backend, React 18 + Vite + Ant Design + Recharts + Zustand + TanStack Query + React Hook Form + Zod на frontend, Docker Compose + Nginx (TLS), GitHub Actions.

---

## Швидкий старт (показ)

Потрібен лише [Node.js 22 або новіший](https://nodejs.org). PostgreSQL встановлювати не треба.

```powershell
cd anticorruption-portal
npm run dev
```

Перший запуск сам встановлює залежності (кілька хвилин), створює демо-базу в `backend\.demo-db` і заповнює її демо-даними. Коли все готово, браузер відкриється на `http://localhost:5173`. Пароль усіх демо-користувачів `Demo-Portal-2026`, логіни: `officer@`, `rector@`, `director@`, `responsible@`, `admin@univ.edu.ua`.

`Ctrl+C` зупиняє все разом із базою. Наступні запуски займають кілька секунд, дані зберігаються. Скинути дані: видаліть `backend\.demo-db` і `backend\.demo-db-seeded`.

Запускайте PowerShell звичайним способом (не "від імені адміністратора"). Якщо PowerShell пише, що виконання сценаріїв вимкнено: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## Зміст

1. [Рішення, що відрізняються від ТЗ](#1-рішення-що-відрізняються-від-тз)
2. [Ролі та доступ](#2-ролі-та-доступ)
3. [Запуск для розробки (Windows)](#3-запуск-для-розробки-windows)
4. [Розгортання на сервері (Docker)](#4-розгортання-на-сервері-docker)
5. [Файл опитування та Integrity Index](#5-файл-опитування-та-integrity-index)
6. [Telegram-бот](#6-telegram-бот)
7. [Анонімність Скриньки довіри](#7-анонімність-скриньки-довіри)
8. [Тести](#8-тести)
9. [Структура репозиторію](#9-структура-репозиторію)

---

## 1. Рішення, що відрізняються від ТЗ

| Пункт ТЗ | Що зроблено | Чому |
|---|---|---|
| 4 ролі в enum, але "п'ять ролей" у розділі 1 | Додано 5-ту роль `ADMIN` | Узгоджено із замовником. ADMIN керує користувачами, підрозділами й переглядає журнал дій. Доступу до АНП, опитувань і Скриньки довіри не має |
| Node.js 20 LTS | Node.js 22 LTS | Підтримка Node 20 завершилася у квітні 2026 |
| Prisma (без версії) | Prisma 7 з драйвером `@prisma/adapter-pg` | Поточна стабільна гілка. Prisma 8 має інший API і ще в статусі RC |
| `xlsx` з npm | `xlsx` 0.20.3 з `cdn.sheetjs.com` | Версія в npm (0.18.5) має відомі вразливості при читанні файлів. SheetJS публікує виправлені версії лише на своєму CDN |
| Telegram для сповіщень і файлів | Бот лише приймає файли опитувань | Розділ 10: нагадування тільки всередині вебдодатку |
| Нагадування | Внутрішні сповіщення (дзвіночок у шапці) | Щоденна перевірка о 00:05 і одразу після старту сервера |
| MinIO (опційно) | Локальний том `uploads` | Простіше для власної інфраструктури. `StorageService` можна замінити на S3/MinIO без змін в інших модулях |
| Формула Integrity Index | Окремий файл `backend/src/integrity-index/integrity-formula.ts` | Команда розробляє власну формулу (розділ 10). Зараз стоїть формула за замовчуванням з кроку 6 ТЗ |
| "Порівняльна аналітика" для директорів | Порівняння між періодами опитувань | Дані опитувань не містять розбивки за підрозділами |
| Let's Encrypt | Підтримано, плюс варіант із сертифікатом внутрішнього CA | Let's Encrypt працює лише з публічним доменом |
| Публікація підсумків | Публікувати можна лише за умови ≥ 5 респондентів | Захист анонімності малих вибірок (`MIN_RESPONDENTS_TO_PUBLISH`) |

## 2. Ролі та доступ

Перевірка ролі й підрозділу робиться на сервері для кожного ендпоінта (глобальні guards, політика "заборонено, якщо не дозволено явно"). Обмеження на фронті лише ховають недоступні пункти меню.

| Розділ | Адмін | Уповноважений | Ректорат | Директор | Відповідальна особа |
|---|---|---|---|---|---|
| АНП: перегляд | немає | усе | усе | свій підрозділ | свої пункти |
| АНП: створення, затвердження | немає | так | немає | немає | немає |
| АНП: подання звіту | немає | немає | немає | якщо призначений | свої пункти |
| Integrity Index: опубліковані підсумки | немає | так | так | так | так |
| Integrity Index: імпорт, публікація, сирі файли | немає | так | немає | немає | немає |
| База знань, ризики, календар: перегляд | так | так | так | так | так |
| База знань, ризики, календар: редагування | немає | так | немає | немає | немає |
| Скринька довіри: надіслати | немає | так | так | так | так |
| Скринька довіри: вхідні | немає | так | немає | немає | немає |
| Консультації | немає | відповідає на всі | свої | свої | свої |
| Користувачі, підрозділи, журнал дій | так | так (крім адмінів) | немає | немає | немає |

## 3. Запуск для розробки (Windows)

### Швидкий показ без встановлення PostgreSQL

Потрібен лише [Node.js 22 LTS](https://nodejs.org). База запускається з папки проєкту (пакет `embedded-postgres`), у систему нічого не встановлюється, служб і автозапуску немає.

Вікно PowerShell 1:

```powershell
cd backend
npm install
npm run demo
```

Перший запуск створює базу в `backend\.demo-db` і заповнює демо-даними (близько хвилини). `Ctrl+C` зупиняє і backend, і базу. Щоб скинути дані, видаліть папку `.demo-db` і файл `.demo-db-seeded`. Базу використовує порт 5433; якщо він зайнятий: `$env:DEMO_DB_PORT=5434; npm run demo`.

Вікно PowerShell 2:

```powershell
cd frontend
npm install
npm run dev
```

Відкрийте `http://localhost:5173`.

### Повноцінний запуск зі встановленим PostgreSQL

Потрібно: [Node.js 22 LTS](https://nodejs.org), PostgreSQL 16 (інсталятор або Docker Desktop), Git.

**1. База даних.** Найпростіше через Docker Desktop (PowerShell):

```powershell
docker run -d --name portal-db -e POSTGRES_DB=portal -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -p 5432:5432 postgres:16-alpine
```

Або встановіть PostgreSQL 16 і створіть користувача `portal` з паролем `portal` та базу `portal`.

**2. Backend** (у першому вікні PowerShell):

```powershell
cd backend
copy .env.example .env
npm install
npx prisma migrate deploy
npm run seed
npm run start:dev
```

API працює на `http://localhost:3000/api`.

**3. Frontend** (у другому вікні):

```powershell
cd frontend
npm install
npm run dev
```

Відкрийте `http://localhost:5173`. Vite проксює `/api` на backend.

**Демо-облікові записи** (пароль у всіх `Demo-Portal-2026`):

| Email | Роль |
|---|---|
| admin@univ.edu.ua | Адміністратор |
| officer@univ.edu.ua | Уповноважений |
| rector@univ.edu.ua | Ректорат |
| director@univ.edu.ua | Директор, Інститут інформаційних технологій |
| director.law@univ.edu.ua | Директор, Юридичний інститут |
| responsible@univ.edu.ua | Відповідальна особа, ІІТ |
| responsible.law@univ.edu.ua | Відповідальна особа, Юридичний інститут |

`npm run seed` очищає всі таблиці й створює демо-дані заново. У продакшні скрипт не запуститься без `SEED_FORCE=true`.

Після 5 невдалих спроб входу обліковий запис блокується на 15 хвилин (інші користувачі входять як звичайно). Блокування рахується за обліковим записом, а не за IP-адресою, бо в мережі університету всі часто мають одну адресу.

## 4. Розгортання на сервері (Docker)

```bash
cp .env.example .env      # заповніть POSTGRES_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
mkdir certs certbot-www
# покладіть сертифікат у certs/fullchain.pem і ключ у certs/privkey.pem (див. нижче)
docker compose up -d --build
```

Міграції застосовуються автоматично під час старту backend. Перший обліковий запис адміністратора створіть так:

```bash
docker compose exec backend npm run seed   # лише для демо, очищає БД
```

або без демо-даних, одним SQL-запитом через `docker compose exec postgres psql -U portal` (хеш пароля згенеруйте командою `docker compose exec backend node -e "console.log(require('bcrypt').hashSync('ВашПароль123', 12))"`):

```sql
INSERT INTO "User" (id, email, "passwordHash", "fullName", role, "updatedAt")
VALUES (gen_random_uuid(), 'admin@univ.edu.ua', '<хеш>', 'Прізвище Ім''я', 'ADMIN', now());
```

**Секрети.** Linux: `openssl rand -hex 48`. Windows PowerShell:

```powershell
-join ((1..48) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
```

**TLS, варіант А: Let's Encrypt** (сервер доступний з інтернету за доменом):

```bash
docker compose stop frontend
docker run --rm -p 80:80 -v "$PWD/certs-le:/etc/letsencrypt" certbot/certbot certonly --standalone -d portal.univ.edu.ua
cp certs-le/live/portal.univ.edu.ua/fullchain.pem certs/
cp certs-le/live/portal.univ.edu.ua/privkey.pem certs/
docker compose start frontend
```

Подальше оновлення: `certbot renew --webroot -w ./certbot-www` (nginx уже віддає `/.well-known/acme-challenge/`).

**TLS, варіант Б: внутрішня мережа.** Попросіть у ІТ-відділу сертифікат від внутрішнього центру сертифікації для імені сервера і покладіть його в `certs/`. Для швидкої перевірки підійде самопідписаний (браузер покаже попередження):

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout certs/privkey.pem -out certs/fullchain.pem -subj "/CN=portal.local"
```

**Резервні копії.** БД: `docker compose exec postgres pg_dump -U portal portal > backup.sql`. Файли лежать у томі `uploads`.

## 5. Файл опитування та Integrity Index

Уповноважений вивантажує відповіді з Google Forms (CSV або XLSX) і завантажує на сторінці Integrity Index, вкладка "Імпорт і публікація", або через Telegram-бота. Приклад: `samples/survey-example.csv`.

Конвенція заголовків питань:

* `[Закупівлі] Процедури закупівель відкриті` означає питання зони ризику "Закупівлі";
* `(R)` у кінці заголовка означає зворотну шкалу (висока згода = гірший результат);
* колонки без числових відповідей (позначка часу, текстові поля) ігноруються;
* відповіді виду `4 - скоріше згоден` розпізнаються як `4`.

Формула за замовчуванням (`mean-normalized-v1`):

1. кожна відповідь нормалізується до 0..100: `(x − min) / (max − min) × 100`, для зворотних питань `100 − значення`;
2. індекс питання = середнє нормалізованих відповідей;
3. індекс зони = середнє індексів її питань;
4. Integrity Index = середнє індексів зон (усі зони мають однакову вагу).

Щоб замінити формулу, перепишіть `computeIntegrityIndex` у `backend/src/integrity-index/integrity-formula.ts` і змініть `FORMULA_VERSION`. Версія формули зберігається з кожним імпортом. Тести формули: `integrity-formula.spec.ts`.

Сирі файли зберігаються лише на сервері та доступні тільки уповноваженому. Інші ролі отримують агреговані показники після публікації.

## 6. Telegram-бот

1. Створіть бота через @BotFather, токен запишіть у `TELEGRAM_BOT_TOKEN`.
2. Режим: `TELEGRAM_MODE=polling` для внутрішньої мережі (сервер сам опитує Telegram), або `webhook` з публічною адресою `TELEGRAM_WEBHOOK_URL` і секретом `TELEGRAM_WEBHOOK_SECRET`.
3. Уповноважений у порталі: Профіль, "Отримати код прив'язки", потім надсилає боту `/link КОД`.
4. Далі файл CSV/XLSX надсилається боту як документ, у підписі вказується період, наприклад `2026, весна`. Імпорт створює чернетку, публікується вона в порталі.

## 7. Анонімність Скриньки довіри

* Ендпоінт `POST /api/trust-box/message` публічний: токен не перевіряється й не читається. Фронтенд надсилає анонімне звернення окремим клієнтом без заголовка `Authorization` і без cookies.
* Модель `TrustBoxMessage` не має полів для користувача, IP чи user-agent.
* Подання не пишеться в `audit_log`. Перегляд звернень уповноваженим пишеться.
* Nginx не веде access-лог для цього маршруту.
* Rate limit (3 на хвилину) рахує хеш IP із випадковою сіллю, що існує лише в пам'яті процесу.
* Назва прикріпленого файлу замінюється на нейтральну. Метадані всередині файлу (автор документа, геолокація фото) сервер не очищає: форма попереджає про це користувача.
* Звіти Sentry не містять IP, заголовків, cookies і тіл запитів.

## 8. Тести

```powershell
cd backend
npm run seed                                  # тести очікують демо-дані
npx jest --config jest.config.js src          # формула Integrity Index
npm run test:e2e                              # наскрізна перевірка ролей (крок 15 ТЗ)
```

E2E-тест перевіряє матрицю доступів з розділу 2: видимість АНП за роллю й підрозділом, неможливість обійти фільтр підрозділу через параметри, ексклюзивний доступ до сирих файлів і Скриньки довіри, відсутність персональних даних в анонімних зверненнях, rate limit, ротацію refresh-токена, відхилення файлів із підробленим розширенням і зайвих полів у запитах.

## 9. Структура репозиторію

```
anticorruption-portal/
├── backend/
│   ├── prisma/            schema.prisma, migrations, seed.ts
│   ├── src/
│   │   ├── auth/          JWT (access 15 хв + refresh у httpOnly cookie), bcrypt 12
│   │   ├── users/         користувачі й підрозділи
│   │   ├── anp/           Модуль 1
│   │   ├── integrity-index/  Модуль 2 (формула окремим файлом)
│   │   ├── knowledge-base/   Модуль 3
│   │   ├── risk-registry/    Модуль 4
│   │   ├── calendar/         Модуль 5
│   │   ├── trust-box/        Модуль 6: Скринька довіри, FAQ, консультації
│   │   ├── notifications/    внутрішні нагадування + cron дедлайнів
│   │   ├── dashboard/        зведення для головної сторінки
│   │   ├── telegram-bot/
│   │   ├── audit-log/
│   │   └── common/        guards, декоратори, фільтр помилок, файли
│   └── test/              e2e-тест RBAC
├── frontend/
│   ├── nginx/nginx.conf   TLS, заголовки безпеки, проксі API
│   └── src/               pages, components, api, store, routes
├── samples/               приклад файлу опитування
├── docker-compose.yml
└── .github/workflows/ci.yml
```
