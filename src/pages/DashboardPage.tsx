import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import type { Period, Transaction } from '../domain/types';
import {
  periodForDate,
  periodLengthInDays,
  todayISO,
} from '../domain/periods';
import {
  cumulativeSeries,
  monthlySeries,
  type MetricComparison,
} from '../domain/calculations';
import { buildPeriodReport } from '../domain/reports';
import { formatDisplayDate } from '../domain/format';
import { formatMoney, formatPercent } from '../domain/money';
import { isRuleDue } from '../domain/recurrence';
import { deleteTransaction } from '../data/repository';
import { PeriodPicker } from '../components/PeriodPicker';
import { BalanceAreaChart, ExpenseDonut, MiniBarList, MonthlyBarChart } from '../components/charts';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  InlineAlert,
  Money,
  PageHeader,
  StatCard,
} from '../components/ui';
import { Icon } from '../components/Icon';

export default function DashboardPage() {
  const {
    transactions,
    categories,
    budgets,
    settings,
    recurrences,
    openTransactionEditor,
    run,
  } = useApp();
  const [period, setPeriod] = useState<Period>(() => periodForDate(todayISO(), 'month'));
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  const report = useMemo(
    () => buildPeriodReport({ transactions, categories, budgets, settings, period }),
    [transactions, categories, budgets, settings, period],
  );
  const yearData = useMemo(
    () => monthlySeries(transactions, period.year),
    [transactions, period.year],
  );
  const cumulative = useMemo(
    () =>
      cumulativeSeries(
        transactions,
        settings.initialBalance,
        period,
        periodLengthInDays(period) > 62 ? 'month' : 'day',
      ),
    [transactions, settings.initialBalance, period],
  );
  const recent = useMemo(
    () =>
      [...transactions]
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
        )
        .slice(0, 7),
    [transactions],
  );

  const dueCount = recurrences.filter((rule) => isRuleDue(rule)).length;
  const budgetAlerts = report.budgetRows.filter(
    (row) => row.state === 'exceeded' || row.state === 'warning',
  );
  const exceededCount = budgetAlerts.filter((row) => row.state === 'exceeded').length;
  const warningCount = budgetAlerts.filter((row) => row.state === 'warning').length;

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await run(
      () => deleteTransaction(pendingDelete.id),
      'Opération supprimée. Les totaux ont été recalculés.',
    );
    setDeleting(false);
    if (result.ok) setPendingDelete(null);
  };

  if (transactions.length === 0) {
    return (
      <>
        <PageHeader
          title="Bienvenue dans votre budget"
          subtitle="Votre espace personnel, local et hors ligne. Commencez par enregistrer une première opération ou importez votre historique."
        />
        <Card>
          <EmptyState
            icon="wallet"
            title="Aucune opération pour le moment"
            description="Ajoutez un revenu ou une dépense pour voir apparaître votre solde, vos catégories et vos rapports. Aucun chiffre n’est inventé : les graphiques restent vides jusqu’à votre première saisie."
            actions={
              <>
                <Button variant="primary" icon="arrow-up-right" onClick={() => openTransactionEditor('expense')}>
                  Ajouter une dépense
                </Button>
                <Button icon="arrow-down-right" onClick={() => openTransactionEditor('income')}>
                  Ajouter un revenu
                </Button>
                <Link className="btn btn-secondary" to="/categories">
                  <Icon name="categories" size={16} /> Découvrir les catégories
                </Link>
                <Link className="btn btn-secondary" to="/donnees">
                  <Icon name="upload" size={16} /> Importer un fichier
                </Link>
              </>
            }
          />
        </Card>
        <div className="mt-3">
          <InlineAlert tone="info">
            Solde initial actuel : {formatMoney(settings.initialBalance)}. Vous pouvez le modifier dans
            les <Link to="/parametres">paramètres</Link>. Les données restent dans ce navigateur et ne
            sont jamais envoyées en ligne.
          </InlineAlert>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle="Vue d’ensemble de vos revenus, dépenses, budgets et de votre solde disponible."
        actions={
          <>
            <Button icon="arrow-down-right" onClick={() => openTransactionEditor('income')}>
              Revenu
            </Button>
            <Button variant="primary" icon="plus" onClick={() => openTransactionEditor('expense')}>
              Nouvelle opération
            </Button>
          </>
        }
      />

      <div className="row-between mb-3">
        <PeriodPicker period={period} onChange={setPeriod} />
        <span className="small muted">
          {formatDisplayDate(period.start, settings.dateFormat)} →{' '}
          {formatDisplayDate(period.end, settings.dateFormat)}
        </span>
      </div>

      {dueCount > 0 && (
        <div className="mb-2">
          <InlineAlert tone="warning">
            <strong>{dueCount}</strong> échéance{dueCount > 1 ? 's' : ''} de récurrence à traiter.{' '}
            <Link to="/recurrences">Ouvrir les récurrences</Link> — aucune opération n’est comptée
            avant sa matérialisation.
          </InlineAlert>
        </div>
      )}

      {budgetAlerts.length > 0 && (
        <div className="mb-2">
          <InlineAlert tone={exceededCount > 0 ? 'danger' : 'warning'}>
            {exceededCount > 0 && (
              <>
                <strong>{exceededCount} budget{exceededCount > 1 ? 's' : ''} dépassé{exceededCount > 1 ? 's' : ''}</strong>
                {warningCount > 0 ? ` et ${warningCount} en alerte` : ''} sur la période.{' '}
              </>
            )}
            {exceededCount === 0 && (
              <>
                <strong>{warningCount} budget{warningCount > 1 ? 's' : ''} en alerte</strong> sur la période.{' '}
              </>
            )}
            <Link to="/budgets">Voir les budgets</Link>
          </InlineAlert>
        </div>
      )}

      <div className="stat-grid stat-grid-6">
        <StatCard
          label="Solde disponible"
          value={<Money value={report.availableAtEnd} tone="auto" />}
          meta={`Cumulé au ${formatDisplayDate(period.end, settings.dateFormat)} · solde initial ${formatMoney(settings.initialBalance).replace(/\u00a0|\u202f/g, ' ')}`}
          tone="info"
          icon="wallet"
        />
        <StatCard
          label="Revenus"
          value={<span className="text-income">{formatMoney(report.summary.income).replace(/\u00a0|\u202f/g, ' ')}</span>}
          meta={<ComparisonMeta comparison={report.comparison.income} direction="income" label={report.previousPeriod.label} />}
          tone="income"
          icon="arrow-down-right"
        />
        <StatCard
          label="Dépenses"
          value={<span className="text-expense">{formatMoney(report.summary.expense).replace(/\u00a0|\u202f/g, ' ')}</span>}
          meta={<ComparisonMeta comparison={report.comparison.expense} direction="expense" label={report.previousPeriod.label} />}
          tone="expense"
          icon="arrow-up-right"
        />
        <StatCard
          label="Solde net"
          value={
            <span className={report.summary.net < 0 ? 'text-expense' : ''}>
              {formatMoney(report.summary.net).replace(/\u00a0|\u202f/g, ' ')}
            </span>
          }
          meta={<ComparisonMeta comparison={report.comparison.net} direction="income" label={report.previousPeriod.label} />}
          tone={report.summary.net < 0 ? 'expense' : 'default'}
          icon="scale"
        />
        <StatCard
          label="Opérations"
          value={report.summary.count}
          meta={`${report.summary.incomeCount} revenus · ${report.summary.expenseCount} dépenses`}
          icon="list"
        />
        <StatCard
          label="Budget consommé"
          value={
            report.budgetSummary.definedCount > 0 ? (
              <Money value={report.budgetSummary.totalConsumed} />
            ) : (
              <span className="muted">—</span>
            )
          }
          meta={
            report.budgetSummary.definedCount > 0
              ? `${formatPercent(report.budgetSummary.overallRate)} de ${formatMoney(report.budgetSummary.totalBudget).replace(/\u00a0|\u202f/g, ' ')} prévus`
              : 'Aucun budget défini sur la période'
          }
          tone={report.budgetSummary.exceededCount > 0 ? 'warning' : 'default'}
          icon="target"
        />
      </div>

      <div className="section chart-grid">
        <Card
          title="Revenus et dépenses par mois"
          subtitle={`Année ${period.year} — montants mensuels, hors soldes cumulés`}
        >
          <MonthlyBarChart
            data={yearData}
            ariaLabel={`Graphique des revenus et dépenses mensuels de l’année ${period.year}`}
            height={286}
          />
          <div className="chart-legend">
            <span className="chart-legend-item">
              <span className="category-dot" style={{ background: 'var(--income)' }} /> Revenus
            </span>
            <span className="chart-legend-item">
              <span className="category-dot" style={{ background: 'var(--expense)' }} /> Dépenses
            </span>
          </div>
        </Card>

        <Card
          title="Dépenses par catégorie"
          subtitle={`${period.label} · part calculée sur le total des dépenses`}
        >
          {report.summary.expense === 0 ? (
            <div className="chart-empty">Aucune dépense enregistrée sur cette période.</div>
          ) : (
            <ExpenseDonut
              rows={report.expenseCategories}
              total={report.summary.expense}
              ariaLabel={`Répartition des dépenses par catégorie pour ${period.label}`}
              height={228}
            />
          )}
        </Card>
      </div>

      <div className="section grid-2">
        <Card
          title="Évolution du solde cumulé"
          subtitle="Solde initial inclus, opérations classées par date réelle"
        >
          <BalanceAreaChart
            points={cumulative}
            ariaLabel={`Évolution du solde disponible cumulé pour ${period.label}`}
            height={248}
          />
          <p className="hint mt-1">
            Solde au {formatDisplayDate(period.end, settings.dateFormat)} :{' '}
            {formatMoney(report.availableAtEnd)}. Cette courbe est distincte du solde net de la
            période.
          </p>
        </Card>

        <Card
          title="Principales catégories de dépenses"
          subtitle={period.label}
          actions={<Link className="link-button" to="/rapports">Rapport détaillé</Link>}
        >
          <MiniBarList rows={report.expenseCategories} />
        </Card>
      </div>

      <div className="section">
        <Card
          title="Activité récente"
          subtitle="Les sept dernières opérations, toutes périodes confondues"
          actions={<Link className="link-button" to="/operations">Toutes les opérations</Link>}
          flush
        >
          {recent.length === 0 ? (
            <div className="table-empty">Aucune opération enregistrée.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <caption className="visually-hidden">
                  Opérations récentes avec date, libellé, catégorie et montant
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Libellé</th>
                    <th scope="col">Catégorie</th>
                    <th scope="col">Type</th>
                    <th scope="col" className="num">Montant</th>
                    <th scope="col"><span className="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((transaction) => {
                    const category = categories.find(
                      (item) => item.id === transaction.categoryId,
                    );
                    return (
                      <tr key={transaction.id}>
                        <td className="num" style={{ textAlign: 'left' }}>
                          {formatDisplayDate(transaction.date, settings.dateFormat)}
                        </td>
                        <td>
                          <div className="cell-title">{transaction.label}</div>
                          {transaction.note && <div className="cell-sub">{transaction.note}</div>}
                        </td>
                        <td>
                          <span className="cell-category">
                            <span
                              className="category-dot"
                              style={{ background: category?.color ?? 'var(--muted)' }}
                            />
                            {category?.name ?? 'Catégorie supprimée'}
                          </span>
                        </td>
                        <td>
                          {transaction.type === 'income' ? (
                            <Badge tone="income">Revenu</Badge>
                          ) : (
                            <Badge tone="expense">Dépense</Badge>
                          )}
                        </td>
                        <td className={`num ${transaction.type === 'income' ? 'amount-income' : 'amount-expense'}`}>
                          {transaction.type === 'income' ? '+' : '\u2212'}
                          {formatMoney(transaction.amount).replace(/\u00a0|\u202f/g, ' ')}
                        </td>
                        <td>
                          <div className="row-actions">
                            <IconButton
                              icon="edit"
                              label={`Modifier ${transaction.label}`}
                              onClick={() => openTransactionEditor(transaction.type, transaction)}
                            />
                            <IconButton
                              icon="trash"
                              label={`Supprimer ${transaction.label}`}
                              onClick={() => setPendingDelete(transaction)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Supprimer cette opération ?"
        description={
          pendingDelete ? (
            <>
              <strong>{pendingDelete.label}</strong> —{' '}
              {formatMoney(pendingDelete.amount)} du{' '}
              {formatDisplayDate(pendingDelete.date, settings.dateFormat)}. Cette action est
              définitive et recalculera les totaux, budgets et rapports.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Supprimer"
        danger
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}

function ComparisonMeta({
  comparison,
  direction,
  label,
}: {
  comparison: MetricComparison;
  direction: 'income' | 'expense';
  label: string;
}) {
  if (comparison.percentKind === 'percent' && comparison.percent !== null) {
    const favorable =
      direction === 'expense' ? comparison.delta <= 0 : comparison.delta >= 0;
    const sign = comparison.delta > 0 ? '+' : '';
    return (
      <span className={favorable ? 'up' : 'down'}>
        <Icon name={comparison.delta >= 0 ? 'arrow-up-right' : 'arrow-down-right'} size={12} />{' '}
        {sign}
        {formatPercent(comparison.percent)} vs {label}
      </span>
    );
  }
  const text =
    comparison.percentKind === 'new'
      ? 'Nouvelle valeur'
      : comparison.percentKind === 'zero'
        ? 'Passage à zéro'
        : 'Non calculable';
  return <span>{text} vs {label}</span>;
}

