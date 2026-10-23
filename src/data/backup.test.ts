import { describe, expect, it } from 'vitest';
import {
  buildBackupData,
  parseBackupJson,
  serializeBackup,
  validateBackupObject,
} from './backup';
import { categoryByName, testCategories, testSettings, transaction, TEST_NOW } from '../test/factories';
import type { Budget, RecurrenceRule } from '../domain/types';

const categories = testCategories();
const food = categoryByName('Alimentation');
const salary = categoryByName('Salaire');

const transactions = [
  transaction({
    id: 'tx-1',
    date: '2026-01-05',
    type: 'expense',
    amount: 5000,
    categoryId: food.id,
    label: 'Courses',
    note: 'note',
  }),
  transaction({
    id: 'tx-2',
    date: '2026-01-02',
    type: 'income',
    amount: 300000,
    categoryId: salary.id,
    label: 'Salaire',
  }),
];

const budgets: Budget[] = [
  {
    id: 'budget-1',
    categoryId: food.id,
    periodType: 'month',
    periodStart: '2026-01-01',
    amount: 100000,
    alertThreshold: 80,
    budgetKey: `${food.id}|month|2026-01-01`,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  },
];

const recurrences: RecurrenceRule[] = [
  {
    id: 'rule-1',
    type: 'expense',
    amount: 75000,
    categoryId: food.id,
    label: 'Loyer',
    note: '',
    frequency: 'monthly',
    startDate: '2026-01-31',
    nextOccurrence: '2026-02-28',
    isActive: true,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  },
];

function validBackup() {
  return buildBackupData({
    settings: testSettings({ initialBalance: 50000 }),
    categories,
    transactions,
    budgets,
    recurrences,
  });
}

describe('format de sauvegarde', () => {
  it('fait un aller-retour sans perte', () => {
    const backup = validBackup();
    const validation = parseBackupJson(serializeBackup(backup));
    expect(validation.ok).toBe(true);
    const data = validation.data!;
    expect(data.settings.initialBalance).toBe(50000);
    expect(data.transactions).toHaveLength(2);
    expect(data.categories).toHaveLength(21);
    expect(data.budgets).toHaveLength(1);
    expect(data.recurrences).toHaveLength(1);
    expect(data.transactions[0].label).toBe('Courses');
    expect(data.transactions[0].amount).toBe(5000);
  });

  it('rejette un JSON illisible', () => {
    expect(parseBackupJson('{oops')).toMatchObject({ ok: false });
  });

  it('rejette un fichier d’une autre application ou d’une autre version', () => {
    const backup = validBackup();
    expect(validateBackupObject({ ...backup, app: 'autre' }).ok).toBe(false);
    const version = validateBackupObject({ ...backup, formatVersion: 99 });
    expect(version.ok).toBe(false);
    expect(version.errors[0]).toContain('Version');
  });

  it('rejette une devise ou des paramètres invalides', () => {
    const backup = validBackup();
    const result = validateBackupObject({
      ...backup,
      settings: { ...backup.settings, currency: 'EUR', theme: 'neon' },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('Devise');
    expect(result.errors.join(' ')).toContain('Thème');
  });

  it('rejette une catégorie inconnue (intégrité référentielle)', () => {
    const backup = validBackup();
    const result = validateBackupObject({
      ...backup,
      transactions: [{ ...backup.transactions[0], categoryId: 'absent' }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('catégorie inconnue');
  });

  it('rejette les montants invalides', () => {
    const backup = validBackup();
    const result = validateBackupObject({
      ...backup,
      transactions: [{ ...backup.transactions[0], amount: -100 }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('montant invalide');
  });

  it('rejette un budget sur une catégorie de revenu', () => {
    const backup = validBackup();
    const result = validateBackupObject({
      ...backup,
      budgets: [{ ...backup.budgets[0], categoryId: salary.id }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('catégorie de dépense');
  });

  it('rejette les identifiants dupliqués et les budgets en double', () => {
    const backup = validBackup();
    const duplicateTransaction = validateBackupObject({
      ...backup,
      transactions: [backup.transactions[0], { ...backup.transactions[1], id: backup.transactions[0].id }],
    });
    expect(duplicateTransaction.ok).toBe(false);
    expect(duplicateTransaction.errors.join(' ')).toContain('dupliqué');

    const duplicateBudget = validateBackupObject({
      ...backup,
      budgets: [backup.budgets[0], { ...backup.budgets[0], id: 'budget-2' }],
    });
    expect(duplicateBudget.ok).toBe(false);
    expect(duplicateBudget.errors.join(' ')).toContain('double');
  });

  it('rejette une récurrence dont la catégorie ne correspond pas au type', () => {
    const backup = validBackup();
    const result = validateBackupObject({
      ...backup,
      recurrences: [{ ...backup.recurrences[0], type: 'income' }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('catégorie ne correspond');
  });

});
