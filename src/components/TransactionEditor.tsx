import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import type { TransactionType } from '../domain/types';
import { AMOUNT_ERROR_MESSAGES, parseAmount } from '../domain/money';
import { validateTransactionInput } from '../domain/validation';
import { todayISO } from '../domain/periods';
import { createTransaction, updateTransaction } from '../data/repository';
import { Modal, Field, Button, SegmentedControl, InlineAlert } from './ui';

function firstActiveCategoryId(
  categories: { id: string; type: TransactionType; isActive: boolean }[],
  type: TransactionType,
): string {
  return categories.filter((category) => category.type === type && category.isActive)[0]?.id ?? '';
}

export function TransactionEditor() {
  const { editor, closeTransactionEditor } = useApp();
  if (!editor) return null;
  return (
    <TransactionFormModal
      key={editor.transaction?.id ?? `new-${editor.type}`}
      initialType={editor.type}
      transaction={editor.transaction}
      onClose={closeTransactionEditor}
    />
  );
}

function TransactionFormModal({
  initialType,
  transaction,
  onClose,
}: {
  initialType: TransactionType;
  transaction?: import('../domain/types').Transaction;
  onClose: () => void;
}) {
  const { categories, run } = useApp();
  const baseId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<TransactionType>(transaction?.type ?? initialType);
  const [amountText, setAmountText] = useState(transaction ? String(transaction.amount) : '');
  const [date, setDate] = useState(transaction?.date ?? todayISO());
  const [categoryId, setCategoryId] = useState(
    transaction?.categoryId ??
      firstActiveCategoryId(
        categories,
        transaction?.type ?? initialType,
      ),
  );
  const [label, setLabel] = useState(transaction?.label ?? '');
  const [note, setNote] = useState(transaction?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const availableCategories = useMemo(
    () =>
      categories
        .filter(
          (category) =>
            category.type === type &&
            (category.isActive || category.id === transaction?.categoryId),
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [categories, type, transaction?.categoryId],
  );

  useEffect(() => {
    if (!availableCategories.some((category) => category.id === categoryId)) {
      setCategoryId(availableCategories[0]?.id ?? '');
    }
  }, [availableCategories, categoryId]);

  const changeType = (next: TransactionType) => {
    setType(next);
    setErrors((current) => {
      const next = { ...current };
      delete next.type;
      delete next.categoryId;
      return next;
    });
    setCategoryId(firstActiveCategoryId(categories, next));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFormError(null);

    const nextErrors: Record<string, string> = {};
    const parsedAmount = parseAmount(amountText);
    if (!parsedAmount.ok) {
      nextErrors.amount =
        parsedAmount.code === 'decimal' && parsedAmount.rounded !== null
          ? `${AMOUNT_ERROR_MESSAGES.decimal} Valeur arrondie proposée : ${parsedAmount.rounded.toLocaleString('fr-FR')} FCFA.`
          : AMOUNT_ERROR_MESSAGES[parsedAmount.code];
    }

    const input = {
      date,
      type,
      amount: parsedAmount.ok ? parsedAmount.amount : 0,
      categoryId,
      label,
      note,
    };
    const validation = validateTransactionInput(input, categories, {
      allowInactiveCategoryId: transaction?.categoryId,
    });
    Object.assign(nextErrors, validation.errors);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    const result = await run(
      () =>
        transaction
          ? updateTransaction(transaction.id, input)
          : createTransaction(input),
      transaction ? 'Opération modifiée.' : 'Opération enregistrée.',
    );
    setBusy(false);
    if (result.ok) {
      onClose();
    } else {
      setFormError(result.error);
    }
  };

  const amountId = `${baseId}-amount`;
  const dateId = `${baseId}-date`;
  const categoryIdField = `${baseId}-category`;
  const labelId = `${baseId}-label`;
  const noteId = `${baseId}-note`;

  return (
    <Modal
      open
      title={transaction ? 'Modifier l’opération' : 'Nouvelle opération'}
      subtitle={
        transaction
          ? 'Les totaux, budgets et rapports seront recalculés immédiatement.'
          : 'Enregistrez un revenu ou une dépense en quelques secondes.'
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={() => formRef.current?.requestSubmit()}
            disabled={busy || availableCategories.length === 0}
          >
            {busy ? 'Enregistrement…' : transaction ? 'Enregistrer' : 'Ajouter l’opération'}
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={handleSubmit} className="stack" noValidate>
        <SegmentedControl
          ariaLabel="Type d’opération"
          value={type}
          onChange={changeType}
          options={[
            {
              value: 'expense',
              label: 'Dépense',
              icon: 'arrow-up-right',
              className: 'is-expense',
            },
            {
              value: 'income',
              label: 'Revenu',
              icon: 'arrow-down-right',
              className: 'is-income',
            },
          ]}
        />

        {availableCategories.length === 0 && (
          <InlineAlert tone="warning">
            Aucune catégorie active de ce type. Créez-en une depuis la page{' '}
            <Link to="/categories" onClick={onClose}>
              Catégories
            </Link>
            .
          </InlineAlert>
        )}

        <div className="form-grid">
          <Field label="Montant" htmlFor={amountId} error={errors.amount} required>
            <div className="input-money">
              <input
                id={amountId}
                className="input"
                inputMode="numeric"
                autoComplete="off"
                placeholder="25 000"
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
                aria-invalid={Boolean(errors.amount)}
                aria-describedby={errors.amount ? `${amountId}-error` : undefined}
                required
              />
              <span className="suffix">FCFA</span>
            </div>
          </Field>

          <Field label="Date" htmlFor={dateId} error={errors.date} required>
            <input
              id={dateId}
              type="date"
              className="input"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              aria-invalid={Boolean(errors.date)}
              required
            />
          </Field>

          <Field
            label="Catégorie"
            htmlFor={categoryIdField}
            error={errors.categoryId}
            className="span-2"
            required
          >
            <select
              id={categoryIdField}
              className="select"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              aria-invalid={Boolean(errors.categoryId)}
              required
            >
              <option value="">Sélectionner une catégorie…</option>
              {availableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.isActive ? '' : ' (désactivée)'}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Libellé"
            htmlFor={labelId}
            error={errors.label}
            className="span-2"
            required
          >
            <input
              id={labelId}
              className="input"
              value={label}
              maxLength={120}
              placeholder="Ex. Courses au marché"
              onChange={(event) => setLabel(event.target.value)}
              aria-invalid={Boolean(errors.label)}
              required
            />
          </Field>

          <Field
            label="Note (facultative)"
            htmlFor={noteId}
            error={errors.note}
            className="span-2"
            hint="500 caractères maximum."
          >
            <textarea
              id={noteId}
              className="textarea"
              value={note}
              maxLength={500}
              placeholder="Détail complémentaire, référence…"
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </div>

        {formError && <div className="form-error">{formError}</div>}

        <p className="hint">Le montant est un entier de FCFA, toujours positif.</p>
      </form>
    </Modal>
  );
}
