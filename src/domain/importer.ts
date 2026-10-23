/**
 * Import de données tabulaires (CSV / XLSX).
 *
 * Ce module ne lit pas les fichiers : il reçoit une matrice de chaînes déjà
 * extraite, associe les colonnes, valide chaque ligne et détecte les doublons.
 * Aucune ligne invalide n'est importée silencieusement.
 */

import type { Category, ISODate, Transaction, TransactionType } from './types';
import { makeISODate } from './periods';
import { parseAmount, roundPercent } from './money';
import { sanitizeText } from './validation';

export interface ColumnMapping {
  date: number | null;
  amount: number | null;
  type: number | null;
  category: number | null;
  label: number | null;
  note: number | null;
  sourceId: number | null;
}

export interface ImportOptions {
  /** Arrondit explicitement les montants décimaux à l'unité, avec rapport. */
  roundDecimals: boolean;
  /** Max de lignes analysées (protections contre les fichiers énormes). */
  maxRows?: number;
}

export interface ImportRowIssue {
  line: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
  raw?: string;
}

export interface ImportCandidate {
  line: number;
  date: ISODate;
  type: TransactionType;
  amount: number;
  categoryId: string;
  categoryName: string;
  label: string;
  note: string;
  sourceId?: string;
  fingerprint: string;
}

export interface ImportDuplicate {
  line: number;
  reason: 'existing' | 'file';
  message: string;
  fingerprint: string;
}

export interface ImportAnalysis {
  candidates: ImportCandidate[];
  issues: ImportRowIssue[];
  duplicates: ImportDuplicate[];
  skippedEmpty: number;
  roundedLines: number[];
  truncated: boolean;
  mappingErrors: string[];
  stats: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    duplicateRows: number;
  };
}

export const MAX_IMPORT_ROWS = 20_000;
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

export const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  date: 'Date',
  amount: 'Montant',
  type: 'Type',
  category: 'Catégorie',
  label: 'Libellé',
  note: 'Note',
  sourceId: 'Identifiant source',
};

export const COLUMN_ALIASES: Record<keyof ColumnMapping, string[]> = {
  date: ['date', 'dates', 'date operation', 'date de l operation', 'jour', 'transaction date'],
  amount: ['montant', 'montants', 'amount', 'valeur', 'somme', 'total'],
  type: ['type', 'sens', 'nature', 'operation', 'type operation', 'type de operation'],
  category: ['categorie', 'categories', 'category', 'rubrique', 'poste'],
  label: [
    'libelle',
    'label',
    'description',
    'intitule',
    'designation',
    'motif',
    'nom',
    'objet',
  ],
  note: ['note', 'notes', 'commentaire', 'commentaires', 'memo'],
  sourceId: [
    'id',
    'identifiant',
    'reference',
    'ref',
    'source id',
    'transaction id',
    'identifiant source',
  ],
};

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function detectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    date: null,
    amount: null,
    type: null,
    category: null,
    label: null,
    note: null,
    sourceId: null,
  };
  const normalized = headers.map(normalizeName);
  const used = new Set<number>();
  (Object.keys(COLUMN_ALIASES) as (keyof ColumnMapping)[]).forEach((field) => {
    for (const alias of COLUMN_ALIASES[field]) {
      const index = normalized.findIndex(
        (header, position) => !used.has(position) && header === alias,
      );
      if (index >= 0) {
        mapping[field] = index;
        used.add(index);
        break;
      }
    }
  });
  if (mapping.date === null) {
    const index = normalized.findIndex((header, position) => !used.has(position) && header.startsWith('date'));
    if (index >= 0) {
      mapping.date = index;
      used.add(index);
    }
  }
  if (mapping.amount === null) {
    const index = normalized.findIndex(
      (header, position) =>
        !used.has(position) &&
        (header.includes('montant') || header.includes('amount') || header === 'valeur'),
    );
    if (index >= 0) {
      mapping.amount = index;
      used.add(index);
    }
  }
  return mapping;
}

export function validateMapping(mapping: ColumnMapping): string[] {
  const errors: string[] = [];
  if (mapping.date === null) errors.push('La colonne « Date » doit être associée.');
  if (mapping.amount === null) errors.push('La colonne « Montant » doit être associée.');
  if (mapping.category === null) errors.push('La colonne « Catégorie » doit être associée.');
  return errors;
}

const TYPE_ALIASES: Record<string, TransactionType> = {
  income: 'income',
  revenu: 'income',
  revenus: 'income',
  entree: 'income',
  entrees: 'income',
  recette: 'income',
  recettes: 'income',
  credit: 'income',
  encaissement: 'income',
  expense: 'expense',
  depense: 'expense',
  depenses: 'expense',
  sortie: 'expense',
  sorties: 'expense',
  debit: 'expense',
  decaissement: 'expense',
  charge: 'expense',
  charges: 'expense',
};

export function parseType(value: string): TransactionType | null {
  return TYPE_ALIASES[normalizeName(value)] ?? null;
}

/**
 * Dates acceptées : YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, DD-MM-YYYY,
 * DD.MM.YYYY. Aucune interprétation ambiguë mois/jour n'est faite.
 */
export function parseImportDate(value: string): ISODate | null {
  const text = value.trim();
  if (!text) return null;

  const isoMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    try {
      const iso = makeISODate(year, month, day);
      return iso;
    } catch {
      return null;
    }
  }

  const frenchMatch = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (frenchMatch) {
    const day = Number(frenchMatch[1]);
    const month = Number(frenchMatch[2]);
    const year = Number(frenchMatch[3]);
    try {
      return makeISODate(year, month, day);
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeLabelForFingerprint(label: string): string {
  return normalizeName(label);
}

export function transactionFingerprint(parts: {
  date: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  label: string;
}): string {
  return [
    parts.date,
    parts.type,
    parts.amount,
    parts.categoryId,
    normalizeLabelForFingerprint(parts.label),
  ].join('|');
}

export function fingerprintTransaction(transaction: Transaction): string {
  return transactionFingerprint(transaction);
}

function cell(row: string[], index: number | null): string {
  if (index === null) return '';
  return (row[index] ?? '').toString().replace(/^\uFEFF/, '').trim();
}

function isBlankRow(row: string[]): boolean {
  return row.every((value) => (value ?? '').toString().trim() === '');
}

function findCategory(
  name: string,
  categories: Category[],
  type: TransactionType | null,
): Category | null {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  const matches = categories.filter(
    (category) => normalizeName(category.name) === normalized,
  );
  if (type) {
    return matches.find((category) => category.type === type) ?? null;
  }
  return matches[0] ?? null;
}

export function analyzeImport(
  rows: string[][],
  mapping: ColumnMapping,
  categories: Category[],
  existingTransactions: Transaction[],
  options: ImportOptions = { roundDecimals: false },
): ImportAnalysis {
  const mappingErrors = validateMapping(mapping);
  const maxRows = Math.min(options.maxRows ?? MAX_IMPORT_ROWS, MAX_IMPORT_ROWS);
  const truncated = rows.length > maxRows;

  const existingFingerprints = new Set(existingTransactions.map(fingerprintTransaction));
  const fileFingerprints = new Map<string, number>();

  const issues: ImportRowIssue[] = [];
  const candidates: ImportCandidate[] = [];
  const duplicates: ImportDuplicate[] = [];
  const roundedLines: number[] = [];
  let skippedEmpty = 0;
  let validRows = 0;
  let invalidRows = 0;

  if (mappingErrors.length > 0) {
    return {
      candidates: [],
      issues: [],
      duplicates: [],
      skippedEmpty: 0,
      roundedLines: [],
      truncated,
      mappingErrors,
      stats: {
        totalRows: rows.length,
        validRows: 0,
        invalidRows: 0,
        duplicateRows: 0,
      },
    };
  }

  rows.forEach((row, rowIndex) => {
    if (rowIndex >= maxRows) return;
    const line = rowIndex + 1;
    if (isBlankRow(row)) {
      skippedEmpty += 1;
      return;
    }

    const rowIssues: ImportRowIssue[] = [];
    const addError = (field: string, message: string, raw?: string) => {
      rowIssues.push({ line, field, message, severity: 'error', raw });
    };
    const addWarning = (field: string, message: string, raw?: string) => {
      rowIssues.push({ line, field, message, severity: 'warning', raw });
    };

    const rawDate = cell(row, mapping.date);
    const date = parseImportDate(rawDate);
    if (!date) {
      addError('date', 'Date illisible (formats acceptés : AAAA-MM-JJ ou JJ/MM/AAAA).', rawDate);
    }

    const rawAmount = cell(row, mapping.amount);
    let amount: number | null = null;
    const parsedAmount = parseAmount(rawAmount);
    if (parsedAmount.ok) {
      amount = parsedAmount.amount;
    } else if (parsedAmount.code === 'decimal') {
      if (options.roundDecimals && parsedAmount.rounded !== null && parsedAmount.rounded > 0) {
        amount = parsedAmount.rounded;
        roundedLines.push(line);
        addWarning(
          'amount',
          `Montant décimal arrondi de ${rawAmount} à ${amount} FCFA (arrondi demandé).`,
          rawAmount,
        );
      } else {
        addError(
          'amount',
          `Montant décimal (${rawAmount}) : le XOF n'a pas de décimales. Activez l'arrondi explicite ou corrigez la valeur.`,
          rawAmount,
        );
      }
    } else {
      const labels: Record<string, string> = {
        empty: 'Montant manquant.',
        invalid: 'Montant non numérique.',
        zero: 'Montant nul interdit.',
        negative: 'Montant négatif interdit.',
        'too-large': 'Montant trop élevé.',
      };
      addError(
        'amount',
        `${labels[parsedAmount.code] ?? 'Montant invalide.'} Valeur : « ${rawAmount} ».`,
        rawAmount,
      );
    }

    const rawCategory = cell(row, mapping.category);
    const rawType = cell(row, mapping.type);
    const hasTypeCell = rawType.trim().length > 0;
    let type: TransactionType | null = hasTypeCell ? parseType(rawType) : null;
    if (hasTypeCell && !type) {
      addError('type', `Type inconnu : « ${rawType} ».`, rawType);
    }

    let category: Category | null = null;
    if (!rawCategory) {
      addError('category', 'Catégorie manquante.');
    } else {
      category = findCategory(rawCategory, categories, type);
      if (!category) {
        const existsWithOtherType = categories.some(
          (item) => normalizeName(item.name) === normalizeName(rawCategory),
        );
        addError(
          'category',
          existsWithOtherType
            ? `La catégorie « ${rawCategory} » existe, mais pas pour ce type d'opération.`
            : `Catégorie inconnue : « ${rawCategory} ». Créez-la avant l'import.`,
          rawCategory,
        );
      }
    }

    // Déduction uniquement lorsque la colonne type est vide : un type explicite
    // mais illisible ne doit jamais être remplacé silencieusement.
    if (!hasTypeCell && !type && category) {
      type = category.type;
      addWarning('type', `Type déduit de la catégorie : ${category.type === 'income' ? 'revenu' : 'dépense'}.`);
    }
    if (!type) {
      addError('type', 'Type manquant.');
    }
    if (type && category && category.type !== type) {
      addError(
        'category',
        `La catégorie « ${category.name} » est une catégorie de ${category.type === 'income' ? 'revenu' : 'dépense'}, incompatible avec ce type.`,
      );
    }

    const rawLabel = cell(row, mapping.label);
    const label = sanitizeText(rawLabel, 120) || category?.name || '';
    if (!rawLabel && category) {
      addWarning('label', 'Libellé vide : le nom de la catégorie est utilisé.', '');
    } else if (!label) {
      addError('label', 'Libellé manquant.');
    }

    const note = sanitizeText(cell(row, mapping.note), 500);
    const sourceId = sanitizeText(cell(row, mapping.sourceId), 120) || undefined;

    if (!date || amount === null || !type || !category || category.type !== type || !label) {
      invalidRows += 1;
      issues.push(...rowIssues);
      return;
    }

    validRows += 1;
    const fingerprint = transactionFingerprint({
      date,
      type,
      amount,
      categoryId: category.id,
      label,
    });

    if (existingFingerprints.has(fingerprint)) {
      duplicates.push({
        line,
        reason: 'existing',
        message: 'Opération déjà présente dans l’application.',
        fingerprint,
      });
    } else if (fileFingerprints.has(fingerprint)) {
      duplicates.push({
        line,
        reason: 'file',
        message: `Doublon du fichier (déjà présent à la ligne ${fileFingerprints.get(fingerprint)}).`,
        fingerprint,
      });
    } else {
      fileFingerprints.set(fingerprint, line);
    }

    issues.push(...rowIssues);
    candidates.push({
      line,
      date,
      type,
      amount,
      categoryId: category.id,
      categoryName: category.name,
      label,
      note,
      sourceId,
      fingerprint,
    });
  });

  return {
    candidates,
    issues,
    duplicates,
    skippedEmpty,
    roundedLines,
    truncated,
    mappingErrors,
    stats: {
      totalRows: rows.length,
      validRows,
      invalidRows,
      duplicateRows: duplicates.length,
    },
  };
}

export function duplicateShare(analysis: ImportAnalysis): number | null {
  if (analysis.stats.validRows === 0) return null;
  return roundPercent((analysis.stats.duplicateRows / analysis.stats.validRows) * 100, 2);
}

/**
 * Sélectionne les lignes à importer. `skip` retire les doublons identifiés,
 * `all` les conserve (choix explicite de l'utilisateur).
 */
export function candidatesForImport(
  analysis: ImportAnalysis,
  strategy: 'skip' | 'all',
): ImportCandidate[] {
  if (strategy === 'all') return analysis.candidates;
  const duplicateLines = new Set(analysis.duplicates.map((duplicate) => duplicate.line));
  return analysis.candidates.filter((candidate) => !duplicateLines.has(candidate.line));
}

export function candidateToTransaction(
  candidate: ImportCandidate,
  source: string,
  batchId: string,
  now: string = new Date().toISOString(),
): Transaction {
  return {
    id: crypto.randomUUID(),
    date: candidate.date,
    type: candidate.type,
    amount: candidate.amount,
    categoryId: candidate.categoryId,
    label: candidate.label,
    note: candidate.note,
    source,
    sourceId: candidate.sourceId,
    importBatchId: batchId,
    createdAt: now,
    updatedAt: now,
  };
}

