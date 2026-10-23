import type { DateFormat, ISODate } from './types';
import { MONTH_NAMES_FR, parseISODate } from './periods';

export function formatDisplayDate(date: ISODate, format: DateFormat = 'DD/MM/YYYY'): string {
  const parsed = parseISODate(date);
  if (!parsed) return date;
  if (format === 'YYYY-MM-DD') return date;
  return `${String(parsed.day).padStart(2, '0')}/${String(parsed.month).padStart(2, '0')}/${parsed.year}`;
}

export function formatLongDate(date: ISODate): string {
  const parsed = parseISODate(date);
  if (!parsed) return date;
  return `${parsed.day} ${MONTH_NAMES_FR[parsed.month - 1].toLowerCase()} ${parsed.year}`;
}

export function formatDateTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return isoTimestamp;
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(count)} ${count > 1 ? plural : singular}`;
}
