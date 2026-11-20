import { Global, Module } from '@nestjs/common';
import { DeadlinesCron } from './deadlines.cron';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, DeadlinesCron],
  exports: [NotificationsService, DeadlinesCron],
})
export class NotificationsModule {}
