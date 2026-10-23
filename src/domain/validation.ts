import type {
  Budget,
  Category,
  Frequency,
  ISODate,
  RecurrenceRule,
  TransactionType,
} from './types';
import { isValidISODate, parseISODate, startOfMonth } from './periods';
import { AMOUNT_ERROR_MESSAGES, parseAmount } from './money';
import { DEFAULT_ALERT_THRESHOLD } from './budgets';

export type FieldErrors = Record<string, string>;

export interface TransactionInput {
  date: ISODate;
  type: TransactionType;
  amount: number;
  categoryId: string;
  label: string;
  note: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  errors: FieldErrors;
  value?: T;
}

/** Nettoie un texte saisi : retire les caractères de contrôle et borne la longueur. */
export function sanitizeText(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function validateTransactionInput(
  input: TransactionInput,
  categories: Category[],
  options: { allowInactiveCategoryId?: string } = {},
): ValidationResult<TransactionInput> {
  const errors: FieldErrors = {};

  if (!isValidISODate(input.date)) errors.date = 'La date est invalide.';

  if (input.type !== 'income' && input.type !== 'expense') {
    errors.type = 'Le type doit être « Revenu » ou « Dépense ».';
  }

  if (!Number.isSafeInteger(input.amount)) {
    errors.amount = AMOUNT_ERROR_MESSAGES.decimal;
  } else if (input.amount <= 0) {
    errors.amount = AMOUNT_ERROR_MESSAGES.zero;
  }

  const category = categories.find((item) => item.id === input.categoryId);
  if (!category) {
    errors.categoryId = 'Sélectionnez une catégorie.';
  } else if (category.type !== input.type) {
    errors.categoryId = 'La catégorie ne correspond pas au type de l’opération.';
  } else if (!category.isActive && category.id !== options.allowInactiveCategoryId) {
    errors.categoryId = 'Cette catégorie est désactivée.';
  }

  const label = sanitizeText(input.label, 120);
  if (!label) errors.label = 'Le libellé est obligatoire.';
  if (sanitizeText(input.note, 500) !== input.note.trim()) {
    errors.note = 'La note ne doit pas dépasser 500 caractères.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors,
    value: {
      ...input,
      label,
      note: sanitizeText(input.note, 500),
    },
  };
}

export interface BudgetInput {
  categoryId: string;
  periodStart: ISODate;
  amount: number;
  alertThreshold: number;
}

export function validateBudgetInput(
  input: BudgetInput,
  categories: Category[],
  existingBudgets: Budget[],
  editingId?: string,
): ValidationResult<BudgetInput> {
  const errors: FieldErrors = {};
  const category = categories.find((item) => item.id === input.categoryId);
  if (!category) errors.categoryId = 'Sélectionnez une catégorie de dépense.';
  else if (category.type !== 'expense') {
    errors.categoryId = 'Un budget ne peut cibler qu’une catégorie de dépense.';
  }

  const parsed = parseISODate(input.periodStart);
  if (!parsed) errors.periodStart = 'Choisissez un mois valide.';
  else if (startOfMonth(input.periodStart) !== input.periodStart) {
    errors.periodStart = 'La période doit être le premier jour d’un mois.';
  }

  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    errors.amount = 'Le montant du budget doit être un entier strictement positif.';
  }

  if (
    !Number.isFinite(input.alertThreshold) ||
    input.alertThreshold <= 0 ||
    input.alertThreshold > 100
  ) {
    errors.alertThreshold = 'Le seuil d’alerte doit être compris entre 1 et 100 %.';
  }

  if (
    input.categoryId &&
    input.periodStart &&
    existingBudgets.some(
      (budget) =>
        budget.id !== editingId &&
        budget.categoryId === input.categoryId &&
        budget.periodType === 'month' &&
        budget.periodStart === input.periodStart,
    )
  ) {
    errors.categoryId = 'Un budget existe déjà pour cette catégorie et ce mois.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, errors, value: input };
}

export interface RecurrenceInput {
  type: TransactionType;
  amount: number;
  categoryId: string;
  label: string;
  note: string;
  frequency: Frequency;
  startDate: ISODate;
  endDate?: ISODate;
  isActive: boolean;
}

const FREQUENCIES: Frequency[] = [
  'weekly',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
];

export function validateRecurrenceInput(
  input: RecurrenceInput,
  categories: Category[],
  options: { allowInactiveCategoryId?: string } = {},
): ValidationResult<RecurrenceInput> {
  const errors: FieldErrors = {};

  if (input.type !== 'income' && input.type !== 'expense') {
    errors.type = 'Type d’opération invalide.';
  }
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    errors.amount = 'Le montant doit être un entier strictement positif.';
  }
  const category = categories.find((item) => item.id === input.categoryId);
  if (!category) errors.categoryId = 'Sélectionnez une catégorie.';
  else if (category.type !== input.type) {
    errors.categoryId = 'La catégorie ne correspond pas au type de l’opération.';
  } else if (!category.isActive && category.id !== options.allowInactiveCategoryId) {
    errors.categoryId = 'Cette catégorie est désactivée.';
  }
  const label = sanitizeText(input.label, 120);
  if (!label) errors.label = 'Le libellé est obligatoire.';
  if (!FREQUENCIES.includes(input.frequency)) errors.frequency = 'Fréquence invalide.';
  if (!isValidISODate(input.startDate)) errors.startDate = 'La date de début est invalide.';
  if (input.endDate && !isValidISODate(input.endDate)) {
    errors.endDate = 'La date de fin est invalide.';
  } else if (input.endDate && input.startDate && input.endDate < input.startDate) {
    errors.endDate = 'La date de fin doit être postérieure à la date de début.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors,
    value: {
      ...input,
      label,
      note: sanitizeText(input.note, 500),
    },
  };
}

export function validateAmountText(raw: string): { amount?: number; error?: string } {
  const parsed = parseAmount(raw);
  if (parsed.ok) return { amount: parsed.amount };
  return { error: AMOUNT_ERROR_MESSAGES[parsed.code] };
}

export function validateCategoryName(
  name: string,
  type: TransactionType,
  categories: Category[],
  editingId?: string,
): string | null {
  const trimmed = sanitizeText(name, 60);
  if (!trimmed) return 'Le nom est obligatoire.';
  if (
    categories.some(
      (category) =>
        category.id !== editingId &&
        category.type === type &&
        category.name.toLocaleLowerCase('fr') === trimmed.toLocaleLowerCase('fr'),
    )
  ) {
    return 'Une catégorie de ce type porte déjà ce nom.';
  }
  return null;
}

export const DEFAULT_THRESHOLD = DEFAULT_ALERT_THRESHOLD;

export function validateRuleForEdit(
  rule: RecurrenceRule,
  input: RecurrenceInput,
  categories: Category[],
): ValidationResult<RecurrenceInput> {
  if (rule.startDate !== input.startDate) {
    return {
      ok: false,
      errors: {
        startDate:
          'La date de début ne peut pas être modifiée. Créez une nouvelle règle si nécessaire.',
      },
    };
  }
  return validateRecurrenceInput(input, categories);
}
