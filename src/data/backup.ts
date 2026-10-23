/**
 * Sauvegarde et restauration complètes.
 *
 * Le fichier de sauvegarde est un JSON versionné. La validation est stricte :
 * un fichier invalide est refusé en totalité, sans modifier les données.
 */

import type {
  AppSettings,
  Budget,
  Category,
  Frequency,
  RecurrenceRule,
  Transaction,
  TransactionType,
} from '../domain/types';
import { startOfMonth, isValidISODate, todayISO } from '../domain/periods';
import { sanitizeText } from '../domain/validation';
import { APP_DATA_VERSION, SCHEMA_VERSION } from './defaults';

export const BACKUP_APP_ID = 'budget-personnel';
export const BACKUP_FORMAT_VERSION = 1;

export interface BackupData {
  app: typeof BACKUP_APP_ID;
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  settings: AppSettings;
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurrences: RecurrenceRule[];
}

export interface BackupValidation {
  ok: boolean;
  errors: string[];
  data?: BackupData;
  truncatedErrors?: number;
}

const MAX_ERRORS = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isTransactionType(value: unknown): value is TransactionType {
  return value === 'income' || value === 'expense';
}

const FREQUENCIES: Frequency[] = [
  'weekly',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
];

export function buildBackupData(
  data: {
    settings: AppSettings;
    categories: Category[];
    transactions: Transaction[];
    budgets: Budget[];
    recurrences: RecurrenceRule[];
  },
  exportedAt: string = new Date().toISOString(),
): BackupData {
  return {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    settings: data.settings,
    categories: data.categories,
    transactions: data.transactions,
    budgets: data.budgets,
    recurrences: data.recurrences,
  };
}

export function serializeBackup(backup: BackupData): string {
  return JSON.stringify(backup, null, 2);
}

export function backupFileName(now: Date = new Date()): string {
  const date = todayISO(now).replace(/-/g, '');
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  return `sauvegarde-budget-${date}-${time}.json`;
}

/** Valide et normalise un contenu JSON de sauvegarde. */
export function parseBackupJson(text: string): BackupValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['Le fichier n’est pas un JSON valide.'] };
  }
  return validateBackupObject(parsed);
}

export function validateBackupObject(value: unknown): BackupValidation {
  const errors: string[] = [];
  let truncated = 0;
  const addError = (message: string) => {
    if (errors.length < MAX_ERRORS) errors.push(message);
    else truncated += 1;
  };

  if (!isRecord(value)) {
    return { ok: false, errors: ['Le fichier ne contient pas un objet de sauvegarde.'] };
  }
  if (value.app !== BACKUP_APP_ID) {
    return {
      ok: false,
      errors: ['Ce fichier n’est pas une sauvegarde de Budget personnel.'],
    };
  }
  if (value.formatVersion !== BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      errors: [
        `Version de sauvegarde non prise en charge (${String(value.formatVersion)}). Version attendue : ${BACKUP_FORMAT_VERSION}.`,
      ],
    };
  }

  const settingsRaw = value.settings;
  if (!isRecord(settingsRaw)) {
    return { ok: false, errors: ['Paramètres absents ou invalides dans la sauvegarde.'] };
  }
  const initialBalance = settingsRaw.initialBalance;
  if (!Number.isSafeInteger(initialBalance)) {
    addError('Solde initial invalide : un entier de FCFA est attendu.');
  }
  if (settingsRaw.currency !== 'XOF') {
    addError('Devise invalide : cette application fonctionne exclusivement en XOF.');
  }
  const theme = settingsRaw.theme;
  if (theme !== 'light' && theme !== 'dark' && theme !== 'system') {
    addError('Thème invalide dans les paramètres.');
  }
  const dateFormat = settingsRaw.dateFormat;
  if (dateFormat !== 'DD/MM/YYYY' && dateFormat !== 'YYYY-MM-DD') {
    addError('Format de date invalide dans les paramètres.');
  }
  const numberFormat = settingsRaw.numberFormat;
  if (numberFormat !== 'fr-FR' && numberFormat !== 'en-US') {
    addError('Format de nombre invalide dans les paramètres.');
  }

  const categoriesRaw = value.categories;
  const transactionsRaw = value.transactions;
  const budgetsRaw = value.budgets;
  const recurrencesRaw = value.recurrences;
  if (!Array.isArray(categoriesRaw)) addError('Liste des catégories absente.');
  if (!Array.isArray(transactionsRaw)) addError('Liste des opérations absente.');
  if (!Array.isArray(budgetsRaw)) addError('Liste des budgets absente.');
  if (!Array.isArray(recurrencesRaw)) addError('Liste des récurrences absente.');

  if (errors.length > 0) {
    return { ok: false, errors, truncatedErrors: truncated || undefined };
  }

  const categories: Category[] = [];
  const categoryIds = new Set<string>();
  const categoriesArray = categoriesRaw as unknown[];
  if (categoriesArray.length > 5000) {
    return { ok: false, errors: ['Trop de catégories dans la sauvegarde (maximum 5 000).'] };
  }
  categoriesArray.forEach((raw, index) => {
    const position = `Catégorie ${index + 1}`;
    if (!isRecord(raw)) {
      addError(`${position} : format invalide.`);
      return;
    }
    const id = asString(raw.id);
    const name = asString(raw.name);
    if (!id) return addError(`${position} : identifiant manquant.`);
    if (!name || !name.trim()) return addError(`${position} : nom manquant.`);
    if (categoryIds.has(id)) return addError(`${position} : identifiant dupliqué (${id}).`);
    if (!isTransactionType(raw.type)) return addError(`${position} : type invalide.`);
    const color =
      typeof raw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color)
        ? raw.color.toLowerCase()
        : '#64748b';
    const createdAt = asString(raw.createdAt) ?? new Date().toISOString();
    const updatedAt = asString(raw.updatedAt) ?? createdAt;
    categoryIds.add(id);
    categories.push({
      id,
      name: sanitizeText(name, 80),
      type: raw.type,
      color,
      icon: asString(raw.icon) ?? 'tag',
      description: sanitizeText(asString(raw.description) ?? '', 500),
      isActive: typeof raw.isActive === 'boolean' ? raw.isActive : true,
      createdAt,
      updatedAt,
    });
  });

  const recurrences: RecurrenceRule[] = [];
  const recurrenceIds = new Set<string>();
  const recurrencesArray = recurrencesRaw as unknown[];
  if (recurrencesArray.length > 5000) {
    return { ok: false, errors: ['Trop de récurrences dans la sauvegarde (maximum 5 000).'] };
  }
  recurrencesArray.forEach((raw, index) => {
    const position = `Récurrence ${index + 1}`;
    if (!isRecord(raw)) return addError(`${position} : format invalide.`);
    const id = asString(raw.id);
    if (!id) return addError(`${position} : identifiant manquant.`);
    if (recurrenceIds.has(id)) return addError(`${position} : identifiant dupliqué (${id}).`);
    if (!isTransactionType(raw.type)) return addError(`${position} : type invalide.`);
    const amount = raw.amount;
    if (!Number.isSafeInteger(amount) || (amount as number) <= 0) {
      return addError(`${position} : montant invalide.`);
    }
    const categoryId = asString(raw.categoryId);
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return addError(`${position} : catégorie inconnue.`);
    if (category.type !== raw.type) {
      return addError(`${position} : la catégorie ne correspond pas au type.`);
    }
    if (!FREQUENCIES.includes(raw.frequency as Frequency)) {
      return addError(`${position} : fréquence invalide.`);
    }
    const startDate = asString(raw.startDate);
    if (!startDate || !isValidISODate(startDate)) {
      return addError(`${position} : date de début invalide.`);
    }
    const endDate = asOptionalString(raw.endDate);
    if (endDate && !isValidISODate(endDate)) {
      return addError(`${position} : date de fin invalide.`);
    }
    if (endDate && endDate < startDate) {
      return addError(`${position} : la date de fin précède la date de début.`);
    }
    const nextOccurrence = asString(raw.nextOccurrence);
    if (!nextOccurrence || !isValidISODate(nextOccurrence)) {
      return addError(`${position} : prochaine échéance invalide.`);
    }
    if (nextOccurrence < startDate) {
      return addError(`${position} : la prochaine échéance précède le début.`);
    }
    const label = sanitizeText(asString(raw.label) ?? '', 120);
    if (!label) return addError(`${position} : libellé manquant.`);
    recurrenceIds.add(id);
    recurrences.push({
      id,
      type: raw.type,
      amount: amount as number,
      categoryId: categoryId!,
      label,
      note: sanitizeText(asString(raw.note) ?? '', 500),
      frequency: raw.frequency as Frequency,
      startDate,
      endDate,
      nextOccurrence,
      isActive: typeof raw.isActive === 'boolean' ? raw.isActive : true,
      createdAt: asString(raw.createdAt) ?? new Date().toISOString(),
      updatedAt: asString(raw.updatedAt) ?? asString(raw.createdAt) ?? new Date().toISOString(),
    });
  });

  const transactions: Transaction[] = [];
  const transactionIds = new Set<string>();
  const occurrenceKeys = new Set<string>();
  const transactionsArray = transactionsRaw as unknown[];
  if (transactionsArray.length > 200_000) {
    return { ok: false, errors: ['Trop d’opérations dans la sauvegarde (maximum 200 000).'] };
  }
  transactionsArray.forEach((raw, index) => {
    const position = `Opération ${index + 1}`;
    if (!isRecord(raw)) return addError(`${position} : format invalide.`);
    const id = asString(raw.id);
    if (!id) return addError(`${position} : identifiant manquant.`);
    if (transactionIds.has(id)) return addError(`${position} : identifiant dupliqué (${id}).`);
    const date = asString(raw.date);
    if (!date || !isValidISODate(date)) return addError(`${position} : date invalide.`);
    if (!isTransactionType(raw.type)) return addError(`${position} : type invalide.`);
    const amount = raw.amount;
    if (!Number.isSafeInteger(amount) || (amount as number) <= 0) {
      return addError(`${position} : montant invalide.`);
    }
    const categoryId = asString(raw.categoryId);
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return addError(`${position} : catégorie inconnue.`);
    if (category.type !== raw.type) {
      return addError(`${position} : catégorie incompatible avec le type.`);
    }
    const label = sanitizeText(asString(raw.label) ?? '', 120);
    if (!label) return addError(`${position} : libellé manquant.`);
    const occurrenceKey = asOptionalString(raw.occurrenceKey);
    if (occurrenceKey) {
      if (occurrenceKeys.has(occurrenceKey)) {
        return addError(`${position} : échéance de récurrence dupliquée.`);
      }
      occurrenceKeys.add(occurrenceKey);
    }
    const recurrenceRuleId = asOptionalString(raw.recurrenceRuleId);
    if (recurrenceRuleId && !recurrenceIds.has(recurrenceRuleId)) {
      return addError(`${position} : règle de récurrence inconnue.`);
    }
    transactionIds.add(id);
    const createdAt = asString(raw.createdAt) ?? new Date().toISOString();
    transactions.push({
      id,
      date,
      type: raw.type,
      amount: amount as number,
      categoryId: categoryId!,
      label,
      note: sanitizeText(asString(raw.note) ?? '', 500),
      source: sanitizeText(asString(raw.source) ?? 'import', 40) || 'import',
      sourceId: asOptionalString(raw.sourceId),
      recurrenceRuleId,
      occurrenceDate: asOptionalString(raw.occurrenceDate),
      occurrenceKey,
      importBatchId: asOptionalString(raw.importBatchId),
      createdAt,
      updatedAt: asString(raw.updatedAt) ?? createdAt,
    });
  });

  const budgets: Budget[] = [];
  const budgetIds = new Set<string>();
  const budgetKeys = new Set<string>();
  const budgetsArray = budgetsRaw as unknown[];
  if (budgetsArray.length > 50_000) {
    return { ok: false, errors: ['Trop de budgets dans la sauvegarde (maximum 50 000).'] };
  }
  budgetsArray.forEach((raw, index) => {
    const position = `Budget ${index + 1}`;
    if (!isRecord(raw)) return addError(`${position} : format invalide.`);
    const id = asString(raw.id);
    if (!id) return addError(`${position} : identifiant manquant.`);
    if (budgetIds.has(id)) return addError(`${position} : identifiant dupliqué (${id}).`);
    const categoryId = asString(raw.categoryId);
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return addError(`${position} : catégorie inconnue.`);
    if (category.type !== 'expense') {
      return addError(`${position} : un budget doit cibler une catégorie de dépense.`);
    }
    if (raw.periodType !== 'month') {
      return addError(`${position} : seul le budget mensuel est pris en charge.`);
    }
    const periodStart = asString(raw.periodStart);
    if (!periodStart || !isValidISODate(periodStart) || startOfMonth(periodStart) !== periodStart) {
      return addError(`${position} : mois de budget invalide.`);
    }
    const amount = raw.amount;
    if (!Number.isSafeInteger(amount) || (amount as number) <= 0) {
      return addError(`${position} : montant invalide.`);
    }
    const alertThreshold = raw.alertThreshold;
    if (
      typeof alertThreshold !== 'number' ||
      !Number.isFinite(alertThreshold) ||
      alertThreshold <= 0 ||
      alertThreshold > 100
    ) {
      return addError(`${position} : seuil d’alerte invalide.`);
    }
    const budgetKey = `${categoryId}|month|${periodStart}`;
    if (budgetKeys.has(budgetKey)) {
      return addError(`${position} : budget en double pour cette catégorie et ce mois.`);
    }
    budgetKeys.add(budgetKey);
    budgetIds.add(id);
    budgets.push({
      id,
      categoryId: categoryId!,
      periodType: 'month',
      periodStart,
      amount: amount as number,
      alertThreshold,
      budgetKey,
      createdAt: asString(raw.createdAt) ?? new Date().toISOString(),
      updatedAt: asString(raw.updatedAt) ?? asString(raw.createdAt) ?? new Date().toISOString(),
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors, truncatedErrors: truncated || undefined };
  }

  const settings: AppSettings = {
    id: 'app',
    currency: 'XOF',
    initialBalance: initialBalance as number,
    theme: theme as AppSettings['theme'],
    dateFormat: dateFormat as AppSettings['dateFormat'],
    numberFormat: numberFormat as AppSettings['numberFormat'],
    version: APP_DATA_VERSION,
  };

  return {
    ok: true,
    errors: [],
    data: {
      app: BACKUP_APP_ID,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: typeof value.schemaVersion === 'number' ? value.schemaVersion : SCHEMA_VERSION,
      exportedAt: asString(value.exportedAt) ?? new Date().toISOString(),
      settings,
      categories,
      transactions,
      budgets,
      recurrences,
    },
  };
}
