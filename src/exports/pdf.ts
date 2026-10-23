/**
 * Export PDF d'un rapport de période.
 * Toutes les valeurs proviennent de `PeriodReport`, donc des mêmes calculs que
 * l'écran et l'export Excel.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PeriodReport } from '../domain/reports';
import type { MetricComparison, PercentKind } from '../domain/calculations';
import type { BudgetState } from '../domain/budgets';
import { formatDisplayDate, formatDateTime } from '../domain/format';
import { formatMoney, formatPercent } from '../domain/money';
import { renderCategoryDonut, renderMonthlyBarChart } from './charts';
import { downloadBlob } from './excel';

type RGB = [number, number, number];

const INK: RGB = [15, 23, 42];
const MUTED: RGB = [100, 116, 139];
const LINE: RGB = [226, 232, 240];
const HEADER_BG: RGB = [12, 20, 36];
const ACCENT: RGB = [15, 118, 110];
const GREEN: RGB = [15, 157, 118];
const RED: RGB = [190, 18, 60];

const MARGIN = 14;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_LIMIT = 274;

/** Remplace les caractères non pris en charge par les polices PDF standard. */
function clean(value: string): string {
  return value
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2212/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/\u2026/g, '...');
}

function money(amount: number): string {
  return clean(formatMoney(amount, 'fr-FR', { symbol: false }));
}

function moneyWithCurrency(amount: number): string {
  return clean(formatMoney(amount, 'fr-FR'));
}

function signedMoney(amount: number): string {
  if (amount === 0) return money(0);
  return `${amount > 0 ? '+' : '-'}${money(Math.abs(amount))}`;
}

function percentText(percent: number | null): string {
  return clean(formatPercent(percent));
}

function variationText(comparison: MetricComparison): string {
  switch (comparison.percentKind) {
    case 'new':
      return 'Nouvelle valeur';
    case 'zero':
      return 'Passage à zéro';
    case 'undefined':
      return 'Non calculable';
    case 'percent':
    default:
      return percentText(comparison.percent);
  }
}

function budgetStateLabel(state: BudgetState): string {
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

function addPageIfNeeded(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= BOTTOM_LIMIT) return y;
  doc.addPage();
  return 20;
}

function sectionTitle(doc: jsPDF, title: string, subtitle: string | null, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(clean(title), MARGIN, y);
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(clean(subtitle), MARGIN, y + 5);
    return y + 11;
  }
  return y + 7;
}

interface TableOptions {
  head: string[][];
  body: (string | number)[][];
  foot?: (string | number)[][];
  columnStyles?: Record<number, { halign?: 'left' | 'right' | 'center'; cellWidth?: number | 'auto' | 'wrap' }>;
  startY: number;
}

function drawTable(doc: jsPDF, options: TableOptions): number {
  autoTable(doc, {
    startY: options.startY,
    head: options.head,
    body: options.body,
    foot: options.foot,
    margin: { left: MARGIN, right: MARGIN, bottom: 20 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.2,
      textColor: INK,
      lineColor: LINE,
      lineWidth: 0.1,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: INK,
      fontStyle: 'bold',
      lineWidth: 0.1,
      lineColor: LINE,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: INK,
      fontStyle: 'bold',
      lineWidth: 0.1,
      lineColor: LINE,
    },
    alternateRowStyles: { fillColor: [250, 252, 254] },
    rowPageBreak: 'avoid',
    showFoot: 'lastPage',
    columnStyles: options.columnStyles ?? {},
  });
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
    ?.finalY;
  return finalY ?? options.startY + 20;
}

function drawKpiCards(doc: jsPDF, report: PeriodReport, y: number): number {
  const gap = 4;
  const cardWidth = (CONTENT_WIDTH - gap * 3) / 4;
  const cardHeight = 25;
  const cards = [
    { label: 'Revenus', value: report.summary.income, color: GREEN },
    { label: 'Dépenses', value: report.summary.expense, color: RED },
    { label: 'Solde net', value: report.summary.net, color: INK },
    { label: 'Solde disponible', value: report.availableAtEnd, color: ACCENT },
  ];

  cards.forEach((card, index) => {
    const x = MARGIN + index * (cardWidth + gap);
    doc.setFillColor(...card.color);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(clean(card.label.toUpperCase()), x + 3.5, y + 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(money(card.value), x + 3.5, y + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text('FCFA', x + 3.5, y + 21);
  });
  return y + cardHeight + 9;
}

function drawHeader(doc: jsPDF, report: PeriodReport): number {
  doc.setFillColor(...HEADER_BG);
  doc.rect(0, 0, PAGE_WIDTH, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Budget personnel', MARGIN, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Rapport financier', MARGIN, 23);
  doc.setFontSize(9);
  doc.text(clean(report.period.label), PAGE_WIDTH - MARGIN, 16, { align: 'right' });
  doc.setTextColor(203, 213, 225);
  doc.setFontSize(8);
  doc.text(
    clean(
      `${formatDisplayDate(report.period.start)} - ${formatDisplayDate(report.period.end)}`,
    ),
    PAGE_WIDTH - MARGIN,
    23,
    { align: 'right' },
  );
  doc.text(
    clean(`Généré le ${formatDateTime(new Date().toISOString())}`),
    PAGE_WIDTH - MARGIN,
    29,
    { align: 'right' },
  );
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text('Montants en francs CFA (XOF)', MARGIN, 46);
  return 53;
}

function drawComparison(doc: jsPDF, report: PeriodReport, y: number): number {
  y = sectionTitle(doc, 'Comparaison avec la période précédente', report.previousPeriod.label, y);
  const rows = [
    [
      'Revenus',
      money(report.comparison.income.current),
      money(report.comparison.income.previous),
      signedMoney(report.comparison.income.delta),
      variationText(report.comparison.income),
    ],
    [
      'Dépenses',
      money(report.comparison.expense.current),
      money(report.comparison.expense.previous),
      signedMoney(report.comparison.expense.delta),
      variationText(report.comparison.expense),
    ],
    [
      'Solde net',
      money(report.comparison.net.current),
      money(report.comparison.net.previous),
      signedMoney(report.comparison.net.delta),
      variationText(report.comparison.net),
    ],
  ];
  const finalY = drawTable(doc, {
    head: [
      [
        'Indicateur',
        report.period.label,
        report.previousPeriod.label,
        'Écart',
        'Variation',
      ],
    ],
    body: rows,
    startY: y,
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(
    "Écart = période récente - période précédente. Une hausse des dépenses n'est pas favorable.",
    MARGIN,
    finalY + 4,
  );
  return finalY + 10;
}

function drawMonthlyChart(doc: jsPDF, report: PeriodReport, y: number, includeCharts: boolean): number {
  if (!includeCharts) return y;
  const imageWidth = CONTENT_WIDTH;
  const imageHeight = (imageWidth * 520) / 1200;
  y = addPageIfNeeded(doc, y, imageHeight + 20);
  try {
    const canvas = renderMonthlyBarChart(report.monthly);
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', MARGIN, y + 4, imageWidth, imageHeight);
    return y + imageHeight + 12;
  } catch {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('Graphique indisponible dans cet environnement.', MARGIN, y + 8);
    return y + 14;
  }
}

function drawDonut(doc: jsPDF, report: PeriodReport, y: number, includeCharts: boolean): number {
  if (!includeCharts) return y;
  if (report.summary.expense === 0) return y;
  const imageWidth = CONTENT_WIDTH;
  const imageHeight = (imageWidth * 520) / 1200;
  y = addPageIfNeeded(doc, y, imageHeight + 10);
  try {
    const canvas = renderCategoryDonut(report.expenseCategories, report.summary.expense);
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', MARGIN, y + 2, imageWidth, imageHeight);
    return y + imageHeight + 10;
  } catch {
    return y;
  }
}

function drawCategoryTable(
  doc: jsPDF,
  title: string,
  rows: { name: string; amount: number; count: number; share: number | null }[],
  totalAmount: number,
  totalCount: number,
  y: number,
): number {
  y = addPageIfNeeded(doc, y, 32);
  y = sectionTitle(doc, title, 'Montants en FCFA', y);
  const body = rows.map((row) => [
    row.name,
    money(row.amount),
    String(row.count),
    row.share === null ? '—' : percentText(row.share),
  ]);
  if (body.length === 0) body.push(['Aucune catégorie', money(0), '0', '—']);
  const finalY = drawTable(doc, {
    head: [['Catégorie', 'Montant', 'Opérations', 'Part du total']],
    body,
    foot: [['Total', money(totalAmount), String(totalCount), totalAmount === 0 ? '—' : '100 %']],
    startY: y,
    columnStyles: {
      0: { cellWidth: 88 },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
  });
  return finalY + 9;
}

function comparisonKindLabel(kind: PercentKind): string {
  switch (kind) {
    case 'new':
      return 'Nouvelle valeur';
    case 'zero':
      return 'Passage à zéro';
    case 'undefined':
      return 'Non calculable';
    default:
      return 'Pourcentage';
  }
}

export interface PdfOptions {
  includeCharts?: boolean;
  generatedAt?: Date;
}

/** Construit le PDF et renvoie le fichier binaire. */
export function buildReportPdf(report: PeriodReport, options: PdfOptions = {}): Blob {
  const { includeCharts = true, generatedAt = new Date() } = options;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.setProperties({
    title: `Rapport financier - ${report.period.label}`,
    subject: 'Rapport de budget personnel',
    author: 'Budget personnel',
    creator: 'Budget personnel',
  });

  let y = drawHeader(doc, report);
  y = drawKpiCards(doc, report, y);
  y = drawComparison(doc, report, y);
  y = drawMonthlyChart(doc, report, y, includeCharts);
  y = drawDonut(doc, report, y, includeCharts);
  y = drawCategoryTable(
    doc,
    'Revenus par catégorie',
    report.incomeCategories,
    report.summary.income,
    report.summary.incomeCount,
    y,
  );
  y = drawCategoryTable(
    doc,
    'Dépenses par catégorie',
    report.expenseCategories,
    report.summary.expense,
    report.summary.expenseCount,
    y,
  );

  if (report.monthly.length > 1) {
    y = addPageIfNeeded(doc, y, 40);
    y = sectionTitle(doc, 'Détail mensuel', report.period.label, y);
    y = drawTable(doc, {
      head: [['Mois', 'Revenus', 'Dépenses', 'Solde net', 'Opérations']],
      body: report.monthly.map((month) => [
        month.label,
        money(month.income),
        money(month.expense),
        signedMoney(month.net),
        String(month.count),
      ]),
      foot: [
        [
          'Total',
          money(report.summary.income),
          money(report.summary.expense),
          signedMoney(report.summary.net),
          String(report.summary.count),
        ],
      ],
      startY: y,
      columnStyles: {
        0: { cellWidth: 76 },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    });
    y += 9;
  }

  const budgetRows = report.budgetRows.filter(
    (row) => row.budgetAmount !== null || row.consumed > 0,
  );
  if (budgetRows.length > 0) {
    y = addPageIfNeeded(doc, y, 45);
    y = sectionTitle(
      doc,
      'Budgets',
      'Prévu et réalisé sur la période. Les budgets mensuels sont additionnés.',
      y,
    );
    y = drawTable(doc, {
      head: [['Catégorie', 'Prévu', 'Consommé', 'Reste', 'Taux', 'État']],
      body: budgetRows.map((row) => [
        row.categoryName,
        row.budgetAmount === null ? '—' : money(row.budgetAmount),
        money(row.consumed),
        row.remaining === null ? '—' : signedMoney(row.remaining),
        row.rate === null ? '—' : percentText(row.rate),
        budgetStateLabel(row.state),
      ]),
      foot: [
        [
          'Total budgets définis',
          money(report.budgetSummary.totalBudget),
          money(report.budgetSummary.totalConsumed),
          signedMoney(report.budgetSummary.totalRemaining),
          report.budgetSummary.overallRate === null
            ? '—'
            : percentText(report.budgetSummary.overallRate),
          '',
        ],
      ],
      startY: y,
      columnStyles: {
        0: { cellWidth: 66 },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    });
    y += 8;
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, 283, PAGE_WIDTH - MARGIN, 283);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text('Budget personnel - rapport financier', MARGIN, 288);
    doc.text(
      clean(`Généré le ${formatDateTime(generatedAt.toISOString())}`),
      PAGE_WIDTH / 2,
      288,
      { align: 'center' },
    );
    doc.text(`Page ${page} / ${pageCount}`, PAGE_WIDTH - MARGIN, 288, { align: 'right' });
  }

  return doc.output('blob');
}

export async function downloadReportPdf(
  report: PeriodReport,
  fileName?: string,
): Promise<void> {
  const blob = buildReportPdf(report);
  downloadBlob(blob, fileName ?? `budget-rapport-${report.period.key}.pdf`);
}

/** Exposé pour les tests : libellés de variation sans calcul supplémentaire. */
export function describeComparison(comparison: MetricComparison): {
  delta: string;
  variation: string;
  kind: string;
} {
  return {
    delta: signedMoney(comparison.delta),
    variation: variationText(comparison),
    kind: comparisonKindLabel(comparison.percentKind),
  };
}

export { moneyWithCurrency };
