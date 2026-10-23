import { describe, expect, it } from 'vitest';
import { buildReportPdf } from './pdf';
import { buildPeriodReport } from '../domain/reports';
import { makePeriod } from '../domain/periods';
import { categoryByName, testCategories, testSettings, transaction } from '../test/factories';
import type { Budget } from '../domain/types';

const categories = testCategories();
const food = categoryByName('Alimentation');
const salary = categoryByName('Salaire');
const settings = testSettings({ initialBalance: 50000 });
const transactions = [
  transaction({ date: '2026-01-02', type: 'income', amount: 300000, categoryId: salary.id, label: 'Salaire' }),
  transaction({ date: '2026-01-05', type: 'expense', amount: 50000, categoryId: food.id, label: 'Courses' }),
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

describe('buildReportPdf', () => {
  it('génère un fichier PDF valide sans graphique canvas', async () => {
    const report = buildPeriodReport({
      transactions,
      categories,
      budgets,
      settings,
      period: makePeriod('month', 2026, 1),
    });
    const blob = buildReportPdf(report, { includeCharts: false });
    expect(blob.size).toBeGreaterThan(1500);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const header = String.fromCharCode(...bytes.slice(0, 4));
    expect(header).toBe('%PDF');
  });
});
