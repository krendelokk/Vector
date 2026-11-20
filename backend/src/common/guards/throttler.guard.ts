import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

const SALT = randomBytes(16).toString('hex');

/**
 * Rate limiting без зберігання IP у відкритому вигляді:
 * трекер це хеш IP із сіллю, що живе лише в пам'яті процесу.
 */
@Injectable()
export class HashedIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const ip = String(req.ip ?? '');
    return createHash('sha256').update(SALT + ip).digest('hex');
  }
}
