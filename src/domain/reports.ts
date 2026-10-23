/**
 * Construction d'un rapport de période, partagé par l'écran Rapports,
 * l'export Excel et l'export PDF. Une seule source de vérité pour les chiffres.
 */

import type {
  AppSettings,
  Budget,
  Category,
  Period,
  Transaction,
} from './types';
import {
  availableBalanceAt,
  categoryTotals,
  compareCategoryTotals,
  compareSummaries,
  monthlyBreakdown,
  summarizeTransactions,
  type CategoryComparison,
  type CategoryTotal,
  type MonthBreakdownRow,
  type PeriodSummary,
  type SummaryComparison,
} from './calculations';
import {
  buildBudgetRowsForRange,
  summarizeBudgets,
  type BudgetRow,
  type BudgetSummary,
} from './budgets';
import { previousPeriod } from './periods';

export interface PeriodReport {
  period: Period;
  settings: AppSettings;
  summary: PeriodSummary;
  openingBalance: number;
  availableAtEnd: number;
  incomeCategories: CategoryTotal[];
  expenseCategories: CategoryTotal[];
  incomeComparisons: CategoryComparison[];
  expenseComparisons: CategoryComparison[];
  monthly: MonthBreakdownRow[];
  budgetRows: BudgetRow[];
  budgetSummary: BudgetSummary;
  previousPeriod: Period;
  previousSummary: PeriodSummary;
  comparison: SummaryComparison;
}

export function buildPeriodReport(options: {
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  settings: AppSettings;
  period: Period;
}): PeriodReport {
  const { transactions, categories, budgets, settings, period } = options;
  const summary = summarizeTransactions(transactions, period);
  const previous = previousPeriod(period);
  const previousSummary = summarizeTransactions(transactions, previous);

  const incomeCategories = categoryTotals(transactions, categories, 'income', period, {
    includeZero: true,
  });
  const expenseCategories = categoryTotals(transactions, categories, 'expense', period, {
    includeZero: true,
  });
  const previousIncome = categoryTotals(transactions, categories, 'income', previous, {
    includeZero: true,
  });
  const previousExpense = categoryTotals(transactions, categories, 'expense', previous, {
    includeZero: true,
  });

  const budgetRows = buildBudgetRowsForRange(budgets, transactions, categories, period);

  return {
    period,
    settings,
    summary,
    openingBalance: availableBalanceAt(transactions, settings.initialBalance, previous.end),
    availableAtEnd: availableBalanceAt(transactions, settings.initialBalance, period.end),
    incomeCategories,
    expenseCategories,
    incomeComparisons: compareCategoryTotals(incomeCategories, previousIncome),
    expenseComparisons: compareCategoryTotals(expenseCategories, previousExpense),
    monthly: monthlyBreakdown(transactions, period),
    budgetRows,
    budgetSummary: summarizeBudgets(budgetRows),
    previousPeriod: previous,
    previousSummary,
    comparison: compareSummaries(summary, previousSummary),
  };
}

export function reportShare(value: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((value / total) * 10_000) / 100;
}
