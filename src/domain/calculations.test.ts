import { describe, expect, it } from 'vitest';
import {
  availableBalanceAt,
  categoryTotals,
  compareMetric,
  compareSummaries,
  cumulativeSeries,
  monthlySeries,
  openingBalance,
  summarizeTransactions,
} from './calculations';
import { makePeriod } from './periods';
import { category, transaction } from '../test/factories';

const january = makePeriod('month', 2026, 1);

const food = category('food', 'Alimentation', 'expense', '#0e7490');
const transport = category('transport', 'Transport', 'expense', '#2563eb');
const salary = category('salary', 'Salaire', 'income', '#0f9d76');

describe('test fondamental (18.1)', () => {
  const transactions = [
    transaction({ date: '2026-01-02', type: 'income', amount: 300000, categoryId: salary.id }),
    transaction({ date: '2026-01-05', type: 'income', amount: 150000, categoryId: salary.id }),
    transaction({ date: '2026-01-10', type: 'expense', amount: 80000, categoryId: food.id }),
    transaction({ date: '2026-01-20', type: 'expense', amount: 20000, categoryId: transport.id }),
  ];

  it('calcule revenus, dépenses et solde net', () => {
    const summary = summarizeTransactions(transactions, january);
    expect(summary.income).toBe(450000);
    expect(summary.expense).toBe(100000);
    expect(summary.net).toBe(350000);
    expect(summary.count).toBe(4);
    expect(summary.incomeCount).toBe(2);
    expect(summary.expenseCount).toBe(2);
  });

  it('exclut les opérations hors période', () => {
    const withFebruary = [
      ...transactions,
      transaction({ date: '2026-02-01', type: 'expense', amount: 999999, categoryId: food.id }),
    ];
    expect(summarizeTransactions(withFebruary, january).expense).toBe(100000);
    const february = summarizeTransactions(withFebruary, makePeriod('month', 2026, 2));
    expect(february.expense).toBe(999999);
    expect(february.income).toBe(0);
  });
});

describe('test des catégories (18.2)', () => {
  const transactions = [
    transaction({ date: '2026-01-03', type: 'expense', amount: 30000, categoryId: food.id }),
    transaction({ date: '2026-01-04', type: 'expense', amount: 20000, categoryId: food.id }),
    transaction({ date: '2026-01-05', type: 'expense', amount: 10000, categoryId: transport.id }),
    transaction({ date: '2026-01-06', type: 'income', amount: 250000, categoryId: salary.id }),
  ];
  const categories = [food, transport, salary];

  it('agrège les montants et les nombres d’opérations', () => {
    const expenses = categoryTotals(transactions, categories, 'expense', january);
    const foodRow = expenses.find((row) => row.categoryId === food.id)!;
    const transportRow = expenses.find((row) => row.categoryId === transport.id)!;
    expect(foodRow.amount).toBe(50000);
    expect(foodRow.count).toBe(2);
    expect(transportRow.amount).toBe(10000);
    expect(foodRow.share).toBeCloseTo(83.33, 2);
    expect(transportRow.share).toBeCloseTo(16.67, 2);
  });

  it('utilise le total des dépenses comme dénominateur', () => {
    const expenses = categoryTotals(transactions, categories, 'expense', january);
    const totalShare = expenses.reduce((sum, row) => sum + (row.share ?? 0), 0);
    expect(Math.round(totalShare * 100) / 100).toBe(100);
    const summary = summarizeTransactions(transactions, january);
    expect(summary.expense).toBe(60000);
    expect(summary.income).toBe(250000);
    expect(summary.net).toBe(190000);
  });

  it('calcule séparément la part des revenus', () => {
    const incomes = categoryTotals(transactions, categories, 'income', january);
    expect(incomes).toHaveLength(1);
    expect(incomes[0].amount).toBe(250000);
    expect(incomes[0].share).toBe(100);
  });

  it('ne divise pas par zéro quand le total est nul', () => {
    const rows = categoryTotals([], categories, 'expense', january);
    expect(rows).toHaveLength(0);
    const rowsWithZero = categoryTotals([], categories, 'expense', january, {
      includeZero: true,
    });
    expect(rowsWithZero).toHaveLength(2);
    expect(rowsWithZero.every((row) => row.share === null)).toBe(true);
  });
});

describe('test du solde cumulé (18.3)', () => {
  const transactions = [
    transaction({ date: '2026-01-03', type: 'income', amount: 100000, categoryId: salary.id }),
    transaction({ date: '2026-01-04', type: 'expense', amount: 30000, categoryId: food.id }),
    transaction({ date: '2026-01-05', type: 'expense', amount: 20000, categoryId: transport.id }),
  ];

  it('inclut le solde initial', () => {
    expect(availableBalanceAt(transactions, 50000, '2026-01-31')).toBe(100000);
    expect(openingBalance(transactions, 50000, january)).toBe(50000);
  });

  it('respecte la date d’arrêté', () => {
    expect(availableBalanceAt(transactions, 50000, '2026-01-03')).toBe(150000);
    expect(availableBalanceAt(transactions, 50000, '2026-01-04')).toBe(120000);
    expect(availableBalanceAt(transactions, 50000, '2026-01-02')).toBe(50000);
  });

  it('distingue solde disponible et solde net de période', () => {
    const summary = summarizeTransactions(transactions, january);
    expect(summary.net).toBe(50000);
    expect(availableBalanceAt(transactions, 50000, '2026-01-31')).toBe(100000);
  });

  it('construit une courbe cumulée chronologique', () => {
    const points = cumulativeSeries(transactions, 50000, january, 'day');
    expect(points).toHaveLength(31);
    expect(points[0]).toMatchObject({ date: '2026-01-01', balance: 50000 });
    expect(points[2]).toMatchObject({ date: '2026-01-03', balance: 150000 });
    expect(points[3].balance).toBe(120000);
    expect(points[points.length - 1].balance).toBe(100000);
  });

  it('agrège par mois sans additionner des soldes de période', () => {
    const points = cumulativeSeries(transactions, 50000, january, 'month');
    expect(points).toHaveLength(1);
    expect(points[0].balance).toBe(100000);
  });
});

describe('séries mensuelles', () => {
  it('produit douze mois et place les opérations dans le bon mois', () => {
    const points = monthlySeries(
      [
        transaction({ date: '2026-02-10', type: 'expense', amount: 5000, categoryId: food.id }),
        transaction({ date: '2026-02-11', type: 'income', amount: 20000, categoryId: salary.id }),
        transaction({ date: '2025-12-31', type: 'income', amount: 99999, categoryId: salary.id }),
      ],
      2026,
    );
    expect(points).toHaveLength(12);
    expect(points[1]).toMatchObject({ income: 20000, expense: 5000, net: 15000, count: 2 });
    expect(points[0].income).toBe(0);
    expect(points.every((point) => point.shortLabel.length > 0)).toBe(true);
  });
});

describe('comparaisons (13.6)', () => {
  it('calcule un écart et un pourcentage défini', () => {
    const comparison = compareMetric(120000, 100000);
    expect(comparison.delta).toBe(20000);
    expect(comparison.percent).toBe(20);
    expect(comparison.percentKind).toBe('percent');
  });

  it('ne calcule pas de pourcentage trompeur depuis zéro', () => {
    expect(compareMetric(5000, 0)).toMatchObject({
      delta: 5000,
      percent: null,
      percentKind: 'new',
    });
    expect(compareMetric(0, 5000)).toMatchObject({
      delta: -5000,
      percent: null,
      percentKind: 'zero',
    });
    expect(compareMetric(0, 0)).toMatchObject({
      delta: 0,
      percent: null,
      percentKind: 'undefined',
    });
  });

  it('marque une base négative comme non calculable en pourcentage', () => {
    const comparison = compareMetric(2000, -5000);
    expect(comparison.delta).toBe(7000);
    expect(comparison.percent).toBeNull();
    expect(comparison.percentKind).toBe('undefined');
  });

  it('compare deux synthèses de période', () => {
    const current = summarizeTransactions(
      [transaction({ date: '2026-02-02', type: 'expense', amount: 8000, categoryId: food.id })],
      makePeriod('month', 2026, 2),
    );
    const previous = summarizeTransactions(
      [transaction({ date: '2026-01-02', type: 'expense', amount: 10000, categoryId: food.id })],
      january,
    );
    const comparison = compareSummaries(current, previous);
    expect(comparison.expense.delta).toBe(-2000);
    expect(comparison.expense.percent).toBe(-20);
  });
});
