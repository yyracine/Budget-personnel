import { describe, expect, it } from 'vitest';
import {
  analyzeImport,
  candidatesForImport,
  detectMapping,
  parseImportDate,
  transactionFingerprint,
  type ColumnMapping,
  type ImportOptions,
} from './importer';
import { category, transaction } from '../test/factories';

const food = category('food', 'Alimentation', 'expense');
const transport = category('transport', 'Transport', 'expense');
const salary = category('salary', 'Salaire', 'income');
const categories = [food, transport, salary];

const mapping: ColumnMapping = {
  date: 0,
  amount: 1,
  type: 2,
  category: 3,
  label: 4,
  note: 5,
  sourceId: 6,
};

const options: ImportOptions = { roundDecimals: false };

function row(
  date: string,
  amount: string,
  type: string,
  categoryName: string,
  label: string,
  note = '',
  sourceId = '',
): string[] {
  return [date, amount, type, categoryName, label, note, sourceId];
}

describe('detectMapping', () => {
  it('reconnaît les en-têtes français et anglais', () => {
    const french = detectMapping([
      'Date',
      'Montant',
      'Type',
      'Catégorie',
      'Libellé',
      'Note',
      'Référence',
    ]);
    expect(french).toEqual({
      date: 0,
      amount: 1,
      type: 2,
      category: 3,
      label: 4,
      note: 5,
      sourceId: 6,
    });
    const english = detectMapping(['Transaction Date', 'Amount', 'Category', 'Label', 'Notes']);
    expect(english.date).toBe(0);
    expect(english.amount).toBe(1);
    expect(english.category).toBe(2);
    expect(english.label).toBe(3);
    expect(english.note).toBe(4);
    expect(english.type).toBeNull();
  });
});

describe('parseImportDate', () => {
  it('accepte les formats explicites', () => {
    expect(parseImportDate('2026-03-31')).toBe('2026-03-31');
    expect(parseImportDate('31/03/2026')).toBe('2026-03-31');
    expect(parseImportDate('01-04-2026')).toBe('2026-04-01');
    expect(parseImportDate('2026/12/31')).toBe('2026-12-31');
  });

  it('rejette les dates impossibles et ambiguës', () => {
    expect(parseImportDate('31/02/2026')).toBeNull();
    expect(parseImportDate('2025-02-29')).toBeNull();
    expect(parseImportDate('03/31/2026')).toBeNull();
    expect(parseImportDate('')).toBeNull();
  });
});

describe('analyse d’import', () => {
  it('accepte des lignes valides', () => {
    const analysis = analyzeImport(
      [
        row('31/03/2026', '85 000', 'Dépense', 'Alimentation', 'Courses', 'Semaine'),
        row('2026-03-31', '300000', 'Revenu', 'Salaire', 'Salaire mars'),
      ],
      mapping,
      categories,
      [],
      options,
    );
    expect(analysis.mappingErrors).toEqual([]);
    expect(analysis.candidates).toHaveLength(2);
    expect(analysis.stats.invalidRows).toBe(0);
    expect(analysis.candidates[0]).toMatchObject({
      date: '2026-03-31',
      amount: 85000,
      categoryId: food.id,
      type: 'expense',
    });
    expect(analysis.candidates[1].type).toBe('income');
  });

  it('rejette chaque ligne invalide sans l’importer', () => {
    const analysis = analyzeImport(
      [
        row('31/02/2026', '1000', 'Dépense', 'Alimentation', 'Date impossible'),
        row('2026-03-01', 'abc', 'Dépense', 'Alimentation', 'Montant texte'),
        row('2026-03-01', '0', 'Dépense', 'Alimentation', 'Montant nul'),
        row('2026-03-01', '-5000', 'Dépense', 'Alimentation', 'Montant négatif'),
        row('2026-03-01', '1000', 'Inconnu', 'Alimentation', 'Type inconnu'),
        row('2026-03-01', '1000', 'Dépense', 'Inconnue', 'Catégorie inconnue'),
        row('2026-03-01', '1000', 'Revenu', 'Alimentation', 'Type incompatible'),
        row('', '', '', '', ''),
      ],
      mapping,
      categories,
      [],
      options,
    );
    expect(analysis.candidates).toHaveLength(0);
    expect(analysis.stats.invalidRows).toBe(7);
    expect(analysis.skippedEmpty).toBe(1);
    expect(analysis.issues.some((issue) => issue.field === 'date')).toBe(true);
    expect(analysis.issues.some((issue) => issue.field === 'amount')).toBe(true);
    expect(analysis.issues.some((issue) => issue.field === 'type')).toBe(true);
    expect(analysis.issues.some((issue) => issue.field === 'category')).toBe(true);
    expect(analysis.issues.every((issue) => issue.severity === 'error' || issue.severity === 'warning')).toBe(true);
  });

  it('refuse les décimales par défaut et les arrondit sur demande explicite', () => {
    const rows = [row('2026-03-01', '85 000,50', 'Dépense', 'Alimentation', 'Courses')];
    const strict = analyzeImport(rows, mapping, categories, [], options);
    expect(strict.candidates).toHaveLength(0);
    expect(strict.issues[0].message).toContain('décimal');
    expect(strict.issues[0].message.toLowerCase()).toContain('arrondi');

    const rounded = analyzeImport(rows, mapping, categories, [], { roundDecimals: true });
    expect(rounded.candidates).toHaveLength(1);
    expect(rounded.candidates[0].amount).toBe(85001);
    expect(rounded.roundedLines).toEqual([1]);
    expect(rounded.issues.some((issue) => issue.severity === 'warning')).toBe(true);
  });

  it('déduit le type depuis la catégorie avec un avertissement', () => {
    const analysis = analyzeImport(
      [row('2026-03-01', '5000', '', 'Transport', 'Taxi')],
      mapping,
      categories,
      [],
      options,
    );
    expect(analysis.candidates).toHaveLength(1);
    expect(analysis.candidates[0].type).toBe('expense');
    expect(analysis.issues.some((issue) => issue.severity === 'warning')).toBe(true);
  });

  it('utilise le nom de la catégorie quand le libellé est vide', () => {
    const analysis = analyzeImport(
      [row('2026-03-01', '5000', 'Dépense', 'Transport', '')],
      mapping,
      categories,
      [],
      options,
    );
    expect(analysis.candidates).toHaveLength(1);
    expect(analysis.candidates[0].label).toBe('Transport');
    expect(analysis.issues.some((issue) => issue.field === 'label' && issue.severity === 'warning')).toBe(true);
  });

  it('détecte les doublons avec les données existantes et dans le fichier', () => {
    const existing = [
      transaction({
        date: '2026-03-01',
        type: 'expense',
        amount: 5000,
        categoryId: food.id,
        label: 'Courses',
      }),
    ];
    const analysis = analyzeImport(
      [
        row('2026-03-01', '5000', 'Dépense', 'Alimentation', 'courses'),
        row('2026-03-02', '5000', 'Dépense', 'Alimentation', 'Courses'),
        row('2026-03-02', '5000', 'Dépense', 'Alimentation', 'Courses'),
      ],
      mapping,
      categories,
      existing,
      options,
    );
    expect(analysis.candidates).toHaveLength(3);
    expect(analysis.duplicates).toHaveLength(2);
    expect(analysis.duplicates[0].reason).toBe('existing');
    expect(analysis.duplicates[1].reason).toBe('file');
    expect(analysis.stats.duplicateRows).toBe(2);
  });

  it('ne considère pas deux montants identiques comme des doublons', () => {
    const existing = [
      transaction({
        date: '2026-03-01',
        type: 'expense',
        amount: 5000,
        categoryId: food.id,
        label: 'Courses',
      }),
    ];
    const analysis = analyzeImport(
      [row('2026-03-01', '5000', 'Dépense', 'Transport', 'Bus')],
      mapping,
      categories,
      existing,
      options,
    );
    expect(analysis.duplicates).toHaveLength(0);
    expect(analysis.candidates).toHaveLength(1);
  });

  it('permet d’ignorer ou de conserver les doublons', () => {
    const existing = [
      transaction({
        date: '2026-03-01',
        type: 'expense',
        amount: 5000,
        categoryId: food.id,
        label: 'Courses',
      }),
    ];
    const analysis = analyzeImport(
      [
        row('2026-03-01', '5000', 'Dépense', 'Alimentation', 'Courses'),
        row('2026-03-02', '7000', 'Dépense', 'Alimentation', 'Courses'),
      ],
      mapping,
      categories,
      existing,
      options,
    );
    expect(candidatesForImport(analysis, 'skip')).toHaveLength(1);
    expect(candidatesForImport(analysis, 'all')).toHaveLength(2);
  });

  it('signale les colonnes obligatoires manquantes', () => {
    const analysis = analyzeImport(
      [row('2026-03-01', '5000', 'Dépense', 'Alimentation', 'Courses')],
      { ...mapping, amount: null },
      categories,
      [],
      options,
    );
    expect(analysis.mappingErrors).toContain('La colonne « Montant » doit être associée.');
    expect(analysis.candidates).toHaveLength(0);
  });
});

describe('empreinte de doublon', () => {
  it('dépend de la date, du type, du montant, de la catégorie et du libellé', () => {
    const base = {
      date: '2026-03-01',
      type: 'expense' as const,
      amount: 5000,
      categoryId: 'food',
      label: 'Courses',
    };
    const fingerprint = transactionFingerprint(base);
    expect(transactionFingerprint({ ...base, label: ' courses ' })).toBe(fingerprint);
    expect(transactionFingerprint({ ...base, amount: 5001 })).not.toBe(fingerprint);
    expect(transactionFingerprint({ ...base, date: '2026-03-02' })).not.toBe(fingerprint);
    expect(transactionFingerprint({ ...base, categoryId: 'transport' })).not.toBe(fingerprint);
    expect(transactionFingerprint({ ...base, type: 'income' })).not.toBe(fingerprint);
  });
});
