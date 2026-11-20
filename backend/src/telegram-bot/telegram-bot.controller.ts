import { timingSafeEqual } from 'node:crypto';
import { Body, Controller, Delete, ForbiddenException, Headers, HttpCode, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Audit, CurrentUser, Public, Roles } from '../common/decorators';
import { AuthUser, Role } from '../common/types';
import { TelegramBotService } from './telegram-bot.service';

const safeEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

@Controller('telegram')
export class TelegramBotController {
  constructor(private readonly bot: TelegramBotService) {}

  /** Webhook від Telegram. Перевіряється секрет у заголовку X-Telegram-Bot-Api-Secret-Token. */
  @Public()
  @SkipThrottle()
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() update: unknown) {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
    if (!expected || !secret || !safeEqual(secret, expected)) throw new ForbiddenException();
    await this.bot.handleWebhook(update);
    return { ok: true };
  }

  @Post('link-code')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('TELEGRAM_LINK_CODE', 'User')
  linkCode(@CurrentUser() user: AuthUser) {
    return this.bot.createLinkCode(user.id);
  }

  @Delete('link')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('TELEGRAM_UNLINK', 'User')
  unlink(@CurrentUser() user: AuthUser) {
    return this.bot.unlink(user.id);
  }
}
