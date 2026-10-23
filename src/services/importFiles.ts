import Papa from 'papaparse';
import readXlsxFile, { readSheetNames } from 'read-excel-file';
import { MAX_IMPORT_FILE_BYTES } from '../domain/importer';

export interface ParsedImportFile {
  fileName: string;
  headers: string[];
  rows: string[][];
  sheetName?: string;
  sheetCount?: number;
  warnings: string[];
}

export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportFileError';
  }
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value).replace(/^\uFEFF/, '');
}

function cleanHeaders(headerRow: string[], width: number): string[] {
  const headers: string[] = [];
  for (let index = 0; index < width; index += 1) {
    const label = (headerRow[index] ?? '').trim();
    headers.push(label || `Colonne ${index + 1}`);
  }
  return headers;
}

export async function parseImportFile(
  file: File,
  hasHeaderRow: boolean,
): Promise<ParsedImportFile> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new ImportFileError(
      `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo). Limite : ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} Mo.`,
    );
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) {
    throw new ImportFileError(
      'Format non pris en charge. Utilisez un fichier CSV ou XLSX (le format XLS ancien n’est pas pris en charge).',
    );
  }

  let matrix: string[][];
  let sheetName: string | undefined;
  let sheetCount: number | undefined;
  const warnings: string[] = [];

  if (name.endsWith('.csv')) {
    const text = await file.text();
    const result = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: false,
      dynamicTyping: false,
    });
    if (result.errors.length > 0) {
      const first = result.errors[0];
      warnings.push(
        `Avertissement CSV${first.row !== undefined ? ` (ligne ${first.row + 1})` : ''} : ${first.message}`,
      );
    }
    matrix = result.data.map((row) => (Array.isArray(row) ? row.map(cellToString) : []));
    if (matrix.length === 0) throw new ImportFileError('Le fichier CSV est vide.');
  } else {
    let rows: unknown[][];
    try {
      rows = (await readXlsxFile(file)) as unknown[][];
      const names = await readSheetNames(file);
      sheetCount = names.length;
      sheetName = names[0];
      if (names.length > 1) {
        warnings.push(
          `Le classeur contient ${names.length} feuilles. Seule la première (« ${names[0]} ») est importée.`,
        );
      }
    } catch (error) {
      throw new ImportFileError(
        `Impossible de lire le classeur XLSX. ${error instanceof Error ? error.message : ''}`.trim(),
      );
    }
    matrix = rows.map((row) => row.map(cellToString));
    if (matrix.length === 0) throw new ImportFileError('Le classeur ne contient aucune ligne.');
  }

  // Détermine la largeur maximale utile.
  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  if (width === 0) throw new ImportFileError('Le fichier ne contient aucune colonne exploitable.');

  const normalized = matrix.map((row) => {
    const padded = row.slice(0, width);
    while (padded.length < width) padded.push('');
    return padded;
  });

  const headerRow = normalized[0] ?? [];
  const headers = hasHeaderRow
    ? cleanHeaders(headerRow, width)
    : cleanHeaders([], width);
  const rows = hasHeaderRow ? normalized.slice(1) : normalized;

  if (rows.length === 0) {
    throw new ImportFileError('Le fichier ne contient aucune ligne de données.');
  }

  return { fileName: file.name, headers, rows, sheetName, sheetCount, warnings };
}
