import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { concatMap, from, map, Observable } from 'rxjs';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AUDIT_KEY, AuditMeta } from '../decorators';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT_KEY, context.getHandler());
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest();
    // Відповідь іде клієнту лише після запису в журнал: чутлива дія не може лишитися без сліду
    return next.handle().pipe(
      concatMap((result: any) => {
        const entityId = req.params?.id ?? (result && typeof result === 'object' ? result.id : undefined);
        // Для змін статусу фіксуємо новий статус (затвердження, відхилення, публікація тощо)
        const details =
          result && typeof result === 'object' && ('status' in result || 'published' in result)
            ? { status: result.status, published: result.published }
            : undefined;
        return from(this.audit.log(req.user?.id ?? null, meta.action, meta.entity, entityId ?? null, details)).pipe(
          map(() => result),
        );
      }),
    );
  }
}
