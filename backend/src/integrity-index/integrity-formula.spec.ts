import { computeIntegrityIndex, parseHeader, toScore } from './integrity-formula';

describe('integrity-formula', () => {
  it('розбирає зону ризику і зворотну шкалу із заголовка', () => {
    expect(parseHeader('[Закупівлі] Питання (R)')).toEqual({ area: 'Закупівлі', question: 'Питання', reversed: true });
    expect(parseHeader('Просте питання')).toEqual({ area: 'Загальне', question: 'Просте питання', reversed: false });
  });

  it('витягує бал із текстових відповідей Google Forms', () => {
    expect(toScore('4 - скоріше згоден')).toBe(4);
    expect(toScore('так')).toBeNull();
  });

  it('нормалізує до 0..100 і рахує зони з однаковою вагою', () => {
    const headers = ['Час', '[A] q1', '[A] q2', '[B] q3 (R)', 'Текст'];
    const rows = [
      ['t', 5, 1, 1, 'x'],
      ['t', 5, 1, 1, 'y'],
    ];
    const r = computeIntegrityIndex(headers, rows, { scaleMin: 1, scaleMax: 5 });
    // A: (100 + 0) / 2 = 50; B: зворотне 1 → 100; загальний (50 + 100) / 2 = 75
    expect(r.areas.find((a) => a.area === 'A')?.index).toBe(50);
    expect(r.areas.find((a) => a.area === 'B')?.index).toBe(100);
    expect(r.index).toBe(75);
    expect(r.respondents).toBe(2);
  });

  it('відмовляє, якщо числових питань немає', () => {
    expect(() => computeIntegrityIndex(['a'], [['так']], { scaleMin: 1, scaleMax: 5 })).toThrow();
  });
});
