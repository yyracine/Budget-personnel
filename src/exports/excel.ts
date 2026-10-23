/**
 * Exports Excel (.xlsx).
 *
 * Les valeurs textuelles contrôlées par l'utilisateur sont écrites avec le
 * type `String` explicite : elles ne peuvent donc jamais être interprétées
 * comme des formules par Excel.
 */

import type { Cell, Columns, Row, SheetData } from 'write-excel-file';
import type {
  AppSettings,
  Budget,
  Category,
  RecurrenceRule,
  Transaction,
} from '../domain/types';
import type { PeriodReport } from '../domain/reports';
import { formatDateTime, formatDisplayDate } from '../domain/format';
import { FREQUENCY_LABELS, RULE_STATUS_LABELS, ruleStatus } from '../domain/recurrence';
import { todayISO } from '../domain/periods';

export interface WorkbookSheet {
  name: string;
  data: SheetData;
  columns?: Columns;
}

const TITLE_STYLE = { fontWeight: 'bold' as const, fontSize: 14, color: '#0f172a' };
const HEADER_STYLE = {
  fontWeight: 'bold' as const,
  backgroundColor: '#e2e8f0',
  borderColor: '#cbd5e1',
  borderStyle: 'thin' as const,
  wrap: true,
};
const BOLD_STYLE = { fontWeight: 'bold' as const };
const MONEY_FORMAT = '#,##0';

function text(value: string, style: Record<string, unknown> = {}): Cell {
  return { value, type: String, ...style };
}

function number(value: number, format = MONEY_FORMAT, style: Record<string, unknown> = {}): Cell {
  return { value, type: Number, format, ...style };
}

function dateCell(iso: string): Cell {
  const [year, month, day] = iso.split('-').map(Number);
  return {
    value: new Date(Date.UTC(year, month - 1, day)),
    type: Date,
    format: 'DD/MM/YYYY',
    align: 'left',
  };
}

function headerRow(labels: string[]): Row {
  return labels.map((label) => text(label, HEADER_STYLE));
}

function emptyRow(): Row {
  return [];
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function downloadWorkbook(
  sheets: WorkbookSheet[],
  fileName: string,
): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file');
  const blob = await writeXlsxFile(
    sheets.map((sheet) => sheet.data),
    {
      sheets: sheets.map((sheet) => sanitizeSheetName(sheet.name)),
      columns: sheets.map((sheet) => sheet.columns ?? []),
      dateFormat: 'DD/MM/YYYY',
    },
  );
  downloadBlob(blob, fileName);
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'manual':
      return 'Saisie manuelle';
    case 'recurrence':
      return 'Récurrence';
    case 'CSV':
      return 'Import CSV';
    case 'Excel':
      return 'Import Excel';
    case 'import':
      return 'Import';
    default:
      return source;
  }
}

function sortedTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  );
}

export function buildTransactionsSheet(
  transactions: Transaction[],
  categories: Category[],
  settings: AppSettings,
  title: string,
  filtersDescription: string,
): WorkbookSheet {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const rows: Row[] = [
    [text(title, TITLE_STYLE)],
    [text(`Période / filtres : ${filtersDescription}`)],
    [text(`Devise : ${settings.currency === 'XOF' ? 'FCFA (XOF)' : settings.currency}`)],
    [text(`Généré le : ${formatDateTime(new Date().toISOString())}`)],
    emptyRow(),
    headerRow([
      'Date',
      'Type',
      'Catégorie',
      'Libellé',
      'Note',
      'Montant (FCFA)',
      'Source',
      'Identifiant source',
      'Origine récurrence',
    ]),
  ];
  const sorted = sortedTransactions(transactions);
  for (const transaction of sorted) {
    const category = categoryById.get(transaction.categoryId);
    rows.push([
      dateCell(transaction.date),
      text(transaction.type === 'income' ? 'Revenu' : 'Dépense'),
      text(category?.name ?? 'Catégorie supprimée'),
      text(transaction.label),
      text(transaction.note),
      number(transaction.amount),
      text(sourceLabel(transaction.source)),
      text(transaction.sourceId ?? ''),
      text(transaction.occurrenceDate ? formatDisplayDate(transaction.occurrenceDate, 'DD/MM/YYYY') : ''),
    ]);
  }
  const income = sorted.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
  const expense = sorted.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
  rows.push(emptyRow());
  rows.push([text('Total revenus', BOLD_STYLE), number(income, MONEY_FORMAT, BOLD_STYLE)]);
  rows.push([text('Total dépenses', BOLD_STYLE), number(expense, MONEY_FORMAT, BOLD_STYLE)]);
  rows.push([text('Solde net', BOLD_STYLE), number(income - expense, MONEY_FORMAT, BOLD_STYLE)]);

  return {
    name: 'Opérations',
    data: rows,
    columns: [
      { width: 12 },
      { width: 10 },
      { width: 24 },
      { width: 32 },
      { width: 30 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
    ],
  };
}

export function buildReportWorkbook(
  report: PeriodReport,
  transactions: Transaction[],
  categories: Category[],
): WorkbookSheet[] {
  const { settings, period, summary, comparison, previousPeriod } = report;
  const currency = 'FCFA (XOF)';

  const summaryRows: Row[] = [
    [text('Rapport financier', TITLE_STYLE)],
    [text(`Période : ${period.label} (${formatDisplayDate(period.start)} → ${formatDisplayDate(period.end)})`)],
    [text(`Comparaison : ${previousPeriod.label}`)],
    [text(`Devise : ${currency}`)],
    [text(`Généré le : ${formatDateTime(new Date().toISOString())}`)],
    emptyRow(),
    headerRow(['Indicateur', 'Période', 'Période précédente', 'Écart', 'Variation']),
    [
      text('Revenus'),
      number(summary.income),
      number(comparison.income.previous),
      number(comparison.income.delta),
      percentCell(comparison.income.percent),
    ],
    [
      text('Dépenses'),
      number(summary.expense),
      number(comparison.expense.previous),
      number(comparison.expense.delta),
      percentCell(comparison.expense.percent),
    ],
    [
      text('Solde net', BOLD_STYLE),
      number(summary.net, MONEY_FORMAT, BOLD_STYLE),
      number(comparison.net.previous, MONEY_FORMAT, BOLD_STYLE),
      number(comparison.net.delta, MONEY_FORMAT, BOLD_STYLE),
      percentCell(comparison.net.percent),
    ],
    [
      text('Solde disponible en fin de période'),
      number(report.availableAtEnd),
      number(report.openingBalance),
      number(report.availableAtEnd - report.openingBalance),
      percentCell(null),
    ],
    [text('Nombre d’opérations'), number(summary.count, '0'), number(comparison.count.previous, '0'), number(comparison.count.delta, '0'), percentCell(comparison.count.percent)],
    emptyRow(),
    headerRow(['Budget', 'Prévu', 'Consommé', 'Reste', 'Taux']),
    [
      text('Total des budgets définis', BOLD_STYLE),
      number(report.budgetSummary.totalBudget, MONEY_FORMAT, BOLD_STYLE),
      number(report.budgetSummary.totalConsumed, MONEY_FORMAT, BOLD_STYLE),
      number(report.budgetSummary.totalRemaining, MONEY_FORMAT, BOLD_STYLE),
      percentCell(report.budgetSummary.overallRate === null ? null : report.budgetSummary.overallRate / 100),
    ],
    emptyRow(),
    headerRow(['Mois', 'Revenus', 'Dépenses', 'Solde net', 'Opérations']),
    ...report.monthly.map((month) => [
      text(month.label),
      number(month.income),
      number(month.expense),
      number(month.net),
      number(month.count, '0'),
    ]),
    [
      text('Total', BOLD_STYLE),
      number(summary.income, MONEY_FORMAT, BOLD_STYLE),
      number(summary.expense, MONEY_FORMAT, BOLD_STYLE),
      number(summary.net, MONEY_FORMAT, BOLD_STYLE),
      number(summary.count, '0', BOLD_STYLE),
    ],
  ];

  const categoryRows: Row[] = [
    [text(`Répartition par catégorie — ${period.label}`, TITLE_STYLE)],
    emptyRow(),
    headerRow(['Type', 'Catégorie', 'Montant (FCFA)', 'Opérations', 'Part du total (%)']),
  ];
  const pushCategoryRows = (rows: typeof report.incomeCategories, label: string) => {
    for (const row of rows) {
      categoryRows.push([
        text(label),
        text(row.name),
        number(row.amount),
        number(row.count, '0'),
        percentCell(row.share === null ? null : row.share / 100),
      ]);
    }
  };
  pushCategoryRows(report.incomeCategories, 'Revenu');
  pushCategoryRows(report.expenseCategories, 'Dépense');
  categoryRows.push(emptyRow());
  categoryRows.push([
    text('Total revenus', BOLD_STYLE),
    text(''),
    number(summary.income, MONEY_FORMAT, BOLD_STYLE),
    number(summary.incomeCount, '0', BOLD_STYLE),
    percentCell(summary.income === 0 ? null : 1),
  ]);
  categoryRows.push([
    text('Total dépenses', BOLD_STYLE),
    text(''),
    number(summary.expense, MONEY_FORMAT, BOLD_STYLE),
    number(summary.expenseCount, '0', BOLD_STYLE),
    percentCell(summary.expense === 0 ? null : 1),
  ]);

  const budgetRows: Row[] = [
    [text(`Budgets — ${period.label}`, TITLE_STYLE)],
    [text('Les budgets mensuels de chaque mois de la période sont additionnés.')],
    emptyRow(),
    headerRow(['Catégorie', 'Budget prévu', 'Consommé', 'Reste', 'Taux', 'État']),
  ];
  for (const row of report.budgetRows) {
    if (row.budgetAmount === null) continue;
    budgetRows.push([
      text(row.categoryName),
      number(row.budgetAmount),
      number(row.consumed),
      number(row.remaining ?? 0),
      percentCell(row.rate === null ? null : row.rate / 100),
      text(budgetStateLabel(row.state)),
    ]);
  }
  budgetRows.push(emptyRow());
  budgetRows.push([
    text('Total', BOLD_STYLE),
    number(report.budgetSummary.totalBudget, MONEY_FORMAT, BOLD_STYLE),
    number(report.budgetSummary.totalConsumed, MONEY_FORMAT, BOLD_STYLE),
    number(report.budgetSummary.totalRemaining, MONEY_FORMAT, BOLD_STYLE),
    percentCell(
      report.budgetSummary.overallRate === null ? null : report.budgetSummary.overallRate / 100,
    ),
    text(''),
  ]);

  const transactionSheet = buildTransactionsSheet(
    transactions.filter((transaction) => transaction.date >= period.start && transaction.date <= period.end),
    categories,
    settings,
    `Opérations — ${period.label}`,
    `${period.label}`,
  );

  return [
    { name: 'Synthèse', data: summaryRows, columns: [{ width: 34 }, { width: 18 }, { width: 20 }, { width: 16 }, { width: 14 }] },
    transactionSheet,
    {
      name: 'Catégories',
      data: categoryRows,
      columns: [{ width: 12 }, { width: 30 }, { width: 18 }, { width: 14 }, { width: 18 }],
    },
    {
      name: 'Budgets',
      data: budgetRows,
      columns: [{ width: 30 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 14 }],
    },
    {
      name: 'Mensuel',
      data: [
        [text(`Détail mensuel — ${period.label}`, TITLE_STYLE)],
        emptyRow(),
        headerRow(['Mois', 'Revenus', 'Dépenses', 'Solde net', 'Opérations']),
        ...report.monthly.map((month) => [
          text(month.label),
          number(month.income),
          number(month.expense),
          number(month.net),
          number(month.count, '0'),
        ]),
      ],
      columns: [{ width: 24 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }],
    },
  ];
}

function percentCell(percent: number | null): Cell {
  if (percent === null || !Number.isFinite(percent)) return text('—');
  return number(percent, '0.00%');
}

function budgetStateLabel(state: string): string {
  switch (state) {
    case 'exceeded':
      return 'Dépassé';
    case 'warning':
      return 'Alerte';
    case 'normal':
      return 'Normal';
    case 'zero-budget':
      return 'Budget nul';
    case 'no-budget':
      return 'Non défini';
    default:
      return state;
  }
}

export function buildFullWorkbook(data: {
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  recurrences: RecurrenceRule[];
  settings: AppSettings;
}): WorkbookSheet[] {
  const categoryById = new Map(data.categories.map((category) => [category.id, category]));
  const transactionSheet = buildTransactionsSheet(
    data.transactions,
    data.categories,
    data.settings,
    'Toutes les opérations',
    'Aucun filtre — export complet',
  );

  const categoryRows: Row[] = [
    [text('Catégories', TITLE_STYLE)],
    emptyRow(),
    headerRow(['Nom', 'Type', 'Couleur', 'Icône', 'Description', 'Active']),
    ...data.categories.map((category) => [
      text(category.name),
      text(category.type === 'income' ? 'Revenu' : 'Dépense'),
      text(category.color),
      text(category.icon),
      text(category.description),
      text(category.isActive ? 'Oui' : 'Non'),
    ]),
  ];

  const budgetRows: Row[] = [
    [text('Budgets mensuels', TITLE_STYLE)],
    emptyRow(),
    headerRow(['Mois', 'Catégorie', 'Budget prévu', 'Seuil d’alerte']),
    ...data.budgets
      .slice()
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
      .map((budget) => [
        text(`${budget.periodStart.slice(5, 7)}/${budget.periodStart.slice(0, 4)}`),
        text(categoryById.get(budget.categoryId)?.name ?? 'Catégorie supprimée'),
        number(budget.amount),
        percentCell(budget.alertThreshold / 100),
      ]),
  ];

  const recurrenceRows: Row[] = [
    [text('Récurrences', TITLE_STYLE)],
    [text('Les échéances ne sont comptées qu’après matérialisation en opération.')],
    emptyRow(),
    headerRow(['Libellé', 'Type', 'Catégorie', 'Montant', 'Fréquence', 'Début', 'Fin', 'Prochaine échéance', 'État']),
    ...data.recurrences.map((rule) => [
      text(rule.label),
      text(rule.type === 'income' ? 'Revenu' : 'Dépense'),
      text(categoryById.get(rule.categoryId)?.name ?? 'Catégorie supprimée'),
      number(rule.amount),
      text(FREQUENCY_LABELS[rule.frequency]),
      dateCell(rule.startDate),
      rule.endDate ? dateCell(rule.endDate) : text(''),
      dateCell(rule.nextOccurrence),
      text(RULE_STATUS_LABELS[ruleStatus(rule)]),
    ]),
  ];

  const settingsRows: Row[] = [
    [text('Paramètres', TITLE_STYLE)],
    emptyRow(),
    headerRow(['Paramètre', 'Valeur']),
    [text('Devise'), text('Franc CFA BCEAO (XOF)')],
    [text('Solde initial'), number(data.settings.initialBalance)],
    [text('Thème'), text(data.settings.theme)],
    [text('Format de date'), text(data.settings.dateFormat)],
    [text('Format de nombre'), text(data.settings.numberFormat)],
    [text('Version des données'), number(data.settings.version, '0')],
    [text('Date d’export'), text(formatDisplayDate(todayISO(), data.settings.dateFormat))],
  ];

  return [
    transactionSheet,
    { name: 'Catégories', data: categoryRows, columns: [{ width: 28 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 40 }, { width: 10 }] },
    { name: 'Budgets', data: budgetRows, columns: [{ width: 14 }, { width: 30 }, { width: 18 }, { width: 16 }] },
    { name: 'Récurrences', data: recurrenceRows, columns: [{ width: 30 }, { width: 10 }, { width: 24 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 12 }, { width: 18 }, { width: 16 }] },
    { name: 'Paramètres', data: settingsRows, columns: [{ width: 28 }, { width: 30 }] },
  ];
}

export function reportFileName(report: PeriodReport): string {
  const slug = report.period.key.replace(/[^a-z0-9-]/gi, '-');
  return `budget-rapport-${slug}.xlsx`;
}

export function operationsFileName(now: Date = new Date()): string {
  return `budget-operations-${todayISO(now).replace(/-/g, '')}.xlsx`;
}

export function fullExportFileName(now: Date = new Date()): string {
  return `budget-donnees-${todayISO(now).replace(/-/g, '')}.xlsx`;
}
