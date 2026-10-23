import { describe, expect, it } from 'vitest';
import {
  addMonthsClamped,
  daysInMonth,
  isValidISODate,
  makeISODate,
  makePeriod,
  monthsBetween,
  nextPeriod,
  parseISODate,
  periodForDate,
  periodLengthInDays,
  previousPeriod,
} from './periods';

describe('dates calendaires', () => {
  it('valide les dates réelles et rejette les dates impossibles', () => {
    expect(isValidISODate('2026-02-28')).toBe(true);
    expect(isValidISODate('2024-02-29')).toBe(true);
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2026-04-31')).toBe(false);
    expect(isValidISODate('31/03/2026')).toBe(false);
    expect(parseISODate('2026-13-01')).toBeNull();
  });

  it('connaît les fins de mois et les années bissextiles', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
    expect(makeISODate(2024, 2, 29)).toBe('2024-02-29');
    expect(() => makeISODate(2025, 2, 29)).toThrow();
  });
});

describe('appartenance aux périodes (cas limites du cahier des charges)', () => {
  const cases: {
    date: string;
    month: number;
    quarter: number;
    semester: number;
    year: number;
  }[] = [
    { date: '2026-03-31', month: 3, quarter: 1, semester: 1, year: 2026 },
    { date: '2026-04-01', month: 4, quarter: 2, semester: 1, year: 2026 },
    { date: '2026-06-30', month: 6, quarter: 2, semester: 1, year: 2026 },
    { date: '2026-07-01', month: 7, quarter: 3, semester: 2, year: 2026 },
    { date: '2026-09-30', month: 9, quarter: 3, semester: 2, year: 2026 },
    { date: '2026-10-01', month: 10, quarter: 4, semester: 2, year: 2026 },
    { date: '2026-12-31', month: 12, quarter: 4, semester: 2, year: 2026 },
    { date: '2027-01-01', month: 1, quarter: 1, semester: 1, year: 2027 },
  ];

  for (const testCase of cases) {
    it(`classe ${testCase.date} dans le bon mois, trimestre, semestre et année`, () => {
      expect(periodForDate(testCase.date, 'month')).toMatchObject({
        year: testCase.year,
        index: testCase.month,
      });
      expect(periodForDate(testCase.date, 'quarter')).toMatchObject({
        year: testCase.year,
        index: testCase.quarter,
      });
      expect(periodForDate(testCase.date, 'semester')).toMatchObject({
        year: testCase.year,
        index: testCase.semester,
      });
      expect(periodForDate(testCase.date, 'year').year).toBe(testCase.year);
    });
  }

  it('gère le 29 février bissextile et les limites de février', () => {
    expect(periodForDate('2024-02-29', 'month')).toMatchObject({
      start: '2024-02-01',
      end: '2024-02-29',
      index: 2,
    });
    expect(periodForDate('2025-02-28', 'month').end).toBe('2025-02-28');
  });

  it('calcule des bornes inclusives correctes', () => {
    expect(makePeriod('quarter', 2026, 1)).toMatchObject({
      start: '2026-01-01',
      end: '2026-03-31',
    });
    expect(makePeriod('semester', 2026, 2)).toMatchObject({
      start: '2026-07-01',
      end: '2026-12-31',
    });
    expect(makePeriod('year', 2024).end).toBe('2024-12-31');
    expect(periodLengthInDays(makePeriod('year', 2024))).toBe(366);
    expect(periodLengthInDays(makePeriod('year', 2026))).toBe(365);
  });
});

describe('navigation dans les périodes', () => {
  it('recule correctement sur chaque type', () => {
    expect(previousPeriod(makePeriod('month', 2026, 1)).key).toBe('2025-12');
    expect(previousPeriod(makePeriod('quarter', 2026, 1)).key).toBe('2025-Q4');
    expect(previousPeriod(makePeriod('semester', 2026, 1)).key).toBe('2025-S2');
    expect(previousPeriod(makePeriod('year', 2026)).key).toBe('2025');
    expect(nextPeriod(makePeriod('month', 2026, 12)).key).toBe('2027-01');
    expect(nextPeriod(makePeriod('quarter', 2026, 4)).key).toBe('2027-Q1');
    expect(nextPeriod(makePeriod('semester', 2026, 2)).key).toBe('2027-S1');
  });

  it('liste les mois couverts par une période', () => {
    expect(monthsBetween(makePeriod('quarter', 2026, 1)).map((month) => month.key)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
    expect(monthsBetween(makePeriod('year', 2026))).toHaveLength(12);
    expect(monthsBetween(makePeriod('month', 2026, 2))).toHaveLength(1);
  });
});

describe('addMonthsClamped', () => {
  it('ramène au dernier jour puis reprend l’ancrage', () => {
    expect(addMonthsClamped('2026-01-31', 1, 31)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addMonthsClamped('2024-01-31', 1, 31)).toBe('2024-02-29');
  });
});
