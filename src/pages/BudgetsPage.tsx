import { useMemo, useState, type FormEvent } from 'react';
import { useApp } from '../state/AppContext';
import type { Budget, Period } from '../domain/types';
import {
  DEFAULT_ALERT_THRESHOLD,
  buildBudgetRowsForRange,
  summarizeBudgets,
  type BudgetRow,
  type BudgetState,
} from '../domain/budgets';
import { monthRange, periodForDate, todayISO } from '../domain/periods';
import { formatDisplayDate } from '../domain/format';
import { AMOUNT_ERROR_MESSAGES, formatMoney, formatPercent, parseAmount } from '../domain/money';
import { deleteBudget, upsertBudget } from '../data/repository';
import { PeriodPicker } from '../components/PeriodPicker';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  InlineAlert,
  Modal,
  Money,
  PageHeader,
  ProgressBar,
  StatCard,
} from '../components/ui';

const STATE_LABEL: Record<BudgetState, string> = {
  normal: 'Normal',
  warning: 'Alerte',
  exceeded: 'Dépassé',
  'no-budget': 'Non défini',
  'zero-budget': 'Budget nul',
};

function stateTone(state: BudgetState): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  switch (state) {
    case 'normal':
      return 'success';
    case 'warning':
      return 'warning';
    case 'exceeded':
      return 'danger';
    case 'zero-budget':
      return 'info';
    default:
      return 'neutral';
  }
}

export default function BudgetsPage() {
  const { budgets, transactions, categories, settings, run } = useApp();
  const [period, setPeriod] = useState<Period>(() => periodForDate(todayISO(), 'month'));
  const [editing, setEditing] = useState<{ budget?: Budget; categoryId?: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Budget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const monthStart = period.start;
  const rows = useMemo(
    () =>
      buildBudgetRowsForRange(
        budgets,
        transactions,
        categories,
        monthRange(period.year, period.index ?? 1),
      ),
    [budgets, transactions, categories, period],
  );
  const summary = useMemo(() => summarizeBudgets(rows), [rows]);
  const exceeded = rows.filter((row) => row.state === 'exceeded');
  const warning = rows.filter((row) => row.state === 'warning');
  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === 'expense' && category.isActive),
    [categories],
  );

  const openCreate = (categoryId?: string) => {
    setEditing({ categoryId });
  };

  const deleteRow = rows.find((row) => row.budgetId === pendingDelete?.id);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await run(() => deleteBudget(pendingDelete.id), 'Budget supprimé.');
    setDeleting(false);
    if (result.ok) setPendingDelete(null);
  };

  return (
    <>
      <PageHeader
        title="Budgets mensuels"
        subtitle="Définissez un montant prévisionnel par catégorie de dépense et suivez la consommation réelle du mois, sans report d’un mois sur l’autre."
        actions={
          <Button
            variant="primary"
            icon="plus"
            onClick={() => {
              const withoutBudget = expenseCategories.find(
                (category) =>
                  !rows.some(
                    (row) => row.categoryId === category.id && row.budgetAmount !== null,
                  ),
              );
              openCreate(withoutBudget?.id);
            }}
            disabled={expenseCategories.length === 0}
          >
            Définir un budget
          </Button>
        }
      />

      <div className="row-between mb-3">
        <PeriodPicker period={period} onChange={setPeriod} showType={false} ariaLabel="Mois du budget" />
        <span className="small muted">
          {formatDisplayDate(period.start, settings.dateFormat)} →{' '}
          {formatDisplayDate(period.end, settings.dateFormat)}
        </span>
      </div>

      {(exceeded.length > 0 || warning.length > 0) && (
        <div className="mb-3">
          <InlineAlert tone={exceeded.length > 0 ? 'danger' : 'warning'}>
            {exceeded.length > 0 ? (
              <>
                <strong>{exceeded.length} budget{exceeded.length > 1 ? 's' : ''} dépassé{exceeded.length > 1 ? 's' : ''}</strong>
                {warning.length > 0 ? ` · ${warning.length} en alerte` : ''}.{' '}
                {exceeded.map((row) => row.categoryName).join(', ')}.
              </>
            ) : (
              <>
                <strong>{warning.length} budget{warning.length > 1 ? 's' : ''} en alerte</strong> :{' '}
                {warning.map((row) => row.categoryName).join(', ')}.
              </>
            )}
          </InlineAlert>
        </div>
      )}

      <div className="stat-grid">
        <StatCard
          label="Budget prévu"
          value={<Money value={summary.totalBudget} />}
          meta={`${summary.definedCount} budget${summary.definedCount > 1 ? 's' : ''} défini${summary.definedCount > 1 ? 's' : ''}`}
          icon="target"
        />
        <StatCard
          label="Consommé"
          value={<Money value={summary.totalConsumed} />}
          meta={
            summary.overallRate === null
              ? 'Aucun budget défini'
              : `${formatPercent(summary.overallRate)} du budget prévu`
          }
          tone="income"
          icon="arrow-up-right"
        />
        <StatCard
          label="Reste à dépenser"
          value={<Money value={summary.totalRemaining} tone={summary.totalRemaining < 0 ? 'expense' : 'neutral'} />}
          meta={summary.totalRemaining < 0 ? 'Dépassement global' : 'Sur les budgets définis'}
          tone={summary.totalRemaining < 0 ? 'expense' : 'default'}
          icon="wallet"
        />
        <StatCard
          label="Alertes"
          value={exceeded.length + warning.length}
          meta={`${exceeded.length} dépassé(s) · ${warning.length} alerte(s)`}
          tone={exceeded.length > 0 ? 'warning' : 'default'}
          icon="alert"
        />
      </div>

      <div className="section">
        <Card
          title={`Suivi des budgets — ${period.label}`}
          subtitle="Les dépenses prises en compte sont uniquement celles datées dans ce mois."
          flush
        >
          {rows.length === 0 ? (
            <EmptyState
              icon="target"
              title="Aucune catégorie de dépense active"
              description="Créez une catégorie de dépenses avant de définir un budget."
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <caption className="visually-hidden">
                  Budgets par catégorie pour {period.label}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Catégorie</th>
                    <th scope="col" className="num">Budget</th>
                    <th scope="col" className="num">Consommé</th>
                    <th scope="col" className="num">Reste</th>
                    <th scope="col" style={{ minWidth: 180 }}>Consommation</th>
                    <th scope="col">État</th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <BudgetTableRow
                      key={row.categoryId}
                      row={row}
                      onEdit={() => {
                        const budget = budgets.find((item) => item.id === row.budgetId);
                        if (budget) setEditing({ budget, categoryId: row.categoryId });
                      }}
                      onDefine={() => openCreate(row.categoryId)}
                      onDelete={() => {
                        const budget = budgets.find((item) => item.id === row.budgetId);
                        if (budget) setPendingDelete(budget);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <p className="hint mt-2">
        Le seuil d’alerte est configurable pour chaque budget (80 % par défaut). Un budget nul
        n’affiche jamais de pourcentage : l’état « budget nul » est signalé explicitement.
      </p>

      {editing && (
        <BudgetFormModal
          key={editing.budget?.id ?? `new-${editing.categoryId ?? 'none'}-${monthStart}`}
          budget={editing.budget}
          monthStart={monthStart}
          initialCategoryId={editing.categoryId}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Supprimer ce budget ?"
        description={
          pendingDelete ? (
            <>
              Budget de <strong>{deleteRow?.categoryName ?? 'cette catégorie'}</strong> pour{' '}
              {formatDisplayDate(pendingDelete.periodStart, settings.dateFormat)}. Les dépenses
              restent enregistrées ; seul le montant prévisionnel est supprimé.
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

function BudgetTableRow({
  row,
  onEdit,
  onDefine,
  onDelete,
}: {
  row: BudgetRow;
  onEdit: () => void;
  onDefine: () => void;
  onDelete: () => void;
}) {
  const isDefined = row.budgetAmount !== null;
  return (
    <tr>
      <td>
        <span className="cell-category">
          <span className="category-dot" style={{ background: row.color }} />
          <span>
            <span className="cell-title">{row.categoryName}</span>
            <span className="cell-sub" style={{ display: 'block' }}>
              Seuil d’alerte : {formatPercent(row.alertThreshold)}
            </span>
          </span>
        </span>
      </td>
      <td className="num">{isDefined ? formatMoney(row.budgetAmount ?? 0).replace(/\u00a0|\u202f/g, ' ') : '—'}</td>
      <td className="num">{formatMoney(row.consumed).replace(/\u00a0|\u202f/g, ' ')}</td>
      <td className={`num ${row.remaining !== null && row.remaining < 0 ? 'amount-expense' : ''}`}>
        {row.remaining === null ? '—' : formatMoney(row.remaining).replace(/\u00a0|\u202f/g, ' ')}
      </td>
      <td>
        {row.rate === null ? (
          <span className="small muted">Non applicable</span>
        ) : (
          <div className="stack-sm">
            <ProgressBar
              value={row.rate}
              state={
                row.state === 'exceeded'
                  ? 'exceeded'
                  : row.state === 'warning'
                    ? 'warning'
                    : 'normal'
              }
              label={`Consommation de ${row.categoryName} : ${formatPercent(row.rate)}`}
            />
            <div className="budget-line">
              <span>{formatPercent(row.rate)}</span>
              <span>{row.state === 'exceeded' ? 'Dépassé' : 'du budget'}</span>
            </div>
          </div>
        )}
      </td>
      <td>
        <Badge tone={stateTone(row.state)}>{STATE_LABEL[row.state]}</Badge>
      </td>
      <td>
        <div className="row-actions">
          {isDefined ? (
            <>
              <IconButton icon="edit" label={`Modifier le budget ${row.categoryName}`} onClick={onEdit} />
              <IconButton
                icon="trash"
                label={`Supprimer le budget ${row.categoryName}`}
                variant="danger"
                onClick={onDelete}
              />
            </>
          ) : (
            <Button size="sm" icon="plus" onClick={onDefine}>
              Définir
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function BudgetFormModal({
  budget,
  monthStart,
  initialCategoryId,
  onClose,
}: {
  budget?: Budget;
  monthStart: string;
  initialCategoryId?: string;
  onClose: () => void;
}) {
  const { categories, budgets, run, settings } = useApp();
  const [categoryId, setCategoryId] = useState(
    budget?.categoryId ?? initialCategoryId ?? '',
  );
  const [amountText, setAmountText] = useState(budget ? String(budget.amount) : '');
  const [threshold, setThreshold] = useState(
    String(budget?.alertThreshold ?? DEFAULT_ALERT_THRESHOLD),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const conflict = budgets.find(
    (item) =>
      item.categoryId === categoryId &&
      item.periodStart === monthStart &&
      item.id !== budget?.id,
  );

  const options = categories
    .filter(
      (category) =>
        category.type === 'expense' &&
        (category.isActive || category.id === budget?.categoryId),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    const nextErrors: Record<string, string> = {};
    if (!categoryId) nextErrors.categoryId = 'Sélectionnez une catégorie de dépense.';
    const parsed = parseAmount(amountText);
    if (!parsed.ok) nextErrors.amount = AMOUNT_ERROR_MESSAGES[parsed.code];
    const thresholdValue = Number(threshold);
    if (!Number.isFinite(thresholdValue) || thresholdValue <= 0 || thresholdValue > 100) {
      nextErrors.alertThreshold = 'Le seuil doit être compris entre 1 et 100 %.';
    }
    if (conflict) {
      nextErrors.categoryId = 'Un budget existe déjà pour cette catégorie et ce mois.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !parsed.ok) return;

    setBusy(true);
    const result = await run(
      () =>
        upsertBudget({
          id: budget?.id,
          categoryId,
          periodStart: monthStart,
          amount: parsed.amount,
          alertThreshold: Math.round(thresholdValue),
        }),
      budget ? 'Budget modifié.' : 'Budget enregistré.',
    );
    setBusy(false);
    if (result.ok) onClose();
    else setFormError(result.error);
  };

  return (
    <Modal
      open
      title={budget ? 'Modifier le budget' : 'Définir un budget'}
      subtitle={`Mois du ${formatDisplayDate(monthStart, settings.dateFormat)} · les dépenses du mois sont comparées en temps réel.`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="budget-form"
            disabled={busy}
          >
            {busy ? 'Enregistrement…' : 'Enregistrer le budget'}
          </Button>
        </>
      }
    >
      <form id="budget-form" onSubmit={handleSubmit} className="stack" noValidate>
      <Field label="Catégorie de dépense" htmlFor="budget-category" error={errors.categoryId} required>
        <select
          id="budget-category"
          className="select"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          aria-invalid={Boolean(errors.categoryId)}
        >
          <option value="">Sélectionner…</option>
          {options.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
              {category.isActive ? '' : ' (désactivée)'}
            </option>
          ))}
        </select>
      </Field>

      <div className="form-grid">
        <Field label="Montant prévu" htmlFor="budget-amount" error={errors.amount} required>
          <div className="input-money">
            <input
              id="budget-amount"
              className="input"
              inputMode="numeric"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              placeholder="100 000"
              aria-invalid={Boolean(errors.amount)}
              required
            />
            <span className="suffix">FCFA</span>
          </div>
        </Field>
        <Field
          label="Seuil d’alerte (%)"
          htmlFor="budget-threshold"
          error={errors.alertThreshold}
          hint="Alerte dès ce pourcentage consommé."
          required
        >
          <input
            id="budget-threshold"
            className="input"
            type="number"
            min={1}
            max={100}
            step={1}
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            aria-invalid={Boolean(errors.alertThreshold)}
            required
          />
        </Field>
      </div>

      {conflict && (
        <InlineAlert tone="warning">
          Un budget existe déjà pour cette catégorie sur ce mois. Modifiez le budget existant
          depuis la liste plutôt que d’en créer un second.
        </InlineAlert>
      )}
      {formError && <div className="form-error">{formError}</div>}
      </form>
    </Modal>
  );
}
