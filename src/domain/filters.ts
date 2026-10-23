import type { Transaction, TransactionFilter } from './types';

export type TransactionSort =
  | 'date-desc'
  | 'date-asc'
  | 'amount-desc'
  | 'amount-asc'
  | 'label-asc';

export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Applique tous les filtres visibles et le tri. Les critères non renseignés
 * sont ignorés ; `all` neutralise un filtre.
 */
export function applyTransactionFilter(
  transactions: Transaction[],
  filter: TransactionFilter,
  sort: TransactionSort = 'date-desc',
): Transaction[] {
  const keyword = filter.keyword ? normalizeSearch(filter.keyword) : '';
  const filtered = transactions.filter((transaction) => {
    if (filter.range) {
      if (transaction.date < filter.range.start || transaction.date > filter.range.end) {
        return false;
      }
    }
    if (filter.type && filter.type !== 'all' && transaction.type !== filter.type) return false;
    if (filter.categoryId && filter.categoryId !== 'all' && transaction.categoryId !== filter.categoryId) {
      return false;
    }
    if (filter.minAmount !== undefined && transaction.amount < filter.minAmount) return false;
    if (filter.maxAmount !== undefined && transaction.amount > filter.maxAmount) return false;
    if (filter.source && filter.source !== 'all' && transaction.source !== filter.source) {
      return false;
    }
    if (keyword) {
      const haystack = normalizeSearch(`${transaction.label} ${transaction.note}`);
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });

  const sorted = [...filtered];
  switch (sort) {
    case 'date-asc':
      sorted.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
      break;
    case 'amount-desc':
      sorted.sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date));
      break;
    case 'amount-asc':
      sorted.sort((a, b) => a.amount - b.amount || b.date.localeCompare(a.date));
      break;
    case 'label-asc':
      sorted.sort((a, b) => a.label.localeCompare(b.label, 'fr') || b.date.localeCompare(a.date));
      break;
    case 'date-desc':
    default:
      sorted.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
      break;
  }
  return sorted;
}

export function hasActiveFilters(filter: TransactionFilter): boolean {
  return Boolean(
    filter.range ||
      (filter.type && filter.type !== 'all') ||
      (filter.categoryId && filter.categoryId !== 'all') ||
      filter.minAmount !== undefined ||
      filter.maxAmount !== undefined ||
      (filter.keyword && filter.keyword.trim()) ||
      (filter.source && filter.source !== 'all'),
  );
}
