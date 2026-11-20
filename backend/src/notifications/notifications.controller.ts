import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../common/decorators';
import { ALL_ROLES, AuthUser } from '../common/types';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@Roles(...ALL_ROLES)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const [items, unread] = await Promise.all([
      this.notifications.list(user.id),
      this.notifications.unreadCount(user.id),
    ]);
    return { items, unread };
  }

  @Patch(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }
}
