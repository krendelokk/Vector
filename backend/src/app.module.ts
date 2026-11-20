import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AnpModule } from './anp/anp.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { CalendarModule } from './calendar/calendar.module';
import { StorageModule } from './common/files/storage.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HashedIpThrottlerGuard } from './common/guards/throttler.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { DashboardModule } from './dashboard/dashboard.module';
import { IntegrityIndexModule } from './integrity-index/integrity-index.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { RiskRegistryModule } from './risk-registry/risk-registry.module';
import { TelegramBotModule } from './telegram-bot/telegram-bot.module';
import { TrustBoxModule } from './trust-box/trust-box.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // Загальний ліміт від флуду. Високий, бо за NAT університету багато людей мають одну IP-адресу.
    // Для /auth/login і /trust-box/message задано окремі ліміти через @Throttle.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: Number(process.env.API_RATE_LIMIT ?? 3000) }]),
    PrismaModule,
    StorageModule,
    AuditLogModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    AnpModule,
    IntegrityIndexModule,
    KnowledgeBaseModule,
    RiskRegistryModule,
    CalendarModule,
    TrustBoxModule,
    TelegramBotModule,
    DashboardModule,
  ],
  providers: [
    // Порядок важливий: rate limit → автентифікація → перевірка ролі
    { provide: APP_GUARD, useClass: HashedIpThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
