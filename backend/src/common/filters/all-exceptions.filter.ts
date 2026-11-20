import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    // Помилка Multer про розмір файлу
    if ((exception as any)?.code === 'LIMIT_FILE_SIZE') {
      res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        statusCode: 413,
        message: `Файл перевищує ліміт ${process.env.MAX_UPLOAD_MB ?? 20} МБ`,
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    if (process.env.SENTRY_DSN) Sentry.captureException(exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, message: 'Внутрішня помилка сервера' });
  }
}
