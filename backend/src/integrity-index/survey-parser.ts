import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

/** Читає перший аркуш CSV/XLSX: повертає заголовки й рядки даних. */
export function parseSurveyFile(buffer: Buffer, ext: string): { headers: string[]; rows: unknown[][] } {
  let wb: XLSX.WorkBook;
  try {
    wb =
      ext === 'csv'
        ? XLSX.read(stripBom(buffer).toString('utf8'), { type: 'string', raw: false })
        : XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new BadRequestException('Не вдалося прочитати файл опитування');
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new BadRequestException('Файл не містить аркушів');
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });
  if (data.length < 2) throw new BadRequestException('Файл не містить відповідей');
  const headers = (data[0] as unknown[]).map((h) => (h === null ? '' : String(h)));
  return { headers, rows: data.slice(1) as unknown[][] };
}

function stripBom(buf: Buffer) {
  return buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf;
}
