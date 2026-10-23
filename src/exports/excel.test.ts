import { describe, expect, it } from 'vitest';
import type { Cell, Row } from 'write-excel-file';
import {
  buildFullWorkbook,
  buildReportWorkbook,
  buildTransactionsSheet,
  reportFileName,
} from './excel';
import { buildPeriodReport } from '../domain/reports';
import { makePeriod } from '../domain/periods';
import { categoryByName, testCategories, testSettings, transaction } from '../test/factories';
import type { Budget } from '../domain/types';

const categories = testCategories();
const food = categoryByName('Alimentation');
const transport = categoryByName('Transport');
const salary = categoryByName('Salaire');
const settings = testSettings({ initialBalance: 50000 });

const transactions = [
  transaction({
    id: 'tx-1',
    date: '2026-01-03',
    type: 'income',
    amount: 300000,
    categoryId: salary.id,
    label: 'Salaire',
  }),
  transaction({
    id: 'tx-2',
    date: '2026-01-05',
    type: 'expense',
    amount: 50000,
    categoryId: food.id,
    label: '=SUM(A1:A2)',
    note: 'Formule potentielle',
  }),
  transaction({
    id: 'tx-3',
    date: '2026-01-06',
    type: 'expense',
    amount: 10000,
    categoryId: transport.id,
    label: 'Transport',
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const period = makePeriod('month', 2026, 1);

function findRow(rows: Row[], predicate: (row: Row) => boolean): Row | undefined {
  return rows.find((row) => Array.isArray(row) && predicate(row));
}

function value(cell: Cell | undefined): unknown {
  return cell && 'value' in cell ? cell.value : undefined;
}

function cellAt(row: Row, index: number): NonNullable<Cell> {
  const cell = row[index];
  if (!cell) throw new Error(`Cellule absente à l’index ${index}.`);
  return cell;
}

describe('buildTransactionsSheet', () => {
  const sheet = buildTransactionsSheet(
    transactions,
    categories,
    settings,
    'Opérations de test',
    'Janvier 2026',
  );

  it('écrit les montants en nombres et les dates en dates', () => {
    const row = findRow(sheet.data, (candidate) => value(candidate[3]) === 'Salaire')!;
    expect(row).toBeDefined();
    const amountCell = cellAt(row, 5);
    expect(amountCell).toMatchObject({ type: Number, format: '#,##0' });
    expect(value(amountCell)).toBe(300000);
    const dateCell = cellAt(row, 0);
    expect(dateCell.type).toBe(Date);
  });

  it('neutralise les formules en écrivant explicitement du texte', () => {
    const row = findRow(sheet.data, (candidate) => value(candidate[3]) === '=SUM(A1:A2)')!;
    expect(row).toBeDefined();
    const labelCell = cellAt(row, 3);
    expect(labelCell.type).toBe(String);
    expect(value(labelCell)).toBe('=SUM(A1:A2)');
  });

  it('ajoute les totaux exacts', () => {
    const incomeRow = findRow(sheet.data, (candidate) => value(candidate[0]) === 'Total revenus')!;
    const expenseRow = findRow(sheet.data, (candidate) => value(candidate[0]) === 'Total dépenses')!;
    const netRow = findRow(sheet.data, (candidate) => value(candidate[0]) === 'Solde net')!;
    expect(value(incomeRow[1])).toBe(300000);
    expect(value(expenseRow[1])).toBe(60000);
    expect(value(netRow[1])).toBe(240000);
  });
});

describe('buildReportWorkbook', () => {
  const report = buildPeriodReport({
    transactions,
    categories,
    budgets,
    settings,
    period,
  });
  const sheets = buildReportWorkbook(report, transactions, categories);

  it('produit les feuilles attendues', () => {
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      'Synthèse',
      'Opérations',
      'Catégories',
      'Budgets',
      'Mensuel',
    ]);
  });

  it('reprend les totaux calculés dans la synthèse', () => {
    const summary = sheets[0].data;
    expect(value(findRow(summary, (row) => value(row[0]) === 'Revenus')![1])).toBe(300000);
    expect(value(findRow(summary, (row) => value(row[0]) === 'Dépenses')![1])).toBe(60000);
    expect(value(findRow(summary, (row) => value(row[0]) === 'Solde net')![1])).toBe(240000);
  });

  it('expose les parts de catégories en nombres formatés', () => {
    const categorySheet = sheets.find((sheet) => sheet.name === 'Catégories')!;
    const foodRow = findRow(
      categorySheet.data,
      (row) => value(row[1]) === 'Alimentation',
    )!;
    expect(value(foodRow[2])).toBe(50000);
    const shareCell = cellAt(foodRow, 4);
    expect(shareCell.type).toBe(Number);
    expect(value(shareCell)).toBeCloseTo(0.8333, 3);
  });

  it('nomme le fichier selon la période', () => {
    expect(reportFileName(report)).toBe('budget-rapport-2026-01.xlsx');
  });
});

describe('buildFullWorkbook', () => {
  it('exporte toutes les tables', () => {
    const sheets = buildFullWorkbook({
      transactions,
      categories,
      budgets,
      recurrences: [],
      settings,
    });
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      'Opérations',
      'Catégories',
      'Budgets',
      'Récurrences',
      'Paramètres',
    ]);
  });
});
