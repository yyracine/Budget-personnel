/**
 * Rendu de graphiques sur canvas pour l'export PDF.
 * Le rendu ne dépend d'aucune bibliothèque graphique et reste net (2x).
 */

import type { CategoryTotal } from '../domain/calculations';

/** Données minimales nécessaires au graphique mensuel. */
export interface MonthlyChartPoint {
  label: string;
  income: number;
  expense: number;
}

const INK = '#0f172a';
const MUTED = '#64748b';
const GRID = '#e2e8f0';
const INCOME = '#0f9d76';
const EXPENSE = '#e11d48';
const PALETTE = [
  '#0f9d76',
  '#2563eb',
  '#7c3aed',
  '#d97706',
  '#0e7490',
  '#e11d48',
  '#64748b',
  '#9333ea',
];

function compactAmount(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace('.', ',')} Md`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')} M`;
  if (absolute >= 1_000) return `${Math.round(value / 1_000)} k`;
  return String(Math.round(value));
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ratio = 2;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D indisponible.');
  context.scale(ratio, ratio);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  return canvas;
}

/** Graphique à barres groupées revenus / dépenses. */
export function renderMonthlyBarChart(
  points: ReadonlyArray<MonthlyChartPoint>,
  width = 1200,
  height = 520,
): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d')!;
  const margin = { top: 62, right: 28, bottom: 56, left: 74 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  context.font = '600 20px "Segoe UI", Arial, sans-serif';
  context.fillStyle = INK;
  context.fillText('Revenus et dépenses par mois', margin.left, 34);

  // Légende
  context.font = '15px "Segoe UI", Arial, sans-serif';
  context.fillStyle = INCOME;
  context.fillRect(width - 280, 22, 14, 14);
  context.fillStyle = INK;
  context.fillText('Revenus', width - 258, 35);
  context.fillStyle = EXPENSE;
  context.fillRect(width - 170, 22, 14, 14);
  context.fillStyle = INK;
  context.fillText('Dépenses', width - 148, 35);

  const maxValue = Math.max(1, ...points.flatMap((point) => [point.income, point.expense]));
  const magnitude = 10 ** Math.floor(Math.log10(maxValue));
  const step = Math.max(1, Math.ceil(maxValue / magnitude / 4) * magnitude);
  const axisMax = step * 4;

  context.strokeStyle = GRID;
  context.lineWidth = 1;
  context.font = '13px "Segoe UI", Arial, sans-serif';
  context.fillStyle = MUTED;
  context.textAlign = 'right';
  for (let tick = 0; tick <= 4; tick += 1) {
    const value = (axisMax / 4) * tick;
    const y = margin.top + plotHeight - (value / axisMax) * plotHeight;
    context.beginPath();
    context.moveTo(margin.left, y);
    context.lineTo(margin.left + plotWidth, y);
    context.stroke();
    context.fillText(compactAmount(value), margin.left - 10, y + 4);
  }
  context.textAlign = 'left';

  const groupWidth = plotWidth / Math.max(points.length, 1);
  const barWidth = Math.min(26, groupWidth * 0.3);
  context.font = '13px "Segoe UI", Arial, sans-serif';
  points.forEach((point, index) => {
    const center = margin.left + groupWidth * index + groupWidth / 2;
    const incomeHeight = (point.income / axisMax) * plotHeight;
    const expenseHeight = (point.expense / axisMax) * plotHeight;
    const base = margin.top + plotHeight;

    context.fillStyle = INCOME;
    context.fillRect(center - barWidth - 2, base - incomeHeight, barWidth, incomeHeight);
    context.fillStyle = EXPENSE;
    context.fillRect(center + 2, base - expenseHeight, barWidth, expenseHeight);

    context.fillStyle = MUTED;
    context.textAlign = 'center';
    context.fillText(point.label.split(' ')[0], center, base + 22);
  });

  context.strokeStyle = '#94a3b8';
  context.beginPath();
  context.moveTo(margin.left, margin.top + plotHeight);
  context.lineTo(margin.left + plotWidth, margin.top + plotHeight);
  context.stroke();

  return canvas;
}

export interface DonutSlice {
  name: string;
  amount: number;
  color: string;
}

/** Répartition des dépenses sous forme d'anneau + légende. */
export function renderCategoryDonut(
  rows: CategoryTotal[],
  total: number,
  width = 1200,
  height = 520,
): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d')!;

  context.font = '600 20px "Segoe UI", Arial, sans-serif';
  context.fillStyle = INK;
  context.fillText('Répartition des dépenses', 60, 34);

  const nonZero = rows.filter((row) => row.amount > 0);
  const top = nonZero.slice(0, 6);
  const rest = nonZero.slice(6);
  const slices: DonutSlice[] = top.map((row, index) => ({
    name: row.name,
    amount: row.amount,
    color: row.color || PALETTE[index % PALETTE.length],
  }));
  if (rest.length > 0) {
    slices.push({
      name: `Autres (${rest.length})`,
      amount: rest.reduce((sum, row) => sum + row.amount, 0),
      color: '#94a3b8',
    });
  }

  const centerX = 285;
  const centerY = 285;
  const radius = 155;
  const thickness = 62;
  let angle = -Math.PI / 2;

  if (total > 0 && slices.length > 0) {
    for (const slice of slices) {
      const sweep = (slice.amount / total) * Math.PI * 2;
      context.beginPath();
      context.strokeStyle = slice.color;
      context.lineWidth = thickness;
      context.arc(centerX, centerY, radius, angle, angle + sweep);
      context.stroke();
      angle += sweep;
    }
  } else {
    context.beginPath();
    context.strokeStyle = GRID;
    context.lineWidth = thickness;
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
  }

  context.fillStyle = INK;
  context.textAlign = 'center';
  context.font = '600 26px "Segoe UI", Arial, sans-serif';
  context.fillText(compactAmount(total), centerX, centerY + 2);
  context.font = '14px "Segoe UI", Arial, sans-serif';
  context.fillStyle = MUTED;
  context.fillText('FCFA dépensés', centerX, centerY + 26);
  context.textAlign = 'left';

  let legendY = 145;
  const legendX = 545;
  context.font = '15px "Segoe UI", Arial, sans-serif';
  for (const slice of slices.slice(0, 8)) {
    context.fillStyle = slice.color;
    context.fillRect(legendX, legendY - 11, 12, 12);
    context.fillStyle = INK;
    const share = total > 0 ? (slice.amount / total) * 100 : 0;
    const label = `${slice.name.length > 26 ? `${slice.name.slice(0, 25)}…` : slice.name}`;
    context.fillText(label, legendX + 22, legendY);
    context.fillStyle = MUTED;
    context.textAlign = 'right';
    context.fillText(
      `${compactAmount(slice.amount)} · ${share.toFixed(1).replace('.', ',')} %`,
      width - 70,
      legendY,
    );
    context.textAlign = 'left';
    legendY += 40;
  }

  return canvas;
}
