import { Module } from '@nestjs/common';
import { IntegrityIndexModule } from '../integrity-index/integrity-index.module';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramBotService } from './telegram-bot.service';

@Module({ imports: [IntegrityIndexModule], controllers: [TelegramBotController], providers: [TelegramBotService] })
export class TelegramBotModule {}
