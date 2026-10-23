import Dexie, { type Table } from 'dexie';
import type {
  AppSettings,
  Budget,
  Category,
  RecurrenceRule,
  Transaction,
} from '../domain/types';
import {
  APP_DATA_VERSION,
  DATABASE_NAME,
  DEFAULT_SETTINGS,
  buildDefaultCategories,
} from './defaults';

export interface MetaEntry {
  key: string;
  value: string;
}

/**
 * Base IndexedDB locale. Le schéma est versionné par Dexie :
 * toute évolution future doit ajouter `version(2).stores(...).upgrade(...)`
 * sans modifier la version 1.
 */
export class BudgetDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  budgets!: Table<Budget, string>;
  recurrences!: Table<RecurrenceRule, string>;
  settings!: Table<AppSettings, string>;
  meta!: Table<MetaEntry, string>;

  constructor(name: string = DATABASE_NAME) {
    super(name);
    this.version(1).stores({
      transactions:
        'id, date, type, categoryId, source, recurrenceRuleId, importBatchId, &occurrenceKey',
      categories: 'id, type, isActive, name',
      budgets: 'id, categoryId, periodStart, &budgetKey',
      recurrences: 'id, isActive, nextOccurrence',
      settings: 'id',
      meta: 'key',
    });
  }
}

let shared: BudgetDatabase | null = null;

export function getDatabase(): BudgetDatabase {
  if (!shared) shared = new BudgetDatabase();
  return shared;
}

export function createDatabase(name: string): BudgetDatabase {
  return new BudgetDatabase(name);
}

export async function ensureInitialized(database: BudgetDatabase = getDatabase()): Promise<void> {
  await database.transaction(
    'rw',
    database.settings,
    database.categories,
    database.meta,
    async () => {
      const seeded = await database.meta.get('seeded');
      const categoryCount = await database.categories.count();
      if (!seeded && categoryCount === 0) {
        const now = new Date().toISOString();
        await database.categories.bulkPut(buildDefaultCategories(now));
        await database.meta.put({ key: 'seeded', value: '1' });
      }

      const settings = await database.settings.get('app');
      if (!settings) {
        await database.settings.put({ ...DEFAULT_SETTINGS });
      } else {
        await database.settings.put({
          ...DEFAULT_SETTINGS,
          ...settings,
          id: 'app',
          currency: 'XOF',
          version: APP_DATA_VERSION,
        });
      }
    },
  );
}

export async function closeSharedDatabase(): Promise<void> {
  if (shared) {
    shared.close();
    shared = null;
  }
}
