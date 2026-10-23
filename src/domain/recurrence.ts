import type { Frequency, ISODate, RecurrenceRule } from './types';
import { addDays, addMonthsClamped, parseISODate, todayISO } from './periods';

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Hebdomadaire',
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle',
  semiannual: 'Semestrielle',
  annual: 'Annuelle',
};

export const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = Object.entries(
  FREQUENCY_LABELS,
).map(([value, label]) => ({ value: value as Frequency, label }));

export type RuleStatus = 'suspended' | 'finished' | 'late' | 'due' | 'upcoming';

export const RULE_STATUS_LABELS: Record<RuleStatus, string> = {
  suspended: 'Suspendue',
  finished: 'Terminée',
  late: 'En retard',
  due: "Échéance aujourd'hui",
  upcoming: 'À venir',
};

/**
 * Calcule l'échéance suivante à partir d'une date d'occurrence.
 * L'ancrage est le jour du mois de la date de début de la règle : une
 * occurrence au 31 est ramenée au dernier jour du mois lorsque nécessaire,
 * puis reprend au 31 le mois suivant.
 */
export function occurrenceAfter(
  date: ISODate,
  frequency: Frequency,
  anchorDay?: number,
): ISODate {
  const parsed = parseISODate(date);
  if (!parsed) throw new RangeError(`Date d'échéance invalide : ${date}`);
  const anchor = anchorDay ?? parsed.day;
  switch (frequency) {
    case 'weekly':
      return addDays(date, 7);
    case 'monthly':
      return addMonthsClamped(date, 1, anchor);
    case 'quarterly':
      return addMonthsClamped(date, 3, anchor);
    case 'semiannual':
      return addMonthsClamped(date, 6, anchor);
    case 'annual':
      return addMonthsClamped(date, 12, anchor);
    default:
      throw new RangeError(`Fréquence inconnue : ${String(frequency)}`);
  }
}

export function anchorDayOf(rule: Pick<RecurrenceRule, 'startDate'>): number {
  return parseISODate(rule.startDate)?.day ?? 1;
}

/** Prochaine échéance après une occurrence donnée, pour une règle. */
export function nextOccurrenceAfter(
  rule: Pick<RecurrenceRule, 'startDate' | 'frequency'>,
  date: ISODate,
): ISODate {
  return occurrenceAfter(date, rule.frequency, anchorDayOf(rule));
}

export function ruleStatus(rule: RecurrenceRule, today: ISODate = todayISO()): RuleStatus {
  if (!rule.isActive) return 'suspended';
  if (rule.endDate && rule.nextOccurrence > rule.endDate) return 'finished';
  if (rule.nextOccurrence < today) return 'late';
  if (rule.nextOccurrence === today) return 'due';
  return 'upcoming';
}

export function isRuleDue(rule: RecurrenceRule, today: ISODate = todayISO()): boolean {
  const status = ruleStatus(rule, today);
  return status === 'late' || status === 'due';
}

/** Clé d'unicité d'une occurrence : une règle ne peut produire qu'une fois la même date. */
export function occurrenceKey(ruleId: string, date: ISODate): string {
  return `${ruleId}|${date}`;
}

/** Prochaines échéances prévisionnelles (jamais comptées avant matérialisation). */
export function upcomingOccurrences(
  rule: RecurrenceRule,
  count = 3,
): { date: ISODate; isDue: boolean }[] {
  if (!rule.isActive) return [];
  const occurrences: { date: ISODate; isDue: boolean }[] = [];
  let cursor = rule.nextOccurrence;
  const today = todayISO();
  for (let i = 0; i < count; i += 1) {
    if (rule.endDate && cursor > rule.endDate) break;
    occurrences.push({ date: cursor, isDue: cursor <= today });
    cursor = nextOccurrenceAfter(rule, cursor);
  }
  return occurrences;
}

export function advanceRule(rule: RecurrenceRule): ISODate {
  return nextOccurrenceAfter(rule, rule.nextOccurrence);
}
