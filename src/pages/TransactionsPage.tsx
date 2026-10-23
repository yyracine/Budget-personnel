import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import type { Transaction, TransactionFilter, TransactionType } from '../domain/types';
import {
  applyTransactionFilter,
  hasActiveFilters,
  type TransactionSort,
} from '../domain/filters';
import { summarizeTransactions } from '../domain/calculations';
import { formatDisplayDate } from '../domain/format';
import { formatMoney, parseAmount } from '../domain/money';
import { endOfMonth, startOfMonth, todayISO } from '../domain/periods';
import { deleteTransaction } from '../data/repository';
import { buildTransactionsSheet, downloadWorkbook, operationsFileName } from '../exports/excel';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Money,
  PageHeader,
} from '../components/ui';
import { Icon } from '../components/Icon';

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Saisie manuelle',
  CSV: 'Import CSV',
  Excel: 'Import Excel',
  recurrence: 'Récurrence',
  import: 'Import',
};

const PAGE_SIZE = 25;

function parseBound(value: string): number | undefined | 'invalid' {
  const text = value.trim();
  if (!text) return undefined;
  if (text === '0') return 0;
  const parsed = parseAmount(text);
  return parsed.ok ? parsed.amount : 'invalid';
}

export default function TransactionsPage({ lockedType }: { lockedType?: TransactionType }) {
  const {
    transactions,
    categories,
    settings,
    openTransactionEditor,
    run,
    notify,
  } = useApp();
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>(lockedType ?? 'all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sort, setSort] = useState<TransactionSort>('date-desc');
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const effectiveType = lockedType ?? typeFilter;
  const minAmount = parseBound(minText);
  const maxAmount = parseBound(maxText);
  const rangeError =
    startDate && endDate && startDate > endDate
      ? 'La date de début doit précéder la date de fin.'
      : null;
  const amountError =
    minAmount === 'invalid' || maxAmount === 'invalid'
      ? 'Les bornes de montant doivent être des entiers positifs.'
      : minAmount !== undefined && maxAmount !== undefined && minAmount > maxAmount
        ? 'Le montant minimum dépasse le montant maximum.'
        : null;

  const filter = useMemo<TransactionFilter>(() => {
    const next: TransactionFilter = {
      type: effectiveType,
      categoryId: categoryFilter,
      source: sourceFilter,
      keyword,
    };
    if (minAmount !== undefined && minAmount !== 'invalid') next.minAmount = minAmount;
    if (maxAmount !== undefined && maxAmount !== 'invalid') next.maxAmount = maxAmount;
    if (!rangeError && (startDate || endDate)) {
      next.range = {
        start: startDate || '0000-01-01',
        end: endDate || '9999-12-31',
      };
    }
    return next;
  }, [
    effectiveType,
    categoryFilter,
    sourceFilter,
    keyword,
    minAmount,
    maxAmount,
    startDate,
    endDate,
    rangeError,
  ]);

  const filtered = useMemo(
    () => applyTransactionFilter(transactions, filter, sort),
    [transactions, filter, sort],
  );
  const totals = useMemo(() => summarizeTransactions(filtered), [filtered]);
  const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, maxPage);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const categoryOptions = useMemo(
    () =>
      categories
        .filter((category) => effectiveType === 'all' || category.type === effectiveType)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [categories, effectiveType],
  );

  const sources = useMemo(
    () => Array.from(new Set(transactions.map((transaction) => transaction.source))).sort(),
    [transactions],
  );

  const resetFilters = () => {
    setTypeFilter(lockedType ?? 'all');
    setCategoryFilter('all');
    setSourceFilter('all');
    setKeyword('');
    setMinText('');
    setMaxText('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const applyMonthPreset = () => {
    const today = todayISO();
    setStartDate(startOfMonth(today));
    setEndDate(endOfMonth(today));
    setPage(1);
  };

  const applyYearPreset = () => {
    const year = todayISO().slice(0, 4);
    setStartDate(`${year}-01-01`);
    setEndDate(`${year}-12-31`);
    setPage(1);
  };

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

  const handleExport = async () => {
    setExporting(true);
    try {
      const label =
        startDate || endDate
          ? `${startDate ? formatDisplayDate(startDate, settings.dateFormat) : 'début'} → ${endDate ? formatDisplayDate(endDate, settings.dateFormat) : 'aujourd’hui'}`
          : 'Toutes les dates';
      const sheets = [
        buildTransactionsSheet(
          filtered,
          categories,
          settings,
          lockedType === 'income'
            ? 'Revenus filtrés'
            : lockedType === 'expense'
              ? 'Dépenses filtrées'
              : 'Opérations filtrées',
          `${label} · ${filtered.length} opération(s)`,
        ),
      ];
      await downloadWorkbook(sheets, operationsFileName());
      notify('Export Excel généré.', 'success');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Impossible de générer l’export Excel.',
        'error',
      );
    } finally {
      setExporting(false);
    }
  };

  const title =
    lockedType === 'income' ? 'Revenus' : lockedType === 'expense' ? 'Dépenses' : 'Opérations';
  const subtitle =
    lockedType === 'income'
      ? 'Tous vos revenus, avec recherche, filtres et export.'
      : lockedType === 'expense'
        ? 'Toutes vos dépenses, avec recherche, filtres et export.'
        : 'Registre complet de vos revenus et dépenses. Les filtres se combinent.';

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {(!lockedType || lockedType === 'income') && (
              <Button icon="arrow-down-right" onClick={() => openTransactionEditor('income')}>
                Revenu
              </Button>
            )}
            {(!lockedType || lockedType === 'expense') && (
              <Button
                variant="primary"
                icon="arrow-up-right"
                onClick={() => openTransactionEditor('expense')}
              >
                Dépense
              </Button>
            )}
          </>
        }
      />

      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
        }}
        aria-label="Filtres des opérations"
      >
        <Field label="Recherche" htmlFor="filter-keyword" className="wide">
          <input
            id="filter-keyword"
            className="input"
            type="search"
            placeholder="Libellé ou note…"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
          />
        </Field>
        {!lockedType && (
          <div className="field">
            <label className="label" htmlFor="filter-type">
              Type
            </label>
            <select
              id="filter-type"
              className="select"
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value as TransactionType | 'all');
                setCategoryFilter('all');
                setPage(1);
              }}
            >
              <option value="all">Tous</option>
              <option value="income">Revenus</option>
              <option value="expense">Dépenses</option>
            </select>
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor="filter-category">
            Catégorie
          </label>
          <select
            id="filter-category"
            className="select"
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">Toutes</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.isActive ? '' : ' (désactivée)'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="filter-source">
            Source
          </label>
          <select
            id="filter-source"
            className="select"
            value={sourceFilter}
            onChange={(event) => {
              setSourceFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">Toutes</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABELS[source] ?? source}
              </option>
            ))}
          </select>
        </div>
        <Field label="Du" htmlFor="filter-start">
          <input
            id="filter-start"
            type="date"
            className="input"
            value={startDate}
            onChange={(event) => {
              setStartDate(event.target.value);
              setPage(1);
            }}
            aria-invalid={Boolean(rangeError)}
          />
        </Field>
        <Field label="Au" htmlFor="filter-end" error={rangeError ?? undefined}>
          <input
            id="filter-end"
            type="date"
            className="input"
            value={endDate}
            onChange={(event) => {
              setEndDate(event.target.value);
              setPage(1);
            }}
            aria-invalid={Boolean(rangeError)}
          />
        </Field>
        <Field label="Montant min." htmlFor="filter-min" className="narrow" error={amountError ?? undefined}>
          <input
            id="filter-min"
            className="input"
            inputMode="numeric"
            placeholder="0"
            value={minText}
            onChange={(event) => {
              setMinText(event.target.value);
              setPage(1);
            }}
            aria-invalid={amountError !== null}
          />
        </Field>
        <Field label="Montant max." htmlFor="filter-max" className="narrow">
          <input
            id="filter-max"
            className="input"
            inputMode="numeric"
            placeholder="—"
            value={maxText}
            onChange={(event) => {
              setMaxText(event.target.value);
              setPage(1);
            }}
            aria-invalid={amountError !== null}
          />
        </Field>
        <div className="filters-actions">
          <Button size="sm" onClick={applyMonthPreset}>
            Ce mois
          </Button>
          <Button size="sm" onClick={applyYearPreset}>
            Cette année
          </Button>
          <Button size="sm" variant="ghost" onClick={resetFilters} icon="x">
            Réinitialiser
          </Button>
        </div>
      </form>

      <Card
        title={`${filtered.length} opération${filtered.length > 1 ? 's' : ''}`}
        subtitle={
          hasActiveFilters(filter)
            ? 'Résultats filtrés — les totaux ci-dessous portent uniquement sur ces lignes.'
            : 'Toutes les opérations enregistrées.'
        }
        actions={
          <Button
            size="sm"
            icon="file-spreadsheet"
            onClick={handleExport}
            disabled={exporting || filtered.length === 0}
          >
            {exporting ? 'Export…' : 'Exporter en Excel'}
          </Button>
        }
        flush
      >
        <div
          className="row"
          style={{
            padding: '12px 20px',
            gap: 18,
            borderBottom: '1px solid var(--border)',
            fontSize: 12.5,
          }}
        >
          <span>
            Revenus : <strong className="text-income">{formatMoney(totals.income).replace(/\u00a0|\u202f/g, ' ')}</strong>
          </span>
          <span>
            Dépenses : <strong className="text-expense">{formatMoney(totals.expense).replace(/\u00a0|\u202f/g, ' ')}</strong>
          </span>
          <span>
            Solde : <Money value={totals.net} signed />
          </span>
          {rangeError && <span className="text-danger">{rangeError}</span>}
          {amountError && <span className="text-danger">{amountError}</span>}
        </div>

        {transactions.length === 0 ? (
          <EmptyState
            icon="list"
            title="Aucune opération enregistrée"
            description="Ajoutez votre premier revenu ou votre première dépense pour démarrer votre historique."
            actions={
              <>
                <Button variant="primary" icon="plus" onClick={() => openTransactionEditor('expense')}>
                  Ajouter une opération
                </Button>
              </>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="search"
            title="Aucun résultat"
            description="Aucune opération ne correspond aux filtres actuels. Modifiez les critères ou réinitialisez-les."
            actions={<Button onClick={resetFilters}>Réinitialiser les filtres</Button>}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <caption className="visually-hidden">
                  Liste des opérations filtrées, triables par date, libellé et montant
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="sortable">
                      <button
                        type="button"
                        onClick={() => setSort(sort === 'date-desc' ? 'date-asc' : 'date-desc')}
                        aria-label="Trier par date"
                      >
                        Date
                        {sort.startsWith('date') && (
                          <Icon name={sort === 'date-desc' ? 'arrow-down' : 'arrow-up'} size={12} />
                        )}
                      </button>
                    </th>
                    <th scope="col" className="sortable">
                      <button type="button" onClick={() => setSort('label-asc')} aria-label="Trier par libellé">
                        Libellé
                        {sort === 'label-asc' && <Icon name="arrow-up" size={12} />}
                      </button>
                    </th>
                    <th scope="col">Catégorie</th>
                    {!lockedType && <th scope="col">Type</th>}
                    <th scope="col" className="sortable" style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        style={{ justifyContent: 'flex-end' }}
                        onClick={() => setSort(sort === 'amount-desc' ? 'amount-asc' : 'amount-desc')}
                        aria-label="Trier par montant"
                      >
                        Montant
                        {sort.startsWith('amount') && (
                          <Icon name={sort === 'amount-desc' ? 'arrow-down' : 'arrow-up'} size={12} />
                        )}
                      </button>
                    </th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((transaction) => {
                    const category = categories.find((item) => item.id === transaction.categoryId);
                    return (
                      <tr key={transaction.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {formatDisplayDate(transaction.date, settings.dateFormat)}
                        </td>
                        <td>
                          <div className="cell-title">{transaction.label}</div>
                          <div className="cell-sub">
                            {SOURCE_LABELS[transaction.source] ?? transaction.source}
                            {transaction.note ? ` · ${transaction.note}` : ''}
                          </div>
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
                        {!lockedType && (
                          <td>
                            {transaction.type === 'income' ? (
                              <Badge tone="income">Revenu</Badge>
                            ) : (
                              <Badge tone="expense">Dépense</Badge>
                            )}
                          </td>
                        )}
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
            <div
              className="row-between"
              style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}
            >
              <span className="small muted">
                {filtered.length === 0
                  ? '0 résultat'
                  : `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filtered.length)} sur ${filtered.length}`}
              </span>
              <div className="row" style={{ gap: 6 }}>
                <Button
                  size="sm"
                  onClick={() => setPage(safePage - 1)}
                  disabled={safePage <= 1}
                  icon="chevron-left"
                >
                  Précédent
                </Button>
                <span className="small muted">
                  Page {safePage} / {maxPage}
                </span>
                <Button
                  size="sm"
                  onClick={() => setPage(safePage + 1)}
                  disabled={safePage >= maxPage}
                >
                  Suivant
                  <Icon name="chevron-right" size={14} />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {hasActiveFilters(filter) && filtered.length > 0 && (
        <p className="hint mt-2">
          Les totaux affichés correspondent exactement aux {filtered.length} opérations filtrées,
          pas à l’ensemble de l’historique.
        </p>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Supprimer cette opération ?"
        description={
          pendingDelete ? (
            <>
              <strong>{pendingDelete.label}</strong> — {formatMoney(pendingDelete.amount)} du{' '}
              {formatDisplayDate(pendingDelete.date, settings.dateFormat)}. La suppression est
              définitive et recalcule immédiatement les totaux, budgets et rapports.
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
