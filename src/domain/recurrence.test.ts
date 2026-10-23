import { describe, expect, it } from 'vitest';
import {
  occurrenceAfter,
  occurrenceKey,
  isRuleDue,
  nextOccurrenceAfter,
  ruleStatus,
  upcomingOccurrences,
} from './recurrence';
import type { Frequency, RecurrenceRule } from './types';
import { TEST_NOW } from '../test/factories';

function rule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return {
    id: 'rule-1',
    type: 'expense',
    amount: 75000,
    categoryId: 'housing',
    label: 'Loyer',
    note: '',
    frequency: 'monthly',
    startDate: '2026-01-31',
    nextOccurrence: '2026-01-31',
    isActive: true,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    ...overrides,
  };
}

describe('occurrenceAfter', () => {
  it('avance d’une semaine', () => {
    expect(occurrenceAfter('2026-01-01', 'weekly')).toBe('2026-01-08');
    expect(occurrenceAfter('2026-12-28', 'weekly')).toBe('2027-01-04');
  });

  it('gère le 31 mensuel en revenant au dernier jour du mois', () => {
    expect(occurrenceAfter('2026-01-31', 'monthly', 31)).toBe('2026-02-28');
    expect(occurrenceAfter('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
    expect(occurrenceAfter('2026-03-31', 'monthly', 31)).toBe('2026-04-30');
    expect(occurrenceAfter('2026-04-30', 'monthly', 31)).toBe('2026-05-31');
  });

  it('gère février des années bissextiles', () => {
    expect(occurrenceAfter('2024-01-31', 'monthly', 31)).toBe('2024-02-29');
    expect(occurrenceAfter('2024-02-29', 'monthly', 31)).toBe('2024-03-31');
  });

  it('conserve l’ancrage pour les fréquences trimestrielle et semestrielle', () => {
    expect(occurrenceAfter('2026-01-31', 'quarterly', 31)).toBe('2026-04-30');
    expect(occurrenceAfter('2026-04-30', 'quarterly', 31)).toBe('2026-07-31');
    expect(occurrenceAfter('2026-01-31', 'semiannual', 31)).toBe('2026-07-31');
  });

  it('conserve le 29 février pour les récurrences annuelles', () => {
    expect(occurrenceAfter('2024-02-29', 'annual', 29)).toBe('2025-02-28');
    expect(occurrenceAfter('2027-02-28', 'annual', 29)).toBe('2028-02-29');
  });
});

describe('nextOccurrenceAfter', () => {
  it('utilise toujours le jour d’ancrage de la date de début', () => {
    const monthly = rule({ startDate: '2026-01-31', frequency: 'monthly' as Frequency });
    expect(nextOccurrenceAfter(monthly, '2026-02-28')).toBe('2026-03-31');
  });

  it('avance une occurrence annuelle ancrée au 29 février', () => {
    const annual = rule({ startDate: '2024-02-29', frequency: 'annual' });
    expect(nextOccurrenceAfter(annual, '2027-02-28')).toBe('2028-02-29');
  });
});

describe('statuts et échéances', () => {
  it('identifie une échéance due ou en retard', () => {
    expect(ruleStatus(rule({ nextOccurrence: '2026-01-31' }), '2026-01-31')).toBe('due');
    expect(ruleStatus(rule({ nextOccurrence: '2026-01-31' }), '2026-02-10')).toBe('late');
    expect(isRuleDue(rule({ nextOccurrence: '2026-01-31' }), '2026-02-10')).toBe(true);
    expect(ruleStatus(rule({ nextOccurrence: '2026-02-28' }), '2026-02-10')).toBe('upcoming');
    expect(isRuleDue(rule({ nextOccurrence: '2026-02-28' }), '2026-02-10')).toBe(false);
  });

  it('respecte la suspension et la date de fin', () => {
    expect(ruleStatus(rule({ isActive: false }), '2026-06-01')).toBe('suspended');
    expect(
      ruleStatus(rule({ nextOccurrence: '2026-03-01', endDate: '2026-02-28' }), '2026-03-01'),
    ).toBe('finished');
  });

  it('liste les prochaines échéances sans les compter', () => {
    const upcoming = upcomingOccurrences(
      rule({ startDate: '2026-01-31', nextOccurrence: '2026-01-31' }),
      3,
    );
    expect(upcoming.map((item) => item.date)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
    expect(upcomingOccurrences(rule({ isActive: false }), 3)).toEqual([]);
  });

  it('s’arrête à la date de fin', () => {
    const upcoming = upcomingOccurrences(
      rule({
        startDate: '2026-01-31',
        nextOccurrence: '2026-01-31',
        endDate: '2026-02-28',
      }),
      5,
    );
    expect(upcoming.map((item) => item.date)).toEqual(['2026-01-31', '2026-02-28']);
  });

  it('construit une clé d’unicité stable', () => {
    expect(occurrenceKey('rule-1', '2026-01-31')).toBe('rule-1|2026-01-31');
  });
});
