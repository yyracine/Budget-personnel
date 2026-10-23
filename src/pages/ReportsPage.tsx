import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import type { Period } from '../domain/types';
import { periodForDate, todayISO } from '../domain/periods';
import { buildPeriodReport } from '../domain/reports';
import { formatDisplayDate } from '../domain/format';
import { formatMoney, formatPercent } from '../domain/money';
import type { CategoryComparison, MetricComparison } from '../domain/calculations';
import type { BudgetState } from '../domain/budgets';
import { buildReportWorkbook, downloadWorkbook, reportFileName } from '../exports/excel';
import { downloadReportPdf } from '../exports/pdf';
import { PeriodPicker } from '../components/PeriodPicker';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  InlineAlert,
  Money,
  PageHeader,
  StatCard,
} from '../components/ui';
import { Icon } from '../components/Icon';

const BUDGET_STATE_LABEL: Record<BudgetState, string> = {
  normal: 'Normal',
  warning: 'Alerte',
  exceeded: 'Dépassé',
  'no-budget': 'Non défini',
  'zero-budget': 'Budget nul',
};

function budgetTone(state: BudgetState): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (state === 'exceeded') return 'danger';
  if (state === 'warning') return 'warning';
  if (state === 'normal') return 'success';
  if (state === 'zero-budget') return 'info';
  return 'neutral';
}

function variationLabel(comparison: MetricComparison): string {
  if (comparison.percentKind === 'percent') {
    return comparison.percent === null ? '—' : formatPercent(comparison.percent);
  }
  if (comparison.percentKind === 'new') return 'Nouvelle valeur';
  if (comparison.percentKind === 'zero') return 'Passage à zéro';
  return 'Non calculable';
}

function signed(amount: number): string {
  if (amount === 0) return formatMoney(0).replace(/\u00a0|\u202f/g, ' ');
  return `${amount > 0 ? '+' : '\u2212'}${formatMoney(Math.abs(amount)).replace(/\u00a0|\u202f/g, ' ')}`;
}

export default function ReportsPage() {
  const { transactions, categories, budgets, settings, openTransactionEditor, notify } = useApp();
  const [period, setPeriod] = useState<Period>(() => periodForDate(todayISO(), 'month'));
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  const report = useMemo(
    () => buildPeriodReport({ transactions, categories, budgets, settings, period }),
    [transactions, categories, budgets, settings, period],
  );

  const periodTransactions = useMemo(
    () =>
      transactions.filter(
        (transaction) => transaction.date >= period.start && transaction.date <= period.end,
      ),
    [transactions, period],
  );

  const handleExcel = async () => {
    setExporting('excel');
    try {
      const sheets = buildReportWorkbook(report, transactions, categories);
      await downloadWorkbook(sheets, reportFileName(report));
      notify('Rapport Excel généré.', 'success');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Impossible de générer le rapport Excel.',
        'error',
      );
    } finally {
      setExporting(null);
    }
  };

  const handlePdf = async () => {
    setExporting('pdf');
    try {
      await downloadReportPdf(report);
      notify('Rapport PDF généré.', 'success');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Impossible de générer le rapport PDF.',
        'error',
      );
    } finally {
      setExporting(null);
    }
  };

  if (transactions.length === 0) {
    return (
      <>
        <PageHeader
          title="Rapports"
          subtitle="Bilans mensuels, trimestriels, semestriels et annuels calculés à partir de vos opérations réelles."
        />
        <EmptyState
          icon="chart"
          title="Aucune donnée à rapporter"
          description="Enregistrez ou importez des opérations pour obtenir des rapports fiables. Aucun rapport fictif n’est généré."
          actions={
            <>
              <Button variant="primary" icon="plus" onClick={() => openTransactionEditor('expense')}>
                Ajouter une opération
              </Button>
              <Link className="btn btn-secondary" to="/donnees">
                <Icon name="upload" size={16} /> Importer des données
              </Link>
            </>
          }
        />
      </>
    );
  }

  const budgetRows = report.budgetRows.filter(
    (row) => row.budgetAmount !== null || row.consumed > 0,
  );

  return (
    <>
      <PageHeader
        title={`Rapport — ${period.label}`}
        subtitle="Les montants, parts et comparaisons utilisent la même logique métier que le tableau de bord, Excel et le PDF."
        actions={
          <>
            <Button icon="file-spreadsheet" onClick={handleExcel} disabled={exporting !== null}>
              {exporting === 'excel' ? 'Génération…' : 'Excel'}
            </Button>
            <Button variant="primary" icon="file-text" onClick={handlePdf} disabled={exporting !== null}>
              {exporting === 'pdf' ? 'Génération…' : 'PDF'}
            </Button>
          </>
        }
      />

      <div className="row-between mb-3">
        <PeriodPicker period={period} onChange={setPeriod} />
        <span className="small muted">
          {formatDisplayDate(period.start, settings.dateFormat)} →{' '}
          {formatDisplayDate(period.end, settings.dateFormat)} · {periodTransactions.length}{' '}
          opération{periodTransactions.length > 1 ? 's' : ''}
        </span>
      </div>

      {periodTransactions.length === 0 && (
        <div className="mb-3">
          <InlineAlert tone="info">
            Aucune opération sur cette période. Les totaux sont à zéro ; les périodes précédentes
            restent consultables en changeant la période.
          </InlineAlert>
        </div>
      )}

      <div className="stat-grid">
        <StatCard
          label="Revenus"
          value={<span className="text-income">{formatMoney(report.summary.income).replace(/\u00a0|\u202f/g, ' ')}</span>}
          meta={`${report.summary.incomeCount} opération(s) · ${variationLabel(report.comparison.income)} vs ${report.previousPeriod.label}`}
          tone="income"
          icon="arrow-down-right"
        />
        <StatCard
          label="Dépenses"
          value={<span className="text-expense">{formatMoney(report.summary.expense).replace(/\u00a0|\u202f/g, ' ')}</span>}
          meta={`${report.summary.expenseCount} opération(s) · ${variationLabel(report.comparison.expense)} vs ${report.previousPeriod.label}`}
          tone="expense"
          icon="arrow-up-right"
        />
        <StatCard
          label="Solde net de la période"
          value={<Money value={report.summary.net} />}
          meta={`Revenus − dépenses · ${variationLabel(report.comparison.net)} vs période précédente`}
          tone={report.summary.net < 0 ? 'warning' : 'default'}
          icon="scale"
        />
        <StatCard
          label="Solde disponible"
          value={<Money value={report.availableAtEnd} />}
          meta={`Cumulé au ${formatDisplayDate(period.end, settings.dateFormat)}`}
          tone="info"
          icon="wallet"
        />
      </div>

      <div className="section report-split">
        <Card
          title="Comparaison avec la période précédente"
          subtitle={`${report.period.label} vs ${report.previousPeriod.label}`}
          flush
        >
          <div className="table-wrap">
            <table className="data-table comparison-table">
              <caption className="visually-hidden">
                Comparaison des revenus, dépenses et soldes avec la période précédente
              </caption>
              <thead>
                <tr>
                  <th scope="col">Indicateur</th>
                  <th scope="col" className="num">{report.period.label}</th>
                  <th scope="col" className="num">{report.previousPeriod.label}</th>
                  <th scope="col" className="num">Écart</th>
                  <th scope="col" className="num">Variation</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Revenus', report.comparison.income],
                  ['Dépenses', report.comparison.expense],
                  ['Solde net', report.comparison.net],
                  ['Opérations', report.comparison.count],
                ].map(([label, comparison]) => {
                  const metric = comparison as MetricComparison;
                  return (
                    <tr key={String(label)}>
                      <td className="cell-title">{String(label)}</td>
                      <td className="num">
                        {label === 'Opérations'
                          ? metric.current
                          : formatMoney(metric.current).replace(/\u00a0|\u202f/g, ' ')}
                      </td>
                      <td className="num">
                        {label === 'Opérations'
                          ? metric.previous
                          : formatMoney(metric.previous).replace(/\u00a0|\u202f/g, ' ')}
                      </td>
                      <td className="num">
                        {label === 'Opérations'
                          ? `${metric.delta > 0 ? '+' : ''}${metric.delta}`
                          : signed(metric.delta)}
                      </td>
                      <td className="num">{variationLabel(metric)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint" style={{ padding: '10px 20px 16px' }}>
            Écart = période récente − période précédente. Une hausse des dépenses n’est pas
            favorable. Si la base est nulle, aucun pourcentage trompeur n’est affiché.
          </p>
        </Card>

        <Card
          title="Synthèse budgétaire"
          subtitle="Budgets mensuels cumulés sur la période"
        >
          {report.budgetSummary.definedCount === 0 ? (
            <p className="muted small">
              Aucun budget défini pour cette période.{' '}
              <Link to="/budgets">Définir des budgets</Link>
            </p>
          ) : (
            <div className="stack">
              <div className="row-between">
                <span className="muted small">Budget prévu</span>
                <strong>{formatMoney(report.budgetSummary.totalBudget)}</strong>
              </div>
              <div className="row-between">
                <span className="muted small">Consommé</span>
                <strong>{formatMoney(report.budgetSummary.totalConsumed)}</strong>
              </div>
              <div className="row-between">
                <span className="muted small">Reste</span>
                <strong className={report.budgetSummary.totalRemaining < 0 ? 'text-expense' : ''}>
                  {formatMoney(report.budgetSummary.totalRemaining)}
                </strong>
              </div>
              <div className="row-between">
                <span className="muted small">Taux global</span>
                <strong>{formatPercent(report.budgetSummary.overallRate)}</strong>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Badge tone="danger">{report.budgetSummary.exceededCount} dépassé(s)</Badge>
                <Badge tone="warning">{report.budgetSummary.warningCount} en alerte</Badge>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="section grid-2">
        <CategoryReportCard
          title="Revenus par catégorie"
          subtitle="Part calculée sur le total des revenus"
          rows={report.incomeComparisons}
          total={report.summary.income}
          emptyLabel="Aucun revenu sur cette période."
          positiveIsGood
        />
        <CategoryReportCard
          title="Dépenses par catégorie"
          subtitle="Part calculée sur le total des dépenses"
          rows={report.expenseComparisons}
          total={report.summary.expense}
          emptyLabel="Aucune dépense sur cette période."
          positiveIsGood={false}
        />
      </div>

      {report.monthly.length > 1 && (
        <div className="section">
          <Card
            title="Détail mensuel"
            subtitle={`${report.monthly.length} mois — chaque ligne respecte les limites calendaires`}
            flush
          >
            <div className="table-wrap">
              <table className="data-table">
                <caption className="visually-hidden">
                  Revenus, dépenses et soldes mois par mois pour {period.label}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Mois</th>
                    <th scope="col" className="num">Revenus</th>
                    <th scope="col" className="num">Dépenses</th>
                    <th scope="col" className="num">Solde net</th>
                    <th scope="col" className="num">Opérations</th>
                  </tr>
                </thead>
                <tbody>
                  {report.monthly.map((month) => (
                    <tr key={month.period.key}>
                      <td className="cell-title">{month.label}</td>
                      <td className="num amount-income">
                        {formatMoney(month.income).replace(/\u00a0|\u202f/g, ' ')}
                      </td>
                      <td className="num amount-expense">
                        {formatMoney(month.expense).replace(/\u00a0|\u202f/g, ' ')}
                      </td>
                      <td className={`num ${month.net < 0 ? 'text-expense' : ''}`}>
                        {formatMoney(month.net).replace(/\u00a0|\u202f/g, ' ')}
                      </td>
                      <td className="num">{month.count}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="num">{formatMoney(report.summary.income)}</td>
                    <td className="num">{formatMoney(report.summary.expense)}</td>
                    <td className="num">{formatMoney(report.summary.net)}</td>
                    <td className="num">{report.summary.count}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </div>
      )}

      {budgetRows.length > 0 && (
        <div className="section">
          <Card
            title="Budgets prévus et réalisés"
            subtitle="Seuls les budgets définis et les catégories consommées sont affichés."
            flush
          >
            <div className="table-wrap">
              <table className="data-table">
                <caption className="visually-hidden">
                  Budgets prévus et réalisés pour {period.label}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Catégorie</th>
                    <th scope="col" className="num">Prévu</th>
                    <th scope="col" className="num">Consommé</th>
                    <th scope="col" className="num">Reste</th>
                    <th scope="col" className="num">Taux</th>
                    <th scope="col">État</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetRows.map((row) => (
                    <tr key={row.categoryId}>
                      <td>
                        <span className="cell-category">
                          <span className="category-dot" style={{ background: row.color }} />
                          {row.categoryName}
                        </span>
                      </td>
                      <td className="num">
                        {row.budgetAmount === null
                          ? '—'
                          : formatMoney(row.budgetAmount).replace(/\u00a0|\u202f/g, ' ')}
                      </td>
                      <td className="num">{formatMoney(row.consumed).replace(/\u00a0|\u202f/g, ' ')}</td>
                      <td className={`num ${row.remaining !== null && row.remaining < 0 ? 'text-expense' : ''}`}>
                        {row.remaining === null ? '—' : signed(row.remaining)}
                      </td>
                      <td className="num">{row.rate === null ? '—' : formatPercent(row.rate)}</td>
                      <td>
                        <Badge tone={budgetTone(row.state)}>{BUDGET_STATE_LABEL[row.state]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function CategoryReportCard({
  title,
  subtitle,
  rows,
  total,
  emptyLabel,
  positiveIsGood,
}: {
  title: string;
  subtitle: string;
  rows: CategoryComparison[];
  total: number;
  emptyLabel: string;
  positiveIsGood: boolean;
}) {
  if (total === 0 && rows.every((row) => row.previous === 0)) {
    return (
      <Card title={title} subtitle={subtitle}>
        <p className="muted small">{emptyLabel}</p>
      </Card>
    );
  }
  return (
    <Card title={title} subtitle={subtitle} flush>
      <div className="table-wrap">
        <table className="data-table">
          <caption className="visually-hidden">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Catégorie</th>
              <th scope="col" className="num">Montant</th>
              <th scope="col" className="num">Part</th>
              <th scope="col" className="num">Opérations</th>
              <th scope="col" className="num">Écart</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.categoryId}>
                <td>
                  <span className="cell-category">
                    <span className="category-dot" style={{ background: row.color }} />
                    {row.name}
                  </span>
                </td>
                <td className="num">{formatMoney(row.amount).replace(/\u00a0|\u202f/g, ' ')}</td>
                <td className="num">{formatPercent(row.share)}</td>
                <td className="num">{row.count}</td>
                <td
                  className={`num ${
                    row.delta === 0
                      ? ''
                      : (row.delta > 0) === positiveIsGood
                        ? 'text-income'
                        : 'text-expense'
                  }`}
                >
                  {row.delta === 0 ? '—' : signed(row.delta)}
                  {row.percentKind === 'new' && (
                    <div className="cell-sub">Nouvelle valeur</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="num">{formatMoney(total).replace(/\u00a0|\u202f/g, ' ')}</td>
              <td className="num">{total === 0 ? '—' : '100 %'}</td>
              <td className="num">{rows.reduce((sum, row) => sum + row.count, 0)}</td>
              <td className="num" />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
