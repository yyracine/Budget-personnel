import type { AppSettings, Category, Transaction, TransactionType } from '../domain/types';
import { buildDefaultCategories, DEFAULT_SETTINGS } from '../data/defaults';

export const TEST_NOW = '2026-01-15T10:00:00.000Z';

export function testCategories(): Category[] {
  return buildDefaultCategories(TEST_NOW);
}

export function categoryByName(name: string): Category {
  const category = testCategories().find((item) => item.name === name);
  if (!category) throw new Error(`Catégorie de test introuvable : ${name}`);
  return category;
}

export function category(
  id: string,
  name: string,
  type: TransactionType,
  color = '#0f766e',
): Category {
  return {
    id,
    name,
    type,
    color,
    icon: 'tag',
    description: '',
    isActive: true,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  };
}

let counter = 0;

export function transaction(
  partial: Partial<Transaction> & {
    date: string;
    type: TransactionType;
    amount: number;
    categoryId: string;
  },
): Transaction {
  counter += 1;
  return {
    id: partial.id ?? `tx-test-${counter}`,
    date: partial.date,
    type: partial.type,
    amount: partial.amount,
    categoryId: partial.categoryId,
    label: partial.label ?? 'Opération de test',
    note: partial.note ?? '',
    source: partial.source ?? 'manual',
    sourceId: partial.sourceId,
    recurrenceRuleId: partial.recurrenceRuleId,
    occurrenceDate: partial.occurrenceDate,
    occurrenceKey: partial.occurrenceKey,
    importBatchId: partial.importBatchId,
    createdAt: partial.createdAt ?? TEST_NOW,
    updatedAt: partial.updatedAt ?? TEST_NOW,
  };
}

export function testSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}
