import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, ensureInitialized, type BudgetDatabase } from './db';
import {
  clearAllData,
  createCategory,
  createRecurrence,
  createTransaction,
  deleteCategory,
  deleteTransaction,
  exportBackup,
  importCandidates,
  loadSnapshot,
  materializeRecurrence,
  restoreBackup,
  setCategoryActive,
  updateCategory,
  updateSettings,
  updateTransaction,
  upsertBudget,
} from './repository';
import { parseBackupJson, serializeBackup } from './backup';
import { summarizeTransactions } from '../domain/calculations';
import { transactionFingerprint, type ImportCandidate } from '../domain/importer';
import { makePeriod } from '../domain/periods';
import { TEST_NOW } from '../test/factories';

let database: BudgetDatabase;
let databaseName: string;

beforeEach(async () => {
  databaseName = `budget-test-${crypto.randomUUID()}`;
  database = createDatabase(databaseName);
  await ensureInitialized(database);
});

afterEach(async () => {
  database.close();
  await Dexie.delete(databaseName);
});

function foodCategoryId(categories: { id: string; name: string }[]): string {
  return categories.find((item) => item.name === 'Alimentation')!.id;
}

describe('initialisation et persistance (18.9)', () => {
  it('crée les catégories par défaut et les paramètres', async () => {
    const snapshot = await loadSnapshot(database);
    expect(snapshot.categories).toHaveLength(21);
    expect(snapshot.categories.filter((item) => item.type === 'income')).toHaveLength(7);
    expect(snapshot.categories.filter((item) => item.type === 'expense')).toHaveLength(14);
    expect(snapshot.settings).toMatchObject({ id: 'app', currency: 'XOF', initialBalance: 0 });
    await ensureInitialized(database);
    expect((await loadSnapshot(database)).categories).toHaveLength(21);
  });

  it('conserve les opérations après fermeture et réouverture de la base', async () => {
    const snapshot = await loadSnapshot(database);
    const food = foodCategoryId(snapshot.categories);
    await createTransaction(
      {
        date: '2026-01-10',
        type: 'expense',
        amount: 12000,
        categoryId: food,
        label: 'Courses',
        note: '',
      },
      database,
    );

    database.close();
    const reopened = createDatabase(databaseName);
    await ensureInitialized(reopened);
    const after = await loadSnapshot(reopened);
    expect(after.transactions).toHaveLength(1);
    expect(after.transactions[0]).toMatchObject({ amount: 12000, label: 'Courses' });
    reopened.close();
    database = reopened;
  });
});

describe('opérations (18.6)', () => {
  it('met à jour les indicateurs après modification et suppression', async () => {
    const snapshot = await loadSnapshot(database);
    const food = foodCategoryId(snapshot.categories);
    const salary = snapshot.categories.find((item) => item.name === 'Salaire')!;
    const january = makePeriod('month', 2026, 1);

    const income = await createTransaction(
      {
        date: '2026-01-02',
        type: 'income',
        amount: 300000,
        categoryId: salary.id,
        label: 'Salaire',
        note: '',
      },
      database,
    );
    const expense = await createTransaction(
      {
        date: '2026-01-05',
        type: 'expense',
        amount: 80000,
        categoryId: food,
        label: 'Courses',
        note: '',
      },
      database,
    );

    let current = await loadSnapshot(database);
    expect(summarizeTransactions(current.transactions, january)).toMatchObject({
      income: 300000,
      expense: 80000,
      net: 220000,
    });

    await updateTransaction(
      expense.id,
      {
        date: '2026-01-06',
        type: 'expense',
        amount: 100000,
        categoryId: food,
        label: 'Courses corrigées',
        note: 'Correction',
      },
      database,
    );
    current = await loadSnapshot(database);
    expect(summarizeTransactions(current.transactions, january)).toMatchObject({
      expense: 100000,
      net: 200000,
    });

    await deleteTransaction(income.id, database);
    current = await loadSnapshot(database);
    expect(summarizeTransactions(current.transactions, january)).toMatchObject({
      income: 0,
      expense: 100000,
      net: -100000,
      count: 1,
    });
  });

  it('refuse un montant non entier et une catégorie de type opposé', async () => {
    const snapshot = await loadSnapshot(database);
    const food = foodCategoryId(snapshot.categories);
    await expect(
      createTransaction(
        {
          date: '2026-01-01',
          type: 'expense',
          amount: 10.5,
          categoryId: food,
          label: 'Test',
          note: '',
        },
        database,
      ),
    ).rejects.toThrow();

    await expect(
      createTransaction(
        {
          date: '2026-01-01',
          type: 'income',
          amount: 10000,
          categoryId: food,
          label: 'Test',
          note: '',
        },
        database,
      ),
    ).rejects.toThrow(/catégorie/i);
  });
});

describe('catégories', () => {
  it('crée, modifie, désactive et supprime une catégorie inutilisée', async () => {
    const created = await createCategory(
      {
        name: 'Animaux',
        type: 'expense',
        color: '#123456',
        icon: 'heart',
        description: 'Nourriture et vétérinaire',
        isActive: true,
      },
      database,
    );
    expect(created.name).toBe('Animaux');
    await expect(
      createCategory(
        {
          name: 'animaux',
          type: 'expense',
          color: '#123456',
          icon: 'heart',
          description: '',
          isActive: true,
        },
        database,
      ),
    ).rejects.toThrow(/déjà ce nom/i);

    const updated = await updateCategory(
      created.id,
      {
        name: 'Animaux domestiques',
        type: 'expense',
        color: '#654321',
        icon: 'heart',
        description: 'Soins',
        isActive: true,
      },
      database,
    );
    expect(updated.name).toBe('Animaux domestiques');

    await setCategoryActive(created.id, false, database);
    expect((await database.categories.get(created.id))!.isActive).toBe(false);
    await deleteCategory(created.id, database);
    expect(await database.categories.get(created.id)).toBeUndefined();
  });

  it('refuse la suppression d’une catégorie utilisée', async () => {
    const snapshot = await loadSnapshot(database);
    const food = snapshot.categories.find((item) => item.name === 'Alimentation')!;
    await createTransaction(
      {
        date: '2026-01-05',
        type: 'expense',
        amount: 5000,
        categoryId: food.id,
        label: 'Courses',
        note: '',
      },
      database,
    );
    await expect(deleteCategory(food.id, database)).rejects.toThrow(/utilisée/i);
  });

  it('interdit de changer le type d’une catégorie utilisée', async () => {
    const snapshot = await loadSnapshot(database);
    const food = snapshot.categories.find((item) => item.name === 'Alimentation')!;
    await createTransaction(
      {
        date: '2026-01-05',
        type: 'expense',
        amount: 5000,
        categoryId: food.id,
        label: 'Courses',
        note: '',
      },
      database,
    );
    await expect(
      updateCategory(
        food.id,
        { ...food, type: 'income' },
        database,
      ),
    ).rejects.toThrow(/type/i);
  });
});

describe('budgets', () => {
  it('crée un budget unique, le modifie puis le supprime', async () => {
    const snapshot = await loadSnapshot(database);
    const food = foodCategoryId(snapshot.categories);
    const budget = await upsertBudget(
      {
        categoryId: food,
        periodStart: '2026-01-01',
        amount: 100000,
        alertThreshold: 80,
      },
      database,
    );
    expect(budget.budgetKey).toBe(`${food}|month|2026-01-01`);

    await expect(
      upsertBudget(
        { categoryId: food, periodStart: '2026-01-01', amount: 50000, alertThreshold: 80 },
        database,
      ),
    ).rejects.toThrow(/existe déjà/i);

    await upsertBudget(
      {
        id: budget.id,
        categoryId: food,
        periodStart: '2026-01-01',
        amount: 120000,
        alertThreshold: 90,
      },
      database,
    );
    expect((await database.budgets.get(budget.id))!.amount).toBe(120000);
    await database.budgets.delete(budget.id);
    expect(await database.budgets.count()).toBe(0);
  });
});

describe('récurrences (18.7)', () => {
  async function createRule() {
    const snapshot = await loadSnapshot(database);
    const housing = snapshot.categories.find((item) => item.name === 'Logement et loyer')!;
    return createRecurrence(
      {
        type: 'expense',
        amount: 75000,
        categoryId: housing.id,
        label: 'Loyer',
        note: '',
        frequency: 'monthly',
        startDate: '2026-01-31',
        isActive: true,
      },
      database,
    );
  }

  it('ne compte aucune opération avant matérialisation', async () => {
    await createRule();
    const snapshot = await loadSnapshot(database);
    expect(snapshot.transactions).toHaveLength(0);
    expect(snapshot.recurrences).toHaveLength(1);
  });

  it('matérialise la prochaine échéance et avance au dernier jour du mois', async () => {
    const rule = await createRule();
    const result = await materializeRecurrence(rule.id, database);
    expect(result.transaction).toMatchObject({
      date: '2026-01-31',
      amount: 75000,
      source: 'recurrence',
      occurrenceKey: `${rule.id}|2026-01-31`,
    });
    expect(result.nextOccurrence).toBe('2026-02-28');

    const second = await materializeRecurrence(rule.id, database);
    expect(second.transaction.date).toBe('2026-02-28');
    expect(second.nextOccurrence).toBe('2026-03-31');
    expect(await database.transactions.count()).toBe(2);
  });

  it('empêche la double matérialisation de la même échéance', async () => {
    const rule = await createRule();
    await materializeRecurrence(rule.id, database);
    const current = (await database.recurrences.get(rule.id))!;
    await database.recurrences.put({ ...current, nextOccurrence: '2026-01-31' });
    await expect(materializeRecurrence(rule.id, database)).rejects.toThrow(/déjà été matérialisée/i);
    expect(await database.transactions.count()).toBe(1);
  });

  it('refuse la matérialisation d’une règle suspendue', async () => {
    const snapshot = await loadSnapshot(database);
    const housing = snapshot.categories.find((item) => item.name === 'Logement et loyer')!;
    const rule = await createRecurrence(
      {
        type: 'expense',
        amount: 75000,
        categoryId: housing.id,
        label: 'Loyer',
        note: '',
        frequency: 'monthly',
        startDate: '2026-01-31',
        isActive: false,
      },
      database,
    );
    await expect(materializeRecurrence(rule.id, database)).rejects.toThrow(/suspendue/i);
  });
});

describe('import transactionnel (18.8)', () => {
  function candidate(overrides: Partial<ImportCandidate> = {}): ImportCandidate {
    const base = {
      line: 1,
      date: '2026-01-05',
      type: 'expense' as const,
      amount: 5000,
      categoryId: '',
      categoryName: 'Alimentation',
      label: 'Courses',
      note: '',
      fingerprint: '',
    };
    const merged = { ...base, ...overrides };
    merged.fingerprint =
      overrides.fingerprint ??
      transactionFingerprint({
        date: merged.date,
        type: merged.type,
        amount: merged.amount,
        categoryId: merged.categoryId,
        label: merged.label,
      });
    return merged;
  }

  it('importe en ignorant les doublons', async () => {
    const snapshot = await loadSnapshot(database);
    const food = foodCategoryId(snapshot.categories);
    await createTransaction(
      {
        date: '2026-01-05',
        type: 'expense',
        amount: 5000,
        categoryId: food,
        label: 'Courses',
        note: '',
      },
      database,
    );
    const result = await importCandidates(
      [
        candidate({ line: 1, categoryId: food }),
        candidate({ line: 2, date: '2026-01-06', categoryId: food }),
      ],
      { strategy: 'skip', source: 'CSV' },
      database,
    );
    expect(result.inserted).toBe(1);
    expect(result.skippedDuplicates).toBe(1);
    const after = await loadSnapshot(database);
    expect(after.transactions).toHaveLength(2);
    const imported = after.transactions.filter((transaction) => transaction.source === 'CSV');
    expect(imported).toHaveLength(1);
    expect(imported[0].date).toBe('2026-01-06');
    expect(after.transactions.some((transaction) => transaction.source === 'manual')).toBe(true);
  });

  it('annule tout l’import si une ligne est invalide', async () => {
    const snapshot = await loadSnapshot(database);
    const food = foodCategoryId(snapshot.categories);
    await expect(
      importCandidates(
        [
          candidate({ line: 1, categoryId: food }),
          candidate({ line: 2, categoryId: 'categorie-inexistante' }),
        ],
        { strategy: 'all', source: 'CSV' },
        database,
      ),
    ).rejects.toThrow(/annulé/i);
    expect(await database.transactions.count()).toBe(0);
  });
});

describe('sauvegarde et restauration (15)', () => {
  it('exporte, valide et restaure toutes les données', async () => {
    const snapshot = await loadSnapshot(database);
    const food = snapshot.categories.find((item) => item.name === 'Alimentation')!;
    const salary = snapshot.categories.find((item) => item.name === 'Salaire')!;
    await createTransaction(
      {
        date: '2026-01-05',
        type: 'expense',
        amount: 5000,
        categoryId: food.id,
        label: 'Courses',
        note: 'note',
      },
      database,
    );
    await createTransaction(
      {
        date: '2026-01-02',
        type: 'income',
        amount: 300000,
        categoryId: salary.id,
        label: 'Salaire',
        note: '',
      },
      database,
    );
    await upsertBudget(
      { categoryId: food.id, periodStart: '2026-01-01', amount: 100000, alertThreshold: 80 },
      database,
    );
    await createRecurrence(
      {
        type: 'expense',
        amount: 75000,
        categoryId: food.id,
        label: 'Loyer',
        note: '',
        frequency: 'monthly',
        startDate: '2026-01-31',
        isActive: true,
      },
      database,
    );
    await updateSettings({ initialBalance: 50000 }, database);

    const backup = await exportBackup(database);
    const validation = parseBackupJson(serializeBackup(backup));
    expect(validation.ok).toBe(true);
    const parsed = validation.data!;

    await clearAllData(database);
    const cleared = await loadSnapshot(database);
    expect(cleared.transactions).toHaveLength(0);

    const restored = await restoreBackup(parsed, database);
    expect(restored.transactions).toBe(2);
    const after = await loadSnapshot(database);
    expect(after.transactions).toHaveLength(2);
    expect(after.budgets).toHaveLength(1);
    expect(after.recurrences).toHaveLength(1);
    expect(after.settings.initialBalance).toBe(50000);
    expect(after.categories).toHaveLength(backup.categories.length);
  });

  it('refuse une sauvegarde incohérente sans modifier les données', async () => {
    const backup = await exportBackup(database);
    const broken = {
      ...backup,
      transactions: [
        {
          ...backup.transactions[0],
          id: 'orphan',
          categoryId: 'categorie-absente',
          date: '2026-01-01',
          type: 'expense',
          amount: 1000,
          label: 'Orpheline',
          note: '',
          source: 'manual',
          createdAt: TEST_NOW,
          updatedAt: TEST_NOW,
        },
      ],
    };
    await expect(restoreBackup(broken as never, database)).rejects.toThrow();
    expect((await loadSnapshot(database)).transactions).toHaveLength(0);
  });
});

describe('paramètres', () => {
  it('met à jour le solde initial et les formats', async () => {
    await updateSettings({ initialBalance: 50000, dateFormat: 'YYYY-MM-DD' }, database);
    const snapshot = await loadSnapshot(database);
    expect(snapshot.settings.initialBalance).toBe(50000);
    expect(snapshot.settings.dateFormat).toBe('YYYY-MM-DD');
    await expect(updateSettings({ initialBalance: 10.5 }, database)).rejects.toThrow();
  });
});

describe('performance de lecture', () => {
  it('charge un jeu de 1 000 opérations et calcule instantanément', async () => {
    const snapshot = await loadSnapshot(database);
    const food = foodCategoryId(snapshot.categories);
    const records = Array.from({ length: 1000 }, (_, index) => ({
      id: `perf-${index}`,
      date: `2026-${String((index % 12) + 1).padStart(2, '0')}-15`,
      type: 'expense' as const,
      amount: 1000 + index,
      categoryId: food,
      label: `Opération ${index}`,
      note: '',
      source: 'manual',
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    }));
    await database.transactions.bulkAdd(records);
    const loaded = await loadSnapshot(database);
    const started = performance.now();
    const summary = summarizeTransactions(loaded.transactions, makePeriod('year', 2026));
    const elapsed = performance.now() - started;
    expect(summary.count).toBe(1000);
    expect(summary.expense).toBe(records.reduce((sum, record) => sum + record.amount, 0));
    expect(elapsed).toBeLessThan(100);
  });
});
