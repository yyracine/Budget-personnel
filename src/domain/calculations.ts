/**
 * Calculs financiers purs.
 *
 * Toute vue, tout export et tout rapport doit passer par ces fonctions afin
 * qu'un même chiffre soit calculé une seule fois, de la même manière.
 */

import type {
  Category,
  DateRange,
  ISODate,
  Period,
  Transaction,
  TransactionType,
} from './types';
import { monthsBetween, monthsOfPeriod, MONTH_SHORT_FR, parseISODate } from './periods';
import { roundPercent, sumAmounts } from './money';

export interface PeriodSummary {
  income: number;
  expense: number;
  net: number;
  count: number;
  incomeCount: number;
  expenseCount: number;
}

export interface MonthlyPoint {
  month: number;
  label: string;
  shortLabel: string;
  quarter: number;
  income: number;
  expense: number;
  net: number;
  count: number;
}

export interface CategoryTotal {
  categoryId: string;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
  amount: number;
  count: number;
  /** Part dans le total du même type ; null si ce total est nul. */
  share: number | null;
}

export type PercentKind = 'percent' | 'new' | 'zero' | 'undefined';

export interface MetricComparison {
  current: number;
  previous: number;
  delta: number;
  percent: number | null;
  percentKind: PercentKind;
}

export interface SummaryComparison {
  income: MetricComparison;
  expense: MetricComparison;
  net: MetricComparison;
  count: MetricComparison;
}

export interface CategoryComparison extends CategoryTotal {
  previous: number;
  delta: number;
  percent: number | null;
  percentKind: PercentKind;
}

export function inRange(date: ISODate, range: DateRange | undefined): boolean {
  if (!range) return true;
  return date >= range.start && date <= range.end;
}

export function filterTransactions(
  transactions: Transaction[],
  range?: DateRange,
): Transaction[] {
  if (!range) return transactions;
  return transactions.filter((transaction) => inRange(transaction.date, range));
}

export function summarizeTransactions(
  transactions: Transaction[],
  range?: DateRange,
): PeriodSummary {
  let income = 0;
  let expense = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  for (const transaction of transactions) {
    if (!inRange(transaction.date, range)) continue;
    if (transaction.type === 'income') {
      income += transaction.amount;
      incomeCount += 1;
    } else {
      expense += transaction.amount;
      expenseCount += 1;
    }
  }
  return {
    income,
    expense,
    net: income - expense,
    count: incomeCount + expenseCount,
    incomeCount,
    expenseCount,
  };
}

/**
 * Solde disponible : solde initial + revenus - dépenses de toutes les
 * opérations dont la date est antérieure ou égale à `asOf`.
 * Distinct du solde net d'une période.
 */
export function availableBalanceAt(
  transactions: Transaction[],
  initialBalance: number,
  asOf: ISODate,
): number {
  let balance = initialBalance;
  for (const transaction of transactions) {
    if (transaction.date > asOf) continue;
    balance += transaction.type === 'income' ? transaction.amount : -transaction.amount;
  }
  return balance;
}

/** Solde cumulé au début d'une plage (toutes les opérations antérieures). */
export function openingBalance(
  transactions: Transaction[],
  initialBalance: number,
  range: DateRange,
): number {
  let balance = initialBalance;
  for (const transaction of transactions) {
    if (transaction.date >= range.start) continue;
    balance += transaction.type === 'income' ? transaction.amount : -transaction.amount;
  }
  return balance;
}

export function monthlySeries(transactions: Transaction[], year: number): MonthlyPoint[] {
  const points: MonthlyPoint[] = MONTH_SHORT_FR.map((label, index) => ({
    month: index + 1,
    label: `${label} ${year}`,
    shortLabel: label,
    quarter: Math.floor(index / 3) + 1,
    income: 0,
    expense: 0,
    net: 0,
    count: 0,
  }));
  for (const transaction of transactions) {
    if (!transaction.date.startsWith(`${year}-`)) continue;
    const parsed = parseISODate(transaction.date);
    if (!parsed) continue;
    const point = points[parsed.month - 1];
    if (transaction.type === 'income') point.income += transaction.amount;
    else point.expense += transaction.amount;
    point.count += 1;
  }
  for (const point of points) point.net = point.income - point.expense;
  return points;
}

export interface CumulativePoint {
  date: ISODate;
  label: string;
  balance: number;
}

/**
 * Évolution du solde cumulé, calculée chronologiquement à partir du solde
 * initial. `step: 'month'` agrège par mois (une entrée par mois de la période).
 */
export function cumulativeSeries(
  transactions: Transaction[],
  initialBalance: number,
  range: DateRange,
  step: 'day' | 'month' = 'day',
): CumulativePoint[] {
  const points: CumulativePoint[] = [];
  let balance = openingBalance(transactions, initialBalance, range);

  if (step === 'month') {
    const months = monthsBetween(range);
    for (const month of months) {
      for (const transaction of transactions) {
        if (transaction.date < month.start || transaction.date > month.end) continue;
        balance += transaction.type === 'income' ? transaction.amount : -transaction.amount;
      }
      const parsed = parseISODate(month.start)!;
      points.push({
        date: month.end,
        label: `${MONTH_SHORT_FR[parsed.month - 1]} ${parsed.year}`,
        balance,
      });
    }
    return points;
  }

  const start = parseISODate(range.start);
  const end = parseISODate(range.end);
  if (!start || !end) return points;

  const byDate = new Map<ISODate, number>();
  for (const transaction of transactions) {
    if (!inRange(transaction.date, range)) continue;
    const signed = transaction.type === 'income' ? transaction.amount : -transaction.amount;
    byDate.set(transaction.date, (byDate.get(transaction.date) ?? 0) + signed);
  }

  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));
  const last = Date.UTC(end.year, end.month - 1, end.day);
  while (cursor.getTime() <= last) {
    const date = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`;
    balance += byDate.get(date) ?? 0;
    points.push({ date, label: date.slice(8, 10), balance });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return points;
}

/**
 * Totaux par catégorie pour un type donné.
 * La part est calculée sur le total du MÊME type (dépenses / revenus).
 */
export function categoryTotals(
  transactions: Transaction[],
  categories: Category[],
  type: TransactionType,
  range?: DateRange,
  options: { includeZero?: boolean } = {},
): CategoryTotal[] {
  const { includeZero = false } = options;
  const totals = new Map<string, { amount: number; count: number }>();
  let grandTotal = 0;
  for (const transaction of transactions) {
    if (transaction.type !== type) continue;
    if (!inRange(transaction.date, range)) continue;
    const current = totals.get(transaction.categoryId) ?? { amount: 0, count: 0 };
    current.amount += transaction.amount;
    current.count += 1;
    totals.set(transaction.categoryId, current);
    grandTotal += transaction.amount;
  }

  const rows: CategoryTotal[] = [];
  for (const category of categories) {
    if (category.type !== type) continue;
    const total = totals.get(category.id);
    if (!total && !includeZero) continue;
    const amount = total?.amount ?? 0;
    rows.push({
      categoryId: category.id,
      name: category.name,
      type: category.type,
      color: category.color,
      icon: category.icon,
      amount,
      count: total?.count ?? 0,
      share: grandTotal === 0 ? null : roundPercent((amount / grandTotal) * 100, 2),
    });
  }

  // Catégories référencées par une opération mais absentes du référentiel.
  for (const [categoryId, total] of totals) {
    if (categories.some((category) => category.id === categoryId)) continue;
    rows.push({
      categoryId,
      name: 'Catégorie supprimée',
      type,
      color: '#94a3b8',
      icon: 'help',
      amount: total.amount,
      count: total.count,
      share: grandTotal === 0 ? null : roundPercent((total.amount / grandTotal) * 100, 2),
    });
  }

  return rows.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'fr'));
}

export function compareMetric(current: number, previous: number): MetricComparison {
  const delta = current - previous;
  if (previous === 0 && current === 0) {
    return { current, previous, delta, percent: null, percentKind: 'undefined' };
  }
  if (previous === 0) {
    return { current, previous, delta, percent: null, percentKind: 'new' };
  }
  if (current === 0) {
    return { current, previous, delta, percent: null, percentKind: 'zero' };
  }
  if (previous < 0) {
    // Une base négative rend le pourcentage trompeur.
    return { current, previous, delta, percent: null, percentKind: 'undefined' };
  }
  return {
    current,
    previous,
    delta,
    percent: roundPercent((delta / previous) * 100, 2),
    percentKind: 'percent',
  };
}

export function compareSummaries(
  current: PeriodSummary,
  previous: PeriodSummary,
): SummaryComparison {
  return {
    income: compareMetric(current.income, previous.income),
    expense: compareMetric(current.expense, previous.expense),
    net: compareMetric(current.net, previous.net),
    count: compareMetric(current.count, previous.count),
  };
}

export function compareCategoryTotals(
  current: CategoryTotal[],
  previous: CategoryTotal[],
): CategoryComparison[] {
  const previousById = new Map(previous.map((row) => [row.categoryId, row]));
  const seen = new Set<string>();
  const rows: CategoryComparison[] = [];

  for (const row of current) {
    seen.add(row.categoryId);
    const previousRow = previousById.get(row.categoryId);
    const comparison = compareMetric(row.amount, previousRow?.amount ?? 0);
    rows.push({
      ...row,
      previous: previousRow?.amount ?? 0,
      delta: comparison.delta,
      percent: comparison.percent,
      percentKind: comparison.percentKind,
    });
  }
  for (const row of previous) {
    if (seen.has(row.categoryId)) continue;
    rows.push({
      ...row,
      amount: 0,
      count: 0,
      share: null,
      previous: row.amount,
      delta: -row.amount,
      percent: null,
      percentKind: 'zero',
    });
  }
  return rows.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'fr'));
}

/** Total d'un ensemble de catégories, par type. */
export function totalOfType(rows: CategoryTotal[], type: TransactionType): number {
  return sumAmounts(rows.filter((row) => row.type === type).map((row) => row.amount));
}

export interface MonthBreakdownRow extends PeriodSummary {
  period: Period;
  label: string;
}

export function monthlyBreakdown(
  transactions: Transaction[],
  period: Period,
): MonthBreakdownRow[] {
  return monthsOfPeriod(period).map((month) => ({
    period: month,
    label: month.label,
    ...summarizeTransactions(transactions, month),
  }));
}

/** Nombre d'opérations par source (saisie, import, récurrence). */
export function countBySource(transactions: Transaction[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const transaction of transactions) {
    counts[transaction.source] = (counts[transaction.source] ?? 0) + 1;
  }
  return counts;
}
