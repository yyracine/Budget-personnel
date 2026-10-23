/**
 * Dates calendaires et périodes (mois, trimestre, semestre, année).
 *
 * Les dates métier sont des chaînes `YYYY-MM-DD`, sans heure ni fuseau.
 * Tous les calculs calendaires utilisent UTC en interne pour éviter les
 * décalages liés à l'heure d'été ou au fuseau local.
 */

import type { DateRange, ISODate, Period, PeriodType } from './types';

export const MONTH_NAMES_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

export const MONTH_SHORT_FR = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidISODate(value: string): boolean {
  return parseISODate(value) !== null;
}

export function parseISODate(
  value: string,
): { year: number; month: number; day: number } | null {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function makeISODate(year: number, month: number, day: number): ISODate {
  if (month < 1 || month > 12) throw new RangeError(`Mois invalide : ${month}`);
  const max = daysInMonth(year, month);
  if (day < 1 || day > max) {
    throw new RangeError(`Jour invalide : ${day} pour ${month}/${year}`);
  }
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

/** Date du jour locale, sans heure. */
export function todayISO(now: Date = new Date()): ISODate {
  return makeISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function compareISODates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isDateInRange(date: ISODate, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

export function isDateInPeriod(date: ISODate, period: Period): boolean {
  return date >= period.start && date <= period.end;
}

export function addDays(date: ISODate, days: number): ISODate {
  const parsed = parseISODate(date);
  if (!parsed) throw new RangeError(`Date invalide : ${date}`);
  const next = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return makeISODate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

/**
 * Ajoute des mois en conservant un jour d'ancrage et en le ramenant au dernier
 * jour du mois cible lorsque celui-ci est plus court (ex. 31 → 30, 28 ou 29).
 */
export function addMonthsClamped(date: ISODate, months: number, anchorDay?: number): ISODate {
  const parsed = parseISODate(date);
  if (!parsed) throw new RangeError(`Date invalide : ${date}`);
  const anchor = anchorDay ?? parsed.day;
  const totalMonths = parsed.year * 12 + (parsed.month - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  const day = Math.min(anchor, daysInMonth(year, month));
  return makeISODate(year, month, day);
}

export function startOfMonth(date: ISODate): ISODate {
  const parsed = parseISODate(date);
  if (!parsed) throw new RangeError(`Date invalide : ${date}`);
  return makeISODate(parsed.year, parsed.month, 1);
}

export function endOfMonth(date: ISODate): ISODate {
  const parsed = parseISODate(date);
  if (!parsed) throw new RangeError(`Date invalide : ${date}`);
  return makeISODate(parsed.year, parsed.month, daysInMonth(parsed.year, parsed.month));
}

export function monthRange(year: number, month: number): DateRange {
  return {
    start: makeISODate(year, month, 1),
    end: makeISODate(year, month, daysInMonth(year, month)),
  };
}

export function quarterRange(year: number, quarter: number): DateRange {
  if (quarter < 1 || quarter > 4) throw new RangeError(`Trimestre invalide : ${quarter}`);
  const firstMonth = (quarter - 1) * 3 + 1;
  const lastMonth = firstMonth + 2;
  return {
    start: makeISODate(year, firstMonth, 1),
    end: makeISODate(year, lastMonth, daysInMonth(year, lastMonth)),
  };
}

export function semesterRange(year: number, semester: number): DateRange {
  if (semester < 1 || semester > 2) throw new RangeError(`Semestre invalide : ${semester}`);
  const firstMonth = semester === 1 ? 1 : 7;
  const lastMonth = semester === 1 ? 6 : 12;
  return {
    start: makeISODate(year, firstMonth, 1),
    end: makeISODate(year, lastMonth, daysInMonth(year, lastMonth)),
  };
}

export function yearRange(year: number): DateRange {
  return { start: makeISODate(year, 1, 1), end: makeISODate(year, 12, 31) };
}

export function makePeriod(type: PeriodType, year: number, index?: number): Period {
  switch (type) {
    case 'month': {
      if (index === undefined || index < 1 || index > 12) {
        throw new RangeError(`Mois invalide : ${index}`);
      }
      const range = monthRange(year, index);
      return {
        type,
        year,
        index,
        ...range,
        label: `${MONTH_NAMES_FR[index - 1]} ${year}`,
        key: `${year}-${pad2(index)}`,
      };
    }
    case 'quarter': {
      if (index === undefined || index < 1 || index > 4) {
        throw new RangeError(`Trimestre invalide : ${index}`);
      }
      return {
        type,
        year,
        index,
        ...quarterRange(year, index),
        label: `T${index} ${year}`,
        key: `${year}-Q${index}`,
      };
    }
    case 'semester': {
      if (index === undefined || index < 1 || index > 2) {
        throw new RangeError(`Semestre invalide : ${index}`);
      }
      return {
        type,
        year,
        index,
        ...semesterRange(year, index),
        label: `S${index} ${year}`,
        key: `${year}-S${index}`,
      };
    }
    case 'year':
      return { type, year, ...yearRange(year), label: `Année ${year}`, key: `${year}` };
    default:
      throw new RangeError(`Type de période inconnu : ${String(type)}`);
  }
}

export function periodForDate(date: ISODate, type: PeriodType): Period {
  const parsed = parseISODate(date);
  if (!parsed) throw new RangeError(`Date invalide : ${date}`);
  switch (type) {
    case 'month':
      return makePeriod('month', parsed.year, parsed.month);
    case 'quarter':
      return makePeriod('quarter', parsed.year, Math.floor((parsed.month - 1) / 3) + 1);
    case 'semester':
      return makePeriod('semester', parsed.year, parsed.month <= 6 ? 1 : 2);
    case 'year':
      return makePeriod('year', parsed.year);
  }
}

export function shiftPeriod(period: Period, delta: number): Period {
  switch (period.type) {
    case 'month': {
      const absolute = period.year * 12 + (period.index! - 1) + delta;
      const year = Math.floor(absolute / 12);
      const month = (absolute % 12) + 1;
      return makePeriod('month', year, month);
    }
    case 'quarter': {
      const absolute = period.year * 4 + (period.index! - 1) + delta;
      const year = Math.floor(absolute / 4);
      const quarter = (absolute % 4) + 1;
      return makePeriod('quarter', year, quarter);
    }
    case 'semester': {
      const absolute = period.year * 2 + (period.index! - 1) + delta;
      const year = Math.floor(absolute / 2);
      const semester = (absolute % 2) + 1;
      return makePeriod('semester', year, semester);
    }
    case 'year':
      return makePeriod('year', period.year + delta);
  }
}

export function previousPeriod(period: Period): Period {
  return shiftPeriod(period, -1);
}

export function nextPeriod(period: Period): Period {
  return shiftPeriod(period, 1);
}

/** Liste des mois calendaires couverts par la période. */
export function monthsOfPeriod(period: Period): Period[] {
  return monthsBetween(period);
}

/** Liste des mois calendaires couverts par une plage de dates. */
export function monthsBetween(range: DateRange): Period[] {
  const months: Period[] = [];
  const start = parseISODate(range.start)!;
  const end = parseISODate(range.end)!;
  let year = start.year;
  let month = start.month;
  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push(makePeriod('month', year, month));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export function periodContains(period: Period, date: ISODate): boolean {
  return date >= period.start && date <= period.end;
}

export function normalizeRange(range: DateRange): DateRange {
  return range.start <= range.end
    ? { start: range.start, end: range.end }
    : { start: range.end, end: range.start };
}

/** Nombre de jours couverts par la période (bornes incluses). */
export function periodLengthInDays(period: DateRange): number {
  const start = parseISODate(period.start);
  const end = parseISODate(period.end);
  if (!start || !end) return 0;
  const startMs = Date.UTC(start.year, start.month - 1, start.day);
  const endMs = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((endMs - startMs) / 86_400_000) + 1;
}
