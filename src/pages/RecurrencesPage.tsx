import { useMemo, useState, type FormEvent } from 'react';
import { useApp } from '../state/AppContext';
import type { RecurrenceRule, TransactionType } from '../domain/types';
import {
  FREQUENCY_LABELS,
  RULE_STATUS_LABELS,
  isRuleDue,
  ruleStatus,
  upcomingOccurrences,
  type RuleStatus,
} from '../domain/recurrence';
import { todayISO } from '../domain/periods';
import { formatDisplayDate } from '../domain/format';
import { AMOUNT_ERROR_MESSAGES, formatMoney, parseAmount } from '../domain/money';
import { validateRecurrenceInput } from '../domain/validation';
import {
  createRecurrence,
  deleteRecurrence,
  materializeRecurrence,
  setRecurrenceActive,
  updateRecurrence,
} from '../data/repository';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  InlineAlert,
  Modal,
  PageHeader,
  SegmentedControl,
} from '../components/ui';
import { Icon, isIconName } from '../components/Icon';

const STATUS_TONE: Record<RuleStatus, 'warning' | 'danger' | 'success' | 'neutral' | 'info'> = {
  suspended: 'neutral',
  finished: 'info',
  late: 'danger',
  due: 'warning',
  upcoming: 'success',
};

const STATUS_ORDER: Record<RuleStatus, number> = {
  late: 0,
  due: 1,
  upcoming: 2,
  suspended: 3,
  finished: 4,
};

export default function RecurrencesPage() {
  const { recurrences, categories, settings, run } = useApp();
  const [editor, setEditor] = useState<{ rule?: RecurrenceRule } | null>(null);
  const [pendingMaterialize, setPendingMaterialize] = useState<RecurrenceRule | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RecurrenceRule | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(
    () =>
      [...recurrences].sort((a, b) => {
        const rank = STATUS_ORDER[ruleStatus(a)] - STATUS_ORDER[ruleStatus(b)];
        if (rank !== 0) return rank;
        return a.nextOccurrence.localeCompare(b.nextOccurrence);
      }),
    [recurrences],
  );
  const due = recurrences.filter((rule) => isRuleDue(rule));
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const materialize = async () => {
    if (!pendingMaterialize) return;
    setBusy(true);
    const result = await run(
      () => materializeRecurrence(pendingMaterialize.id),
      'Échéance matérialisée : une opération a été créée.',
    );
    setBusy(false);
    if (result.ok) setPendingMaterialize(null);
  };

  const toggle = async (rule: RecurrenceRule) => {
    setBusy(true);
    await run(
      () => setRecurrenceActive(rule.id, !rule.isActive),
      rule.isActive
        ? 'Récurrence suspendue. Aucune occurrence ne sera proposée.'
        : 'Récurrence réactivée.',
    );
    setBusy(false);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    const result = await run(
      () => deleteRecurrence(pendingDelete.id),
      'Règle supprimée. Les opérations déjà matérialisées sont conservées.',
    );
    setBusy(false);
    if (result.ok) setPendingDelete(null);
  };

  const materializeCategory = pendingMaterialize
    ? categoryById.get(pendingMaterialize.categoryId)
    : undefined;

  return (
    <>
      <PageHeader
        title="Opérations récurrentes"
        subtitle="Programmez un salaire, un loyer ou un abonnement. Une échéance n’est comptée qu’après sa matérialisation en opération réelle."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditor({})}>
            Nouvelle récurrence
          </Button>
        }
      />

      <div className="mb-3">
        <InlineAlert tone="info">
          Les échéances prévues ne participent ni aux soldes, ni aux budgets, ni aux rapports
          avant matérialisation. Chaque échéance ne peut être créée qu’une seule fois.
        </InlineAlert>
      </div>

      {due.length > 0 && (
        <div className="mb-3">
          <InlineAlert tone="warning">
            <strong>
              {due.length} échéance{due.length > 1 ? 's' : ''} à traiter
            </strong>{' '}
            : vérifiez le montant et la date avant de créer l’opération correspondante.
          </InlineAlert>
        </div>
      )}

      {recurrences.length === 0 ? (
        <EmptyState
          icon="repeat"
          title="Aucune récurrence"
          description="Créez une règle pour vos revenus ou dépenses réguliers. L’application ne crée jamais d’opération future automatiquement."
          actions={
            <Button variant="primary" icon="plus" onClick={() => setEditor({})}>
              Créer une récurrence
            </Button>
          }
        />
      ) : (
        <div className="recurrence-list">
          {sorted.map((rule) => {
            const category = categoryById.get(rule.categoryId);
            const status = ruleStatus(rule);
            const upcoming = upcomingOccurrences(rule, 3);
            const rawIcon = category?.icon ?? '';
            const categoryIcon = isIconName(rawIcon) ? rawIcon : 'repeat';
            return (
              <article className="recurrence-card" key={rule.id}>
                <span
                  className="category-color-dot"
                  style={{ background: category?.color ?? 'var(--muted)', width: 42, height: 42 }}
                  aria-hidden="true"
                >
                  <Icon name={categoryIcon} size={18} />
                </span>
                <div className="recurrence-main">
                  <div className="recurrence-title">
                    {rule.label}
                    <Badge tone={rule.type === 'income' ? 'income' : 'expense'}>
                      {rule.type === 'income' ? 'Revenu' : 'Dépense'}
                    </Badge>
                    <Badge tone={STATUS_TONE[status]}>{RULE_STATUS_LABELS[status]}</Badge>
                  </div>
                  <div className="recurrence-meta">
                    <span>{category?.name ?? 'Catégorie supprimée'}</span>
                    <span>·</span>
                    <span>{FREQUENCY_LABELS[rule.frequency]}</span>
                    <span>·</span>
                    <span>
                      Prochaine échéance : {formatDisplayDate(rule.nextOccurrence, settings.dateFormat)}
                    </span>
                    {rule.endDate && (
                      <>
                        <span>·</span>
                        <span>Fin : {formatDisplayDate(rule.endDate, settings.dateFormat)}</span>
                      </>
                    )}
                  </div>
                  {upcoming.length > 1 && (
                    <div className="hint" style={{ marginTop: 4 }}>
                      Échéances prévisionnelles :{' '}
                      {upcoming
                        .slice(1)
                        .map((occurrence) => formatDisplayDate(occurrence.date, settings.dateFormat))
                        .join(' · ')}
                    </div>
                  )}
                </div>
                <div className="recurrence-amount">
                  <span className={rule.type === 'income' ? 'text-income' : 'text-expense'}>
                    {rule.type === 'income' ? '+' : '\u2212'}
                    {formatMoney(rule.amount).replace(/\u00a0|\u202f/g, ' ')}
                  </span>
                  <div className="small muted" style={{ fontWeight: 400 }}>
                    {rule.note ? rule.note : 'Aucune note'}
                  </div>
                </div>
                <div className="recurrence-actions">
                  {isRuleDue(rule) && (
                    <Button
                      variant="primary"
                      size="sm"
                      icon="check"
                      onClick={() => setPendingMaterialize(rule)}
                      disabled={busy}
                    >
                      Matérialiser
                    </Button>
                  )}
                  <IconButton
                    icon="edit"
                    label={`Modifier ${rule.label}`}
                    onClick={() => setEditor({ rule })}
                  />
                  <IconButton
                    icon={rule.isActive ? 'power' : 'refresh'}
                    label={rule.isActive ? `Suspendre ${rule.label}` : `Réactiver ${rule.label}`}
                    onClick={() => toggle(rule)}
                    disabled={busy || status === 'finished'}
                  />
                  <IconButton
                    icon="trash"
                    label={`Supprimer ${rule.label}`}
                    variant="danger"
                    onClick={() => setPendingDelete(rule)}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editor && (
        <RecurrenceFormModal
          key={editor.rule?.id ?? 'new'}
          rule={editor.rule}
          onClose={() => setEditor(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingMaterialize)}
        title="Créer l’opération de cette échéance ?"
        description={
          pendingMaterialize ? (
            <>
              Une opération réelle sera enregistrée au{' '}
              <strong>{formatDisplayDate(pendingMaterialize.nextOccurrence, settings.dateFormat)}</strong>{' '}
              pour <strong>{formatMoney(pendingMaterialize.amount)}</strong>
              {materializeCategory ? ` (${materializeCategory.name})` : ''}. La prochaine échéance
              sera ensuite avancée. Cette action ne peut pas créer de doublon.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Créer l’opération"
        busy={busy}
        onCancel={() => setPendingMaterialize(null)}
        onConfirm={materialize}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Supprimer cette règle de récurrence ?"
        description={
          pendingDelete ? (
            <>
              <strong>{pendingDelete.label}</strong> ne proposera plus d’échéance. Les opérations
              déjà matérialisées restent dans l’historique et continuent d’être comptées. Aucune
              donnée financière n’est supprimée silencieusement.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Supprimer la règle"
        danger
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}

function RecurrenceFormModal({
  rule,
  onClose,
}: {
  rule?: RecurrenceRule;
  onClose: () => void;
}) {
  const { categories, run } = useApp();
  const [type, setType] = useState<TransactionType>(rule?.type ?? 'expense');
  const [amountText, setAmountText] = useState(rule ? String(rule.amount) : '');
  const [categoryId, setCategoryId] = useState(
    rule?.categoryId ??
      categories.find((category) => category.type === (rule?.type ?? 'expense') && category.isActive)
        ?.id ??
      '',
  );
  const [label, setLabel] = useState(rule?.label ?? '');
  const [note, setNote] = useState(rule?.note ?? '');
  const [frequency, setFrequency] = useState(rule?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(rule?.startDate ?? todayISO());
  const [endDate, setEndDate] = useState(rule?.endDate ?? '');
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const categoryOptions = categories
    .filter(
      (category) =>
        category.type === type &&
        (category.isActive || category.id === rule?.categoryId),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const changeType = (next: TransactionType) => {
    setType(next);
    const first = categories.find(
      (category) => category.type === next && category.isActive,
    );
    setCategoryId(first?.id ?? '');
    setErrors((current) => {
      const next = { ...current };
      delete next.categoryId;
      delete next.type;
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    const nextErrors: Record<string, string> = {};
    const parsed = parseAmount(amountText);
    if (!parsed.ok) nextErrors.amount = AMOUNT_ERROR_MESSAGES[parsed.code];
    const input = {
      type,
      amount: parsed.ok ? parsed.amount : 0,
      categoryId,
      label,
      note,
      frequency,
      startDate,
      endDate: endDate || undefined,
      isActive,
    };
    const validation = validateRecurrenceInput(input, categories);
    Object.assign(nextErrors, validation.errors);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    const result = await run(
      () =>
        rule ? updateRecurrence(rule.id, input) : createRecurrence(input),
      rule ? 'Récurrence modifiée.' : 'Récurrence créée.',
    );
    setBusy(false);
    if (result.ok) onClose();
    else setFormError(result.error);
  };

  return (
    <Modal
      open
      title={rule ? 'Modifier la récurrence' : 'Nouvelle récurrence'}
      subtitle={
        rule
          ? 'La date de début reste inchangée. Les opérations déjà créées ne sont pas modifiées.'
          : 'La première échéance sera proposée à la date de début.'
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button variant="primary" type="submit" form="recurrence-form" disabled={busy}>
            {busy ? 'Enregistrement…' : rule ? 'Enregistrer' : 'Créer la récurrence'}
          </Button>
        </>
      }
    >
      <form id="recurrence-form" className="stack" onSubmit={handleSubmit} noValidate>
        <SegmentedControl
          ariaLabel="Type de la récurrence"
          value={type}
          onChange={changeType}
          options={[
            { value: 'expense', label: 'Dépense', icon: 'arrow-up-right', className: 'is-expense' },
            { value: 'income', label: 'Revenu', icon: 'arrow-down-right', className: 'is-income' },
          ]}
        />

        <div className="form-grid">
          <Field label="Montant" htmlFor="recurrence-amount" error={errors.amount} required>
            <div className="input-money">
              <input
                id="recurrence-amount"
                className="input"
                inputMode="numeric"
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
                placeholder="75 000"
                aria-invalid={Boolean(errors.amount)}
                required
              />
              <span className="suffix">FCFA</span>
            </div>
          </Field>
          <Field label="Catégorie" htmlFor="recurrence-category" error={errors.categoryId} required>
            <select
              id="recurrence-category"
              className="select"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              aria-invalid={Boolean(errors.categoryId)}
              required
            >
              <option value="">Sélectionner…</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.isActive ? '' : ' (désactivée)'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Libellé" htmlFor="recurrence-label" error={errors.label} className="span-2" required>
            <input
              id="recurrence-label"
              className="input"
              value={label}
              maxLength={120}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Ex. Loyer, salaire, abonnement Internet"
              aria-invalid={Boolean(errors.label)}
              required
            />
          </Field>
          <Field label="Fréquence" htmlFor="recurrence-frequency" error={errors.frequency} required>
            <select
              id="recurrence-frequency"
              className="select"
              value={frequency}
              onChange={(event) => setFrequency(event.target.value as RecurrenceRule['frequency'])}
            >
              {(Object.keys(FREQUENCY_LABELS) as (keyof typeof FREQUENCY_LABELS)[]).map((value) => (
                <option key={value} value={value}>
                  {FREQUENCY_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Date de début"
            htmlFor="recurrence-start"
            error={errors.startDate}
            hint={rule ? 'Non modifiable après création.' : 'Jour d’ancrage des échéances.'}
            required
          >
            <input
              id="recurrence-start"
              type="date"
              className="input"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              disabled={Boolean(rule)}
              aria-invalid={Boolean(errors.startDate)}
              required
            />
          </Field>
          <Field
            label="Date de fin (facultative)"
            htmlFor="recurrence-end"
            error={errors.endDate}
            hint="Laissez vide pour une récurrence sans fin."
          >
            <input
              id="recurrence-end"
              type="date"
              className="input"
              value={endDate}
              min={startDate}
              onChange={(event) => setEndDate(event.target.value)}
              aria-invalid={Boolean(errors.endDate)}
            />
          </Field>
          <Field label="Note" htmlFor="recurrence-note" className="span-2" error={errors.note}>
            <textarea
              id="recurrence-note"
              className="textarea"
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Informations utiles pour cette récurrence…"
            />
          </Field>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Règle active — les échéances pourront être proposées à la matérialisation.
        </label>

        {formError && <div className="form-error">{formError}</div>}
      </form>
    </Modal>
  );
}
