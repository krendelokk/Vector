import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators';
import { Role } from '../common/types';
import { AuditLogService } from './audit-log.service';

@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly audit: AuditLogService) {}

  @Get()
  @Roles(Role.ADMIN, Role.COMPLIANCE_OFFICER)
  list(
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    return this.audit.list({
      entity,
      action,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(200, Math.max(1, Number(pageSize) || 50)),
    });
  }
}
