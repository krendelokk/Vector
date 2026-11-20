/**
 * Формула Integrity Index.
 *
 * ТЗ (розділ 10): формулу розробляє команда проєкту. Цей файл ізольований навмисно:
 * щоб замінити формулу, достатньо переписати computeIntegrityIndex і змінити FORMULA_VERSION.
 * Усе інше (імпорт, збереження, графіки) працює з результатом IntegrityResult.
 *
 * Поточна реалізація (за замовчуванням із кроку 6 ТЗ):
 *  - кожна числова відповідь нормалізується до 0..100: (x - min) / (max - min) * 100;
 *  - питання зі зворотною шкалою (позначка "(R)" у заголовку) інвертуються: 100 - значення;
 *  - індекс питання це середнє нормалізованих відповідей;
 *  - індекс зони ризику це середнє індексів її питань;
 *  - загальний індекс це середнє індексів зон (кожна зона має однакову вагу).
 *
 * Конвенція заголовків колонок у файлі опитування:
 *   "[Закупівлі] Чи відомі вам випадки ..."      → зона "Закупівлі"
 *   "[Кадри] Керівництво реагує на ... (R)"       → зона "Кадри", зворотна шкала
 *   Колонки без числових відповідей (позначка часу, текст) ігноруються.
 */

export const FORMULA_VERSION = 'mean-normalized-v1';
export const DEFAULT_AREA = 'Загальне';

export interface FormulaOptions {
  scaleMin: number;
  scaleMax: number;
}

export interface QuestionResult {
  question: string;
  area: string;
  reversed: boolean;
  answers: number;
  index: number;
}

export interface AreaResult {
  area: string;
  index: number;
  questions: number;
  answers: number;
}

export interface IntegrityResult {
  index: number;
  respondents: number;
  areas: AreaResult[];
  questions: QuestionResult[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** "5", 5, "5 - повністю згоден" → 5; інше → null. */
export function toScore(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = v.trim().match(/^(-?\d+(?:[.,]\d+)?)/);
    if (m) return Number(m[1].replace(',', '.'));
  }
  return null;
}

export function parseHeader(header: string): { area: string; question: string; reversed: boolean } {
  let h = header.trim();
  const reversed = /\((R|зворотн[ае])\)\s*$/i.test(h);
  if (reversed) h = h.replace(/\((R|зворотн[ае])\)\s*$/i, '').trim();
  const m = h.match(/^\[([^\]]+)\]\s*(.*)$/);
  return m ? { area: m[1].trim(), question: m[2].trim() || m[1].trim(), reversed } : { area: DEFAULT_AREA, question: h, reversed };
}

export function computeIntegrityIndex(headers: string[], rows: unknown[][], opts: FormulaOptions): IntegrityResult {
  const { scaleMin, scaleMax } = opts;
  if (!(scaleMax > scaleMin)) throw new Error('Максимум шкали має бути більшим за мінімум');

  const questions: QuestionResult[] = [];
  const respondentRows = new Set<number>();

  headers.forEach((header, col) => {
    if (!header || !String(header).trim()) return;
    const values: number[] = [];
    let nonEmpty = 0;
    rows.forEach((row, r) => {
      const raw = row[col];
      if (raw === undefined || raw === null || raw === '') return;
      nonEmpty++;
      const s = toScore(raw);
      if (s !== null && s >= scaleMin && s <= scaleMax) {
        values.push(s);
        respondentRows.add(r);
      }
    });
    // Колонка вважається питанням зі шкалою, якщо більшість відповідей числові
    if (!values.length || values.length < nonEmpty * 0.8) return;

    const { area, question, reversed } = parseHeader(String(header));
    const normalized = values.map((v) => ((v - scaleMin) / (scaleMax - scaleMin)) * 100);
    const qIndex = mean(normalized);
    questions.push({ question, area, reversed, answers: values.length, index: round1(reversed ? 100 - qIndex : qIndex) });
  });

  if (!questions.length) {
    throw new Error(`У файлі не знайдено питань із числовими відповідями в діапазоні ${scaleMin}..${scaleMax}`);
  }

  const byArea = new Map<string, QuestionResult[]>();
  for (const q of questions) byArea.set(q.area, [...(byArea.get(q.area) ?? []), q]);

  const areas: AreaResult[] = [...byArea.entries()].map(([area, qs]) => ({
    area,
    index: round1(mean(qs.map((q) => q.index))),
    questions: qs.length,
    answers: qs.reduce((a, q) => a + q.answers, 0),
  }));

  return {
    index: round1(mean(areas.map((a) => a.index))),
    respondents: respondentRows.size,
    areas,
    questions,
  };
}
