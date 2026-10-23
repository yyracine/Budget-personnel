/**
 * Accès aux données et mutations validées.
 * Chaque mutation vérifie les règles métier avant d'écrire dans IndexedDB.
 */

import type {
  AppSettings,
  Budget,
  Category,
  RecurrenceRule,
  Transaction,
  TransactionType,
} from '../domain/types';
import {
  sanitizeText,
  validateBudgetInput,
  validateCategoryName,
  validateRecurrenceInput,
  validateTransactionInput,
  type BudgetInput,
  type RecurrenceInput,
  type TransactionInput,
} from '../domain/validation';
import { isValidISODate, startOfMonth } from '../domain/periods';
import { occurrenceKey, nextOccurrenceAfter, ruleStatus } from '../domain/recurrence';
import {
  fingerprintTransaction,
  type ImportCandidate,
} from '../domain/importer';
import { buildBackupData, validateBackupObject, type BackupData } from './backup';
import { DEFAULT_SETTINGS, buildDefaultCategories } from './defaults';
import { getDatabase, type BudgetDatabase } from './db';

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export interface CategoryUsage {
  transactions: number;
  budgets: number;
  recurrences: number;
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

function firstError(errors: Record<string, string>): string {
  return Object.values(errors)[0] ?? 'Données invalides.';
}

export interface DataSnapshot {
  settings: AppSettings;
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurrences: RecurrenceRule[];
}

export async function loadSnapshot(database: BudgetDatabase = getDatabase()): Promise<DataSnapshot> {
  const [settings, categories, transactions, budgets, recurrences] = await Promise.all([
    database.settings.get('app'),
    database.categories.toArray(),
    database.transactions.toArray(),
    database.budgets.toArray(),
    database.recurrences.toArray(),
  ]);
  return {
    settings: settings ?? { ...DEFAULT_SETTINGS },
    categories,
    transactions,
    budgets,
    recurrences,
  };
}

// ---------------------------------------------------------------------------
// Opérations
// ---------------------------------------------------------------------------

export async function createTransaction(
  input: TransactionInput,
  database: BudgetDatabase = getDatabase(),
): Promise<Transaction> {
  const categories = await database.categories.toArray();
  const validation = validateTransactionInput(input, categories);
  if (!validation.ok) throw new RepositoryError(firstError(validation.errors));
  const timestamp = nowISO();
  const transaction: Transaction = {
    id: createId('tx'),
    ...validation.value!,
    source: 'manual',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await database.transactions.add(transaction);
  return transaction;
}

export async function updateTransaction(
  id: string,
  input: TransactionInput,
  database: BudgetDatabase = getDatabase(),
): Promise<Transaction> {
  return database.transaction('rw', database.transactions, database.categories, async () => {
    const existing = await database.transactions.get(id);
    if (!existing) throw new RepositoryError('Cette opération n’existe pas.');
    const categories = await database.categories.toArray();
    const validation = validateTransactionInput(input, categories, {
      allowInactiveCategoryId: existing.categoryId,
    });
    if (!validation.ok) throw new RepositoryError(firstError(validation.errors));
    const updated: Transaction = {
      ...existing,
      ...validation.value!,
      updatedAt: nowISO(),
    };
    await database.transactions.put(updated);
    return updated;
  });
}

export async function deleteTransaction(
  id: string,
  database: BudgetDatabase = getDatabase(),
): Promise<void> {
  const existing = await database.transactions.get(id);
  if (!existing) throw new RepositoryError('Cette opération n’existe pas.');
  await database.transactions.delete(id);
}

// ---------------------------------------------------------------------------
// Catégories
// ---------------------------------------------------------------------------

export interface CategoryInput {
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
  description: string;
  isActive: boolean;
}

export async function getCategoryUsage(
  id: string,
  database: BudgetDatabase = getDatabase(),
): Promise<CategoryUsage> {
  const [transactions, budgets, recurrences] = await Promise.all([
    database.transactions.where('categoryId').equals(id).count(),
    database.budgets.where('categoryId').equals(id).count(),
    database.recurrences.toArray().then((items) => items.filter((item) => item.categoryId === id).length),
  ]);
  return { transactions, budgets, recurrences };
}

export async function createCategory(
  input: CategoryInput,
  database: BudgetDatabase = getDatabase(),
): Promise<Category> {
  const categories = await database.categories.toArray();
  const nameError = validateCategoryName(input.name, input.type, categories);
  if (nameError) throw new RepositoryError(nameError);
  if (input.type !== 'income' && input.type !== 'expense') {
    throw new RepositoryError('Type de catégorie invalide.');
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) {
    throw new RepositoryError('La couleur doit être au format hexadécimal #RRGGBB.');
  }
  const timestamp = nowISO();
  const category: Category = {
    id: createId('cat'),
    name: sanitizeText(input.name, 60),
    type: input.type,
    color: input.color.toLowerCase(),
    icon: input.icon || 'tag',
    description: sanitizeText(input.description, 500),
    isActive: input.isActive,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await database.categories.add(category);
  return category;
}

export async function updateCategory(
  id: string,
  input: CategoryInput,
  database: BudgetDatabase = getDatabase(),
): Promise<Category> {
  return database.transaction(
    'rw',
    database.categories,
    database.transactions,
    database.budgets,
    database.recurrences,
    async () => {
    const existing = await database.categories.get(id);
    if (!existing) throw new RepositoryError('Cette catégorie n’existe pas.');
    const categories = await database.categories.toArray();
    const nameError = validateCategoryName(input.name, input.type, categories, id);
    if (nameError) throw new RepositoryError(nameError);
    if (input.type !== existing.type) {
      const [transactionUsage, budgetUsage, recurrenceUsage] = await Promise.all([
        database.transactions.where('categoryId').equals(id).count(),
        database.budgets.where('categoryId').equals(id).count(),
        database.recurrences.toArray().then((items) =>
          items.filter((item) => item.categoryId === id).length,
        ),
      ]);
      if (transactionUsage + budgetUsage + recurrenceUsage > 0) {
        throw new RepositoryError(
          'Le type d’une catégorie utilisée par des opérations, budgets ou récurrences ne peut pas être modifié.',
        );
      }
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) {
      throw new RepositoryError('La couleur doit être au format hexadécimal #RRGGBB.');
    }
    const updated: Category = {
      ...existing,
      name: sanitizeText(input.name, 60),
      type: input.type,
      color: input.color.toLowerCase(),
      icon: input.icon || 'tag',
      description: sanitizeText(input.description, 500),
      isActive: input.isActive,
      updatedAt: nowISO(),
    };
    await database.categories.put(updated);
    return updated;
  });
}

export async function setCategoryActive(
  id: string,
  isActive: boolean,
  database: BudgetDatabase = getDatabase(),
): Promise<void> {
  const category = await database.categories.get(id);
  if (!category) throw new RepositoryError('Cette catégorie n’existe pas.');
  await database.categories.put({ ...category, isActive, updatedAt: nowISO() });
}

export async function deleteCategory(
  id: string,
  database: BudgetDatabase = getDatabase(),
): Promise<void> {
  const usage = await getCategoryUsage(id, database);
  if (usage.transactions > 0 || usage.budgets > 0 || usage.recurrences > 0) {
    throw new RepositoryError(
      'Cette catégorie est utilisée par des opérations, budgets ou récurrences. Désactivez-la pour conserver l’intégrité de l’historique.',
    );
  }
  await database.categories.delete(id);
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export async function upsertBudget(
  input: BudgetInput & { id?: string },
  database: BudgetDatabase = getDatabase(),
): Promise<Budget> {
  return database.transaction('rw', database.budgets, database.categories, async () => {
    const categories = await database.categories.toArray();
    const budgets = await database.budgets.toArray();
    const validation = validateBudgetInput(input, categories, budgets, input.id);
    if (!validation.ok) throw new RepositoryError(firstError(validation.errors));
    const timestamp = nowISO();
    const budgetKey = `${input.categoryId}|month|${input.periodStart}`;
    if (input.id) {
      const existing = await database.budgets.get(input.id);
      if (!existing) throw new RepositoryError('Ce budget n’existe pas.');
      const updated: Budget = {
        ...existing,
        categoryId: input.categoryId,
        periodType: 'month',
        periodStart: startOfMonth(input.periodStart),
        amount: input.amount,
        alertThreshold: input.alertThreshold,
        budgetKey,
        updatedAt: timestamp,
      };
      await database.budgets.put(updated);
      return updated;
    }
    const budget: Budget = {
      id: createId('budget'),
      categoryId: input.categoryId,
      periodType: 'month',
      periodStart: startOfMonth(input.periodStart),
      amount: input.amount,
      alertThreshold: input.alertThreshold,
      budgetKey,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await database.budgets.add(budget);
    return budget;
  });
}

export async function deleteBudget(
  id: string,
  database: BudgetDatabase = getDatabase(),
): Promise<void> {
  const existing = await database.budgets.get(id);
  if (!existing) throw new RepositoryError('Ce budget n’existe pas.');
  await database.budgets.delete(id);
}

// ---------------------------------------------------------------------------
// Récurrences
// ---------------------------------------------------------------------------

export async function createRecurrence(
  input: RecurrenceInput,
  database: BudgetDatabase = getDatabase(),
): Promise<RecurrenceRule> {
  const categories = await database.categories.toArray();
  const validation = validateRecurrenceInput(input, categories);
  if (!validation.ok) throw new RepositoryError(firstError(validation.errors));
  const timestamp = nowISO();
  const rule: RecurrenceRule = {
    id: createId('rule'),
    ...validation.value!,
    nextOccurrence: validation.value!.startDate,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await database.recurrences.add(rule);
  return rule;
}

export async function updateRecurrence(
  id: string,
  input: RecurrenceInput,
  database: BudgetDatabase = getDatabase(),
): Promise<RecurrenceRule> {
  const existing = await database.recurrences.get(id);
  if (!existing) throw new RepositoryError('Cette récurrence n’existe pas.');
  if (existing.startDate !== input.startDate) {
    throw new RepositoryError('La date de début d’une récurrence ne peut pas être modifiée.');
  }
  const categories = await database.categories.toArray();
  const validation = validateRecurrenceInput(input, categories, {
    allowInactiveCategoryId: existing.categoryId,
  });
  if (!validation.ok) throw new RepositoryError(firstError(validation.errors));
  const updated: RecurrenceRule = {
    ...existing,
    ...validation.value!,
    nextOccurrence: existing.nextOccurrence,
    updatedAt: nowISO(),
  };
  await database.recurrences.put(updated);
  return updated;
}

export async function setRecurrenceActive(
  id: string,
  isActive: boolean,
  database: BudgetDatabase = getDatabase(),
): Promise<void> {
  const rule = await database.recurrences.get(id);
  if (!rule) throw new RepositoryError('Cette récurrence n’existe pas.');
  if (isActive && rule.endDate && rule.nextOccurrence > rule.endDate) {
    throw new RepositoryError(
      'Cette règle est terminée : sa prochaine échéance dépasse sa date de fin.',
    );
  }
  await database.recurrences.put({ ...rule, isActive, updatedAt: nowISO() });
}

export async function deleteRecurrence(
  id: string,
  database: BudgetDatabase = getDatabase(),
): Promise<void> {
  const existing = await database.recurrences.get(id);
  if (!existing) throw new RepositoryError('Cette récurrence n’existe pas.');
  await database.recurrences.delete(id);
}

export interface MaterializationResult {
  transaction: Transaction;
  nextOccurrence: string;
}

/**
 * Matérialise la prochaine échéance d'une règle. La clé d'unicité
 * `${ruleId}|${date}` et l'index unique IndexedDB empêchent tout doublon.
 * Aucune opération future n'est créée tant que cette action n'est pas lancée.
 */
export async function materializeRecurrence(
  id: string,
  database: BudgetDatabase = getDatabase(),
): Promise<MaterializationResult> {
  return database.transaction('rw', database.transactions, database.recurrences, async () => {
    const rule = await database.recurrences.get(id);
    if (!rule) throw new RepositoryError('Cette récurrence n’existe pas.');
    if (!rule.isActive) throw new RepositoryError('Cette récurrence est suspendue.');
    const status = ruleStatus(rule);
    if (status === 'finished') {
      throw new RepositoryError('Cette récurrence est terminée.');
    }
    const date = rule.nextOccurrence;
    const key = occurrenceKey(rule.id, date);
    const existing = await database.transactions.where('occurrenceKey').equals(key).first();
    if (existing) {
      throw new RepositoryError(
        'Cette échéance a déjà été matérialisée. Aucune opération en double n’a été créée.',
      );
    }
    const timestamp = nowISO();
    const transaction: Transaction = {
      id: createId('tx'),
      date,
      type: rule.type,
      amount: rule.amount,
      categoryId: rule.categoryId,
      label: rule.label,
      note: rule.note,
      source: 'recurrence',
      recurrenceRuleId: rule.id,
      occurrenceDate: date,
      occurrenceKey: key,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await database.transactions.add(transaction);
    const next = nextOccurrenceAfter(rule, date);
    await database.recurrences.put({
      ...rule,
      nextOccurrence: next,
      updatedAt: timestamp,
    });
    return { transaction, nextOccurrence: next };
  });
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportResult {
  inserted: number;
  skippedDuplicates: number;
  batchId: string;
}

export async function importCandidates(
  candidates: ImportCandidate[],
  options: { strategy: 'skip' | 'all'; source: string },
  database: BudgetDatabase = getDatabase(),
): Promise<ImportResult> {
  return database.transaction(
    'rw',
    database.transactions,
    database.categories,
    async () => {
      const categories = await database.categories.toArray();
      const categoryById = new Map(categories.map((category) => [category.id, category]));
      const batchId = createId('import');
      const timestamp = nowISO();

      let existingPrint = new Set<string>();
      if (options.strategy === 'skip') {
        const existing = await database.transactions.toArray();
        existingPrint = new Set(existing.map(fingerprintTransaction));
      }

      const records: Transaction[] = [];
      const batchPrint = new Set<string>();
      let skipped = 0;
      for (const candidate of candidates) {
        const category = categoryById.get(candidate.categoryId);
        if (!category) {
          throw new RepositoryError(
            `Catégorie inconnue pour la ligne ${candidate.line} : l’import a été annulé.`,
          );
        }
        if (category.type !== candidate.type) {
          throw new RepositoryError(
            `Catégorie incompatible avec le type à la ligne ${candidate.line} : l’import a été annulé.`,
          );
        }
        if (!Number.isSafeInteger(candidate.amount) || candidate.amount <= 0) {
          throw new RepositoryError(
            `Montant invalide à la ligne ${candidate.line} : l’import a été annulé.`,
          );
        }
        if (!isValidISODate(candidate.date)) {
          throw new RepositoryError(
            `Date invalide à la ligne ${candidate.line} : l’import a été annulé.`,
          );
        }
        if (options.strategy === 'skip') {
          if (existingPrint.has(candidate.fingerprint) || batchPrint.has(candidate.fingerprint)) {
            skipped += 1;
            continue;
          }
        }
        batchPrint.add(candidate.fingerprint);
        records.push({
          id: createId('tx'),
          date: candidate.date,
          type: candidate.type,
          amount: candidate.amount,
          categoryId: candidate.categoryId,
          label: candidate.label,
          note: candidate.note,
          source: options.source,
          sourceId: candidate.sourceId,
          importBatchId: batchId,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
      if (records.length > 0) await database.transactions.bulkAdd(records);
      return { inserted: records.length, skippedDuplicates: skipped, batchId };
    },
  );
}

// ---------------------------------------------------------------------------
// Paramètres
// ---------------------------------------------------------------------------

export async function updateSettings(
  patch: Partial<Omit<AppSettings, 'id' | 'currency'>>,
  database: BudgetDatabase = getDatabase(),
): Promise<AppSettings> {
  const current = (await database.settings.get('app')) ?? { ...DEFAULT_SETTINGS };
  if (patch.theme && !['light', 'dark', 'system'].includes(patch.theme)) {
    throw new RepositoryError('Thème invalide.');
  }
  if (patch.dateFormat && !['DD/MM/YYYY', 'YYYY-MM-DD'].includes(patch.dateFormat)) {
    throw new RepositoryError('Format de date invalide.');
  }
  if (patch.numberFormat && !['fr-FR', 'en-US'].includes(patch.numberFormat)) {
    throw new RepositoryError('Format de nombre invalide.');
  }
  if (
    patch.initialBalance !== undefined &&
    (!Number.isSafeInteger(patch.initialBalance) ||
      !Number.isFinite(patch.initialBalance))
  ) {
    throw new RepositoryError('Le solde initial doit être un entier de FCFA.');
  }
  const updated: AppSettings = {
    ...current,
    ...patch,
    id: 'app',
    currency: 'XOF',
  };
  await database.settings.put(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Sauvegarde / restauration
// ---------------------------------------------------------------------------

export async function exportBackup(
  database: BudgetDatabase = getDatabase(),
): Promise<BackupData> {
  const snapshot = await loadSnapshot(database);
  return buildBackupData(snapshot);
}

/** Remplace toutes les données par celles d'une sauvegarde validée, atomiquement. */
export async function restoreBackup(
  backup: BackupData,
  database: BudgetDatabase = getDatabase(),
): Promise<{ transactions: number; categories: number; budgets: number; recurrences: number }> {
  const validation = validateBackupObject(backup);
  if (!validation.ok) {
    throw new RepositoryError(
      `Sauvegarde invalide : ${validation.errors[0] ?? 'format non reconnu'}`,
    );
  }
  const data = validation.data!;
  await database.transaction(
    'rw',
    [database.settings, database.categories, database.transactions, database.budgets, database.recurrences, database.meta],
    async () => {
      await Promise.all([
        database.settings.clear(),
        database.categories.clear(),
        database.transactions.clear(),
        database.budgets.clear(),
        database.recurrences.clear(),
      ]);
      await database.settings.put(data.settings);
      await database.categories.bulkPut(data.categories);
      await database.transactions.bulkPut(data.transactions);
      await database.budgets.bulkPut(data.budgets);
      await database.recurrences.bulkPut(data.recurrences);
      await database.meta.put({ key: 'seeded', value: '1' });
    },
  );
  return {
    transactions: data.transactions.length,
    categories: data.categories.length,
    budgets: data.budgets.length,
    recurrences: data.recurrences.length,
  };
}

export async function clearAllData(database: BudgetDatabase = getDatabase()): Promise<void> {
  await database.transaction(
    'rw',
    [database.settings, database.categories, database.transactions, database.budgets, database.recurrences, database.meta],
    async () => {
      await Promise.all([
        database.settings.clear(),
        database.categories.clear(),
        database.transactions.clear(),
        database.budgets.clear(),
        database.recurrences.clear(),
        database.meta.clear(),
      ]);
    },
  );
  const timestamp = nowISO();
  await database.settings.put({ ...DEFAULT_SETTINGS });
  await database.categories.bulkPut(buildDefaultCategories(timestamp));
  await database.meta.put({ key: 'seeded', value: '1' });
}
