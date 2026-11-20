import {
  BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Response } from 'express';
import { TrustBoxStatus } from '../generated/prisma/enums';
import { Audit, Public, Roles } from '../common/decorators';
import { assertAllowedFile, decodeFileName, uploadOptions } from '../common/files/file-validation';
import { StorageService } from '../common/files/storage.service';
import { Role } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

class TrustBoxMessageDto {
  // multipart передає рядки: "false" лише тоді, коли користувач явно зняв позначку
  @IsOptional()
  @Transform(({ value }) => !(value === false || value === 'false'))
  @IsBoolean()
  isAnonymous: boolean = true;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  contactInfo?: string;

  @IsString()
  @MinLength(10, { message: 'Повідомлення занадто коротке' })
  @MaxLength(20000)
  message: string;
}

class UpdateTrustBoxDto {
  @IsOptional() @IsEnum(TrustBoxStatus) status?: TrustBoxStatus;
  @IsOptional() @IsString() @MaxLength(5000) officerNote?: string;
}

/**
 * Скринька довіри.
 * Анонімність гарантується тим, що:
 *  - ендпоінт подачі публічний: токен не перевіряється й не читається, request.user відсутній;
 *  - у моделі TrustBoxMessage немає полів userId, IP, user-agent;
 *  - подача не пишеться в audit_log; nginx не веде access_log для цього маршруту;
 *  - rate limit рахує хеш IP із сіллю лише в пам'яті процесу.
 */
@Controller('trust-box')
export class TrustBoxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  @Public()
  @Throttle({ default: { limit: () => Number(process.env.TRUSTBOX_RATE_LIMIT ?? 5), ttl: 60_000 } })
  @Post('message')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  async submit(@Body() dto: TrustBoxMessageDto, @UploadedFile() file?: Express.Multer.File) {
    const anonymous = dto.isAnonymous !== false;
    const contactInfo = anonymous ? null : dto.contactInfo?.trim() || null;
    if (!anonymous && !contactInfo) {
      throw new BadRequestException('Для неанонімного звернення вкажіть контакт для відповіді');
    }

    let attachment: { attachmentUrl: string; attachmentName: string } | undefined;
    if (file) {
      const ext = assertAllowedFile(file);
      // Для анонімних звернень оригінальна назва файлу не зберігається: вона може містити ПІБ
      const name = anonymous ? `attachment.${ext}` : decodeFileName(file.originalname);
      attachment = { attachmentUrl: await this.storage.save('trust-box', file.buffer, name), attachmentName: name };
    }

    await this.prisma.trustBoxMessage.create({
      data: { isAnonymous: anonymous, contactInfo, message: dto.message.trim(), ...attachment },
    });
    // Нагадування без змісту повідомлення: лише факт надходження
    await this.notifications.notify(await this.notifications.officerIds(), {
      title: 'Нове звернення до Скриньки довіри',
      link: '/trust-box/inbox',
      dedupeKey: `trustbox:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    });
    return { ok: true };
  }

  @Get('messages')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('TRUSTBOX_LIST_VIEW', 'TrustBoxMessage')
  list(@Query('status') status?: TrustBoxStatus) {
    return this.prisma.trustBoxMessage.findMany({
      where: Object.values(TrustBoxStatus).includes(status as TrustBoxStatus) ? { status } : {},
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, isAnonymous: true, contactInfo: true, message: true, attachmentName: true,
        status: true, officerNote: true, createdAt: true,
      },
    });
  }

  @Get('messages/:id')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('TRUSTBOX_VIEW', 'TrustBoxMessage')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const m = await this.prisma.trustBoxMessage.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Повідомлення не знайдено');
    const { attachmentUrl: _k, ...rest } = m;
    return rest;
  }

  @Get('messages/:id/attachment')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('TRUSTBOX_ATTACHMENT_VIEW', 'TrustBoxMessage')
  async attachment(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const m = await this.prisma.trustBoxMessage.findUnique({ where: { id } });
    if (!m?.attachmentUrl) throw new NotFoundException('Файл не знайдено');
    this.storage.send(res, m.attachmentUrl, m.attachmentName ?? 'attachment');
  }

  @Patch('messages/:id')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('TRUSTBOX_UPDATE', 'TrustBoxMessage')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTrustBoxDto) {
    const m = await this.prisma.trustBoxMessage.update({ where: { id }, data: dto });
    const { attachmentUrl: _k, ...rest } = m;
    return rest;
  }
}
