import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { extname } from 'node:path';
import { Bot } from 'grammy';
import { Role, UploadChannel } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrityIndexService } from '../integrity-index/integrity-index.service';
import { MAX_UPLOAD_BYTES, SURVEY_EXTENSIONS } from '../common/files/file-validation';
import { AuditLogService } from '../audit-log/audit-log.service';

/**
 * Telegram-бот лише для завантаження файлів опитувань уповноваженим.
 * Сповіщень бот не надсилає (ТЗ, розділ 10: нагадування тільки у вебдодатку).
 *
 * Прив'язка: уповноважений отримує одноразовий код у профілі порталу і надсилає боту /link КОД.
 * Далі кожен CSV/XLSX, надісланий з цього чату з підписом-періодом, імпортується від імені уповноваженого.
 */
@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Bot | null = null;
  private readonly token = process.env.TELEGRAM_BOT_TOKEN;

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrity: IntegrityIndexService,
    private readonly audit: AuditLogService,
  ) {}

  get enabled() {
    return Boolean(this.bot);
  }

  async onModuleInit() {
    if (!this.token || process.env.NODE_ENV === 'test') {
      this.logger.log('TELEGRAM_BOT_TOKEN не задано: бот вимкнено');
      return;
    }
    const bot = new Bot(this.token);
    this.registerHandlers(bot);
    try {
      await bot.init();
      if (process.env.TELEGRAM_MODE === 'webhook') {
        await bot.api.setWebhook(process.env.TELEGRAM_WEBHOOK_URL!, {
          secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
          allowed_updates: ['message'],
        });
        this.logger.log('Бот працює в режимі webhook');
      } else {
        await bot.api.deleteWebhook();
        void bot.start({ allowed_updates: ['message'] });
        this.logger.log('Бот працює в режимі polling');
      }
      this.bot = bot;
    } catch (e) {
      this.logger.error(`Не вдалося запустити бота: ${(e as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (this.bot && process.env.TELEGRAM_MODE !== 'webhook') await this.bot.stop();
  }

  async handleWebhook(update: any) {
    if (!this.bot) return;
    await this.bot.handleUpdate(update);
  }

  async createLinkCode(userId: string) {
    const code = randomBytes(4).toString('hex').toUpperCase();
    await this.prisma.user.update({
      where: { id: userId },
      data: { telegramLinkCode: code, telegramLinkExp: new Date(Date.now() + 10 * 60 * 1000) },
    });
    const username = this.bot?.botInfo?.username;
    return { code, botUsername: username ?? null, expiresInMinutes: 10, botEnabled: this.enabled };
  }

  async unlink(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { telegramChatId: null, telegramLinkCode: null, telegramLinkExp: null },
    });
    return { ok: true };
  }

  private registerHandlers(bot: Bot) {
    bot.command('start', (ctx) =>
      ctx.reply(
        'Бот приймає файли опитувань (CSV або XLSX) від антикорупційного уповноваженого.\n' +
          '1. Отримайте код прив\'язки в порталі (Профіль, Telegram).\n' +
          '2. Надішліть сюди: /link КОД\n' +
          '3. Надсилайте файл як документ, у підписі вкажіть період, наприклад: 2026, весна',
      ),
    );

    bot.command('link', async (ctx) => {
      const code = ctx.match?.trim().toUpperCase();
      if (!code) return ctx.reply('Вкажіть код: /link КОД');
      const user = await this.prisma.user.findUnique({ where: { telegramLinkCode: code } });
      if (!user || !user.telegramLinkExp || user.telegramLinkExp < new Date() || user.role !== Role.COMPLIANCE_OFFICER || !user.isActive) {
        return ctx.reply('Код недійсний або прострочений.');
      }
      await this.prisma.user.updateMany({ where: { telegramChatId: String(ctx.chat.id) }, data: { telegramChatId: null } });
      await this.prisma.user.update({
        where: { id: user.id },
        data: { telegramChatId: String(ctx.chat.id), telegramLinkCode: null, telegramLinkExp: null },
      });
      await this.audit.log(user.id, 'TELEGRAM_LINK', 'User', user.id);
      return ctx.reply(`Чат прив'язано до облікового запису ${user.fullName}. Можна надсилати файли опитувань.`);
    });

    bot.on('message:document', async (ctx) => {
      const user = await this.prisma.user.findUnique({ where: { telegramChatId: String(ctx.chat.id) } });
      if (!user || !user.isActive || user.role !== Role.COMPLIANCE_OFFICER) {
        return ctx.reply('Цей чат не прив\'язано до облікового запису уповноваженого.');
      }
      const doc = ctx.message.document;
      const name = doc.file_name ?? 'survey';
      const ext = extname(name).slice(1).toLowerCase();
      if (!SURVEY_EXTENSIONS.includes(ext)) return ctx.reply('Підтримуються лише файли CSV та XLSX.');
      if ((doc.file_size ?? 0) > MAX_UPLOAD_BYTES) return ctx.reply('Файл завеликий.');
      const period = ctx.message.caption?.trim();
      if (!period) return ctx.reply('Додайте до файлу підпис з періодом, наприклад: 2026, весна');

      try {
        const file = await ctx.getFile();
        const res = await fetch(`https://api.telegram.org/file/bot${this.token}/${file.file_path}`);
        if (!res.ok) throw new Error('Не вдалося завантажити файл з Telegram');
        const buffer = Buffer.from(await res.arrayBuffer());
        const result = await this.integrity.importSurvey(user.id, {
          buffer, fileName: name, ext, periodLabel: period, channel: UploadChannel.TELEGRAM,
        });
        return ctx.reply(
          `Імпортовано: ${result.periodLabel}\nРеспондентів: ${result.respondentsCount}\n` +
            `Integrity Index: ${result.integrityIndex}\nПідсумки ще не опубліковані: опублікуйте їх у порталі.`,
        );
      } catch (e) {
        const msg = (e as any)?.response?.message ?? (e as Error).message;
        return ctx.reply(`Помилка імпорту: ${Array.isArray(msg) ? msg.join('; ') : msg}`);
      }
    });

    bot.catch((err) => this.logger.error(`Помилка бота: ${err.message}`));
  }
}
