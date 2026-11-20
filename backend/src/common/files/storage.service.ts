import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { Response } from 'express';

/**
 * Локальне файлове сховище. Ключі генеруються сервером (папка/uuid.ext),
 * тому ім'я від користувача ніколи не потрапляє у шлях на диску.
 * Для MinIO/S3 достатньо реалізувати ці ж методи.
 */
@Injectable()
export class StorageService {
  private readonly root = resolve(process.env.UPLOAD_DIR ?? './uploads');

  async save(folder: string, buffer: Buffer, originalName: string): Promise<string> {
    const ext = extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '');
    const key = `${folder}/${randomUUID()}${ext}`;
    await mkdir(join(this.root, folder), { recursive: true });
    await writeFile(this.pathFor(key), buffer);
    return key;
  }

  async remove(key: string | null | undefined) {
    if (!key) return;
    try {
      await unlink(this.pathFor(key));
    } catch {
      /* файл уже видалено */
    }
  }

  /** Віддати файл як завантаження. Перевірку прав робить викликач. */
  send(res: Response, key: string, downloadName: string) {
    const path = this.pathFor(key);
    if (!existsSync(path)) throw new NotFoundException('Файл не знайдено');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="file${extname(downloadName)}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
    );
    createReadStream(path).pipe(res);
  }

  private pathFor(key: string) {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new NotFoundException('Файл не знайдено');
    return full;
  }
}
