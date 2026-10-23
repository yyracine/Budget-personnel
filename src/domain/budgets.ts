import type { Budget, Category, DateRange, ISODate, Transaction } from './types';
import { monthRange, monthsBetween, parseISODate } from './periods';
import { roundPercent } from './money';

export type BudgetState = 'no-budget' | 'zero-budget' | 'normal' | 'warning' | 'exceeded';

export interface BudgetStatus {
  budgetAmount: number | null;
  consumed: number;
  remaining: number | null;
  /** Pourcentage consommé ; null si le budget est absent ou nul. */
  rate: number | null;
  state: BudgetState;
}

export const DEFAULT_ALERT_THRESHOLD = 80;

/**
 * État d'un budget mensuel.
 * - consommation > budget : dépassé ;
 * - consommation >= seuil : alerte ;
 * - sinon normal.
 * Un budget nul ou absent ne produit jamais de division par zéro.
 */
export function computeBudgetStatus(
  budgetAmount: number | null,
  consumed: number,
  alertThreshold: number = DEFAULT_ALERT_THRESHOLD,
): BudgetStatus {
  if (budgetAmount === null) {
    return {
      budgetAmount: null,
      consumed,
      remaining: null,
      rate: null,
      state: 'no-budget',
    };
  }
  if (budgetAmount <= 0) {
    return {
      budgetAmount,
      consumed,
      remaining: null,
      rate: null,
      state: 'zero-budget',
    };
  }
  const rate = roundPercent((consumed / budgetAmount) * 100, 2);
  const remaining = budgetAmount - consumed;
  let state: BudgetState;
  if (consumed > budgetAmount) state = 'exceeded';
  else if (consumed >= (budgetAmount * alertThreshold) / 100) state = 'warning';
  else state = 'normal';
  return { budgetAmount, consumed, remaining, rate, state };
}

export function budgetPeriodStart(periodStart: ISODate): { start: ISODate; end: ISODate } {
  const parsed = parseISODate(periodStart);
  if (!parsed) throw new RangeError(`Mois de budget invalide : ${periodStart}`);
  return monthRange(parsed.year, parsed.month);
}

/** Consommation réelle d'un budget : dépenses de la catégorie sur le mois exact. */
export function budgetConsumption(transactions: Transaction[], budget: Budget): number {
  const range = budgetPeriodStart(budget.periodStart);
  let total = 0;
  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    if (transaction.categoryId !== budget.categoryId) continue;
    if (transaction.date < range.start || transaction.date > range.end) continue;
    total += transaction.amount;
  }
  return total;
}

export interface BudgetRow {
  categoryId: string;
  categoryName: string;
  color: string;
  icon: string;
  budgetId: string | null;
  budgetAmount: number | null;
  alertThreshold: number;
  consumed: number;
  remaining: number | null;
  rate: number | null;
  state: BudgetState;
}

/**
 * Construit les lignes de budget d'un mois : budgets définis et catégories de
 * dépenses actives sans budget (état « non défini »).
 */
export function buildBudgetRows(
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  monthStart: ISODate,
): BudgetRow[] {
  return buildBudgetRowsForRange(budgets, transactions, categories, budgetPeriodStart(monthStart));
}

/**
 * Lignes de budget agrégées sur une plage (un mois ou plusieurs mois pour un
 * rapport trimestriel, semestriel ou annuel). Les budgets mensuels de chaque
 * mois de la période sont additionnés ; la consommation est celle des dépenses
 * exactement comprises dans la plage.
 */
export function buildBudgetRowsForRange(
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  range: DateRange,
): BudgetRow[] {
  const monthStarts = new Set(monthsBetween(range).map((month) => month.start));
  const relevantBudgets = budgets.filter(
    (budget) => budget.periodType === 'month' && monthStarts.has(budget.periodStart),
  );

  const budgetByCategory = new Map<string, { amount: number; threshold: number; id: string }>();
  for (const budget of relevantBudgets) {
    const current = budgetByCategory.get(budget.categoryId);
    if (current) {
      current.amount += budget.amount;
      current.threshold = Math.min(current.threshold, budget.alertThreshold);
    } else {
      budgetByCategory.set(budget.categoryId, {
        amount: budget.amount,
        threshold: budget.alertThreshold,
        id: budget.id,
      });
    }
  }

  const consumedByCategory = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    if (transaction.date < range.start || transaction.date > range.end) continue;
    consumedByCategory.set(
      transaction.categoryId,
      (consumedByCategory.get(transaction.categoryId) ?? 0) + transaction.amount,
    );
  }

  const categoryIds = new Set<string>();
  for (const category of categories) {
    if (category.type === 'expense' && category.isActive) categoryIds.add(category.id);
  }
  for (const budget of relevantBudgets) categoryIds.add(budget.categoryId);
  for (const categoryId of consumedByCategory.keys()) categoryIds.add(categoryId);

  const rows: BudgetRow[] = [];
  for (const categoryId of categoryIds) {
    const category = categories.find((item) => item.id === categoryId);
    const budget = budgetByCategory.get(categoryId);
    const consumed = consumedByCategory.get(categoryId) ?? 0;
    const budgetAmount = budget?.amount ?? null;
    const threshold = budget?.threshold ?? DEFAULT_ALERT_THRESHOLD;
    const status = computeBudgetStatus(budgetAmount, consumed, threshold);
    rows.push({
      categoryId,
      categoryName: category?.name ?? 'Catégorie supprimée',
      color: category?.color ?? '#94a3b8',
      icon: category?.icon ?? 'help',
      budgetId: budget?.id ?? null,
      budgetAmount,
      alertThreshold: threshold,
      consumed: status.consumed,
      remaining: status.remaining,
      rate: status.rate,
      state: status.state,
    });
  }

  const order: Record<BudgetState, number> = {
    exceeded: 0,
    warning: 1,
    normal: 2,
    'zero-budget': 3,
    'no-budget': 4,
  };
  return rows.sort(
    (a, b) =>
      order[a.state] - order[b.state] ||
      b.consumed - a.consumed ||
      a.categoryName.localeCompare(b.categoryName, 'fr'),
  );
}

export interface BudgetSummary {
  totalBudget: number;
  totalConsumed: number;
  totalRemaining: number;
  overallRate: number | null;
  definedCount: number;
  exceededCount: number;
  warningCount: number;
}

export function summarizeBudgets(rows: BudgetRow[]): BudgetSummary {
  let totalBudget = 0;
  let totalConsumed = 0;
  let definedCount = 0;
  let exceededCount = 0;
  let warningCount = 0;
  for (const row of rows) {
    if (row.budgetAmount !== null && row.budgetAmount > 0) {
      totalBudget += row.budgetAmount;
      totalConsumed += row.consumed;
      definedCount += 1;
      if (row.state === 'exceeded') exceededCount += 1;
      if (row.state === 'warning') warningCount += 1;
    }
  }
  return {
    totalBudget,
    totalConsumed,
    totalRemaining: totalBudget - totalConsumed,
    overallRate: totalBudget > 0 ? roundPercent((totalConsumed / totalBudget) * 100, 2) : null,
    definedCount,
    exceededCount,
    warningCount,
  };
}

export function budgetMonthStart(year: number, month: number): ISODate {
  return monthRange(year, month).start;
}
