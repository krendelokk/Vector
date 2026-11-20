import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024;

/** Опції multer для FileInterceptor: файл у пам'яті, жорсткий ліміт розміру. */
export const uploadOptions = { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } };

export const GENERAL_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'csv', 'jpg', 'jpeg', 'png'];
export const SURVEY_EXTENSIONS = ['csv', 'xlsx'];

const startsWith = (buf: Buffer, bytes: number[]) => bytes.every((b, i) => buf[i] === b);

/** Перевірка сигнатури файлу: розширення має відповідати реальному вмісту. */
function matchesSignature(ext: string, buf: Buffer): boolean {
  switch (ext) {
    case 'pdf':
      return startsWith(buf, [0x25, 0x50, 0x44, 0x46]); // %PDF
    case 'png':
      return startsWith(buf, [0x89, 0x50, 0x4e, 0x47]);
    case 'jpg':
    case 'jpeg':
      return startsWith(buf, [0xff, 0xd8, 0xff]);
    case 'docx':
    case 'xlsx':
      return startsWith(buf, [0x50, 0x4b, 0x03, 0x04]); // ZIP-контейнер OOXML
    case 'csv': {
      // Текстовий файл: без нульових байтів у перших 8 КБ
      const head = buf.subarray(0, 8192);
      return !head.includes(0);
    }
    default:
      return false;
  }
}

/** Multer декодує імена як latin1; відновлюємо UTF-8 (кирилиця в назвах файлів). */
export function decodeFileName(name: string): string {
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded.includes('�') ? name : decoded;
  } catch {
    return name;
  }
}

export function assertAllowedFile(
  file: Express.Multer.File | undefined,
  allowed: string[] = GENERAL_EXTENSIONS,
): string {
  if (!file) throw new BadRequestException('Файл не передано');
  if (file.size > MAX_UPLOAD_BYTES) throw new BadRequestException('Файл завеликий');
  const ext = extname(decodeFileName(file.originalname)).slice(1).toLowerCase();
  if (!allowed.includes(ext)) {
    throw new BadRequestException(`Недозволений тип файлу. Дозволено: ${allowed.join(', ')}`);
  }
  if (!matchesSignature(ext, file.buffer)) {
    throw new BadRequestException('Вміст файлу не відповідає його розширенню');
  }
  return ext;
}
