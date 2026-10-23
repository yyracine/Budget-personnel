import { describe, expect, it } from 'vitest';
import {
  buildBudgetRows,
  buildBudgetRowsForRange,
  computeBudgetStatus,
  summarizeBudgets,
  type BudgetRow,
} from './budgets';
import { makePeriod } from './periods';
import type { Budget } from './types';
import { category, transaction, TEST_NOW } from '../test/factories';

const food = category('food', 'Alimentation', 'expense');
const transport = category('transport', 'Transport', 'expense');
const salary = category('salary', 'Salaire', 'income');

function budget(overrides: Partial<Budget> & { categoryId: string; periodStart: string; amount: number }): Budget {
  return {
    id: overrides.id ?? `budget-${overrides.categoryId}-${overrides.periodStart}`,
    categoryId: overrides.categoryId,
    periodType: 'month',
    periodStart: overrides.periodStart,
    amount: overrides.amount,
    alertThreshold: overrides.alertThreshold ?? 80,
    budgetKey: `${overrides.categoryId}|month|${overrides.periodStart}`,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  };
}

describe('computeBudgetStatus (18.5)', () => {
  it('signale une alerte sous le budget mais au-dessus du seuil', () => {
    const status = computeBudgetStatus(100000, 85000, 80);
    expect(status.consumed).toBe(85000);
    expect(status.remaining).toBe(15000);
    expect(status.rate).toBe(85);
    expect(status.state).toBe('warning');
  });

  it('signale un dépassement au-delà du budget', () => {
    const status = computeBudgetStatus(100000, 105000, 80);
    expect(status.remaining).toBe(-5000);
    expect(status.rate).toBe(105);
    expect(status.state).toBe('exceeded');
  });

  it('déclenche l’alerte exactement au seuil', () => {
    expect(computeBudgetStatus(100000, 80000, 80).state).toBe('warning');
    expect(computeBudgetStatus(100000, 79999, 80).state).toBe('normal');
  });

  it('ne divise pas par zéro pour un budget nul ou absent', () => {
    const zero = computeBudgetStatus(0, 15000, 80);
    expect(zero.rate).toBeNull();
    expect(zero.state).toBe('zero-budget');
    const absent = computeBudgetStatus(null, 15000, 80);
    expect(absent.rate).toBeNull();
    expect(absent.remaining).toBeNull();
    expect(absent.state).toBe('no-budget');
  });
});

describe('consommation mensuelle', () => {
  const january = makePeriod('month', 2026, 1);
  const budgets = [budget({ categoryId: food.id, periodStart: '2026-01-01', amount: 100000 })];
  const transactions = [
    transaction({ date: '2026-01-05', type: 'expense', amount: 50000, categoryId: food.id }),
    transaction({ date: '2026-01-31', type: 'expense', amount: 35000, categoryId: food.id }),
    transaction({ date: '2026-02-01', type: 'expense', amount: 90000, categoryId: food.id }),
    transaction({ date: '2026-01-10', type: 'income', amount: 200000, categoryId: salary.id }),
  ];

  it('n’impute que les dépenses du mois exact', () => {
    const rows = buildBudgetRows(budgets, transactions, [food, transport, salary], '2026-01-01');
    const foodRow = rows.find((row) => row.categoryId === food.id)!;
    expect(foodRow.consumed).toBe(85000);
    expect(foodRow.rate).toBe(85);
    expect(foodRow.state).toBe('warning');
  });

  it('ne confond pas revenus et dépenses', () => {
    const rows = buildBudgetRows(budgets, transactions, [food, transport, salary], '2026-01-01');
    expect(rows.some((row) => row.categoryId === salary.id)).toBe(false);
  });

  it('affiche les catégories sans budget en état non défini', () => {
    const rows = buildBudgetRows(budgets, [], [food, transport], '2026-01-01');
    const transportRow = rows.find((row) => row.categoryId === transport.id)!;
    expect(transportRow.state).toBe('no-budget');
    expect(transportRow.budgetAmount).toBeNull();
    expect(transportRow.consumed).toBe(0);
  });

  it('agrège correctement une période trimestrielle', () => {
    const quarter = makePeriod('quarter', 2026, 1);
    const quarterlyBudgets = [
      budget({ categoryId: food.id, periodStart: '2026-01-01', amount: 100000 }),
      budget({ categoryId: food.id, periodStart: '2026-02-01', amount: 120000 }),
      budget({ categoryId: food.id, periodStart: '2026-03-01', amount: 80000 }),
      budget({ categoryId: food.id, periodStart: '2026-04-01', amount: 500000 }),
    ];
    const rows = buildBudgetRowsForRange(quarterlyBudgets, transactions, [food], quarter);
    const foodRow = rows.find((row) => row.categoryId === food.id)!;
    expect(foodRow.budgetAmount).toBe(300000);
    expect(foodRow.consumed).toBe(175000);
    expect(foodRow.state).toBe('normal');
  });

  it('totalise uniquement les budgets définis', () => {
    const rows = buildBudgetRows(budgets, transactions, [food, transport], january.start);
    const summary = summarizeBudgets(rows);
    expect(summary.definedCount).toBe(1);
    expect(summary.totalBudget).toBe(100000);
    expect(summary.totalConsumed).toBe(85000);
    expect(summary.totalRemaining).toBe(15000);
    expect(summary.warningCount).toBe(1);
    expect(summary.exceededCount).toBe(0);
  });
});

describe('états agrégés', () => {
  it('détecte un dépassement agrégé', () => {
    const budgets = [
      budget({ categoryId: food.id, periodStart: '2026-01-01', amount: 50000 }),
      budget({ categoryId: food.id, periodStart: '2026-02-01', amount: 50000 }),
    ];
    const transactions = [
      transaction({ date: '2026-01-15', type: 'expense', amount: 60000, categoryId: food.id }),
      transaction({ date: '2026-02-15', type: 'expense', amount: 60000, categoryId: food.id }),
    ];
    const rows = buildBudgetRowsForRange(
      budgets,
      transactions,
      [food],
      makePeriod('semester', 2026, 1),
    );
    const row: BudgetRow = rows[0];
    expect(row.budgetAmount).toBe(100000);
    expect(row.consumed).toBe(120000);
    expect(row.state).toBe('exceeded');
  });
});
