/**
 * Manipulation des montants monétaires.
 *
 * Règle absolue : un montant est un nombre ENTIER de francs CFA (XOF).
 * Aucun calcul monétaire ne s'appuie sur des flottants décimaux.
 */

export const CURRENCY_CODE = 'XOF';
export const CURRENCY_SYMBOL = 'FCFA';

type NumberFormat = 'fr-FR' | 'en-US';

/**
 * Format d’affichage des nombres, configuré depuis les paramètres.
 * Il n’affecte que le rendu : jamais les calculs ni les montants stockés.
 */
let activeNumberFormat: NumberFormat = 'fr-FR';

export function setDisplayNumberFormat(format: NumberFormat): void {
  activeNumberFormat = format;
}

export function getDisplayNumberFormat(): NumberFormat {
  return activeNumberFormat;
}

export type AmountErrorCode =
  | 'empty'
  | 'invalid'
  | 'zero'
  | 'negative'
  | 'decimal'
  | 'too-large';

export type AmountParseResult =
  | { ok: true; amount: number }
  | { ok: false; code: AmountErrorCode; rounded: number | null };

export const AMOUNT_ERROR_MESSAGES: Record<AmountErrorCode, string> = {
  empty: 'Le montant est obligatoire.',
  invalid: 'Le montant doit être un nombre valide (ex. 25 000).',
  zero: 'Le montant doit être strictement supérieur à zéro.',
  negative: 'Le montant doit être strictement positif.',
  decimal:
    'Le franc CFA (XOF) ne comporte pas de décimales. Saisissez un montant entier.',
  'too-large': 'Le montant dépasse la limite autorisée.',
};

const CURRENCY_SUFFIX = /(FCFA|XOF|CFA|FRANCS?)$/i;

/**
 * Convertit une saisie utilisateur en entier de FCFA.
 *
 * Séparateurs acceptés :
 * - espace (y compris insécable) et apostrophe comme séparateurs de milliers ;
 * - virgule comme séparateur décimal (convention française) ;
 * - point : décimal s'il est suivi de 1 ou 2 chiffres, sinon séparateur de
 *   milliers s'il est suivi de groupes de 3 chiffres (ex. « 300.000 »).
 *
 * Un montant avec une partie décimale non nulle est refusé avec le code
 * `decimal` : aucune donnée n'est arrondie silencieusement. Le champ `rounded`
 * fournit la valeur arrondie afin de l'afficher à l'utilisateur.
 */
export function parseAmount(raw: string | number | null | undefined): AmountParseResult {
  if (raw === null || raw === undefined) return { ok: false, code: 'empty', rounded: null };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { ok: false, code: 'invalid', rounded: null };
    if (!Number.isSafeInteger(raw)) {
      if (Math.abs(raw) > Number.MAX_SAFE_INTEGER) {
        return { ok: false, code: 'too-large', rounded: null };
      }
      return { ok: false, code: 'decimal', rounded: Math.round(raw) };
    }
    if (raw === 0) return { ok: false, code: 'zero', rounded: null };
    if (raw < 0) return { ok: false, code: 'negative', rounded: null };
    return { ok: true, amount: raw };
  }

  let text = raw.trim();
  if (!text) return { ok: false, code: 'empty', rounded: null };

  // Retire la devise et les espaces de groupement.
  text = text.replace(CURRENCY_SUFFIX, '').trim();
  text = text.replace(/[\s\u00a0\u202f']/g, '');
  if (!text) return { ok: false, code: 'invalid', rounded: null };

  let negative = false;
  if (text.startsWith('+')) {
    text = text.slice(1);
  } else if (text.startsWith('-') || text.startsWith('\u2212')) {
    negative = true;
    text = text.slice(1);
  }

  if (!text || !/^[0-9.,]+$/.test(text)) return { ok: false, code: 'invalid', rounded: null };
  if (!/[0-9]/.test(text)) return { ok: false, code: 'invalid', rounded: null };

  if (text.includes(',')) {
    if ((text.match(/,/g) ?? []).length > 1) return { ok: false, code: 'invalid', rounded: null };
    text = text.replace(/\./g, '');
    text = text.replace(',', '.');
  } else if (text.includes('.')) {
    const parts = text.split('.');
    if (parts.length > 1) {
      const groups = parts.slice(1);
      const grouping = groups.every((part) => part.length === 3);
      if (grouping) {
        text = parts.join('');
      } else if (parts.length > 2) {
        // Mélange ambigu de séparateurs.
        return { ok: false, code: 'invalid', rounded: null };
      }
    }
  }

  const [integerPartRaw = '0', fractionPart = ''] = text.split('.');
  if (!/^\d+$/.test(integerPartRaw) || !/^\d*$/.test(fractionPart)) {
    return { ok: false, code: 'invalid', rounded: null };
  }
  if (fractionPart.length > 6) return { ok: false, code: 'invalid', rounded: null };

  const hasNonZeroFraction = /[1-9]/.test(fractionPart);
  const fractionValue = fractionPart ? Number(`0.${fractionPart}`) : 0;
  const base = Number(integerPartRaw);
  if (!Number.isSafeInteger(base)) return { ok: false, code: 'too-large', rounded: null };

  const rounded = Math.round(base + fractionValue);
  if (hasNonZeroFraction) {
    return { ok: false, code: 'decimal', rounded: negative ? -rounded : rounded };
  }
  if (base === 0) {
    return { ok: false, code: negative ? 'negative' : 'zero', rounded: null };
  }
  if (negative) return { ok: false, code: 'negative', rounded: -base };
  if (!Number.isSafeInteger(base)) return { ok: false, code: 'too-large', rounded: null };
  return { ok: true, amount: base };
}

/** Arrondit explicitement une saisie décimale (utilisé par l'option d'import). */
export function parseAmountRounding(raw: string | number): AmountParseResult {
  const result = parseAmount(raw);
  if (result.ok) return result;
  if (result.code === 'decimal' && result.rounded !== null) {
    const rounded = result.rounded;
    if (rounded === 0) return { ok: false, code: 'zero', rounded };
    if (rounded < 0) return { ok: false, code: 'negative', rounded };
    if (!Number.isSafeInteger(rounded)) return { ok: false, code: 'too-large', rounded };
    return { ok: true, amount: rounded };
  }
  return result;
}

export function assertIntegerAmount(amount: number, label = 'Montant'): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`${label} invalide : un entier strictement positif de FCFA est requis.`);
  }
}

/** Somme exacte en entiers, avec garde-fou de dépassement. */
export function sumAmounts(amounts: Iterable<number>): number {
  let total = 0;
  for (const amount of amounts) {
    total += amount;
    if (!Number.isSafeInteger(total)) {
      throw new Error('La somme des montants dépasse la limite de précision autorisée.');
    }
  }
  return total;
}

export function formatMoney(
  amount: number,
  numberFormat: NumberFormat = activeNumberFormat,
  options: { symbol?: boolean } = {},
): string {
  const { symbol = true } = options;
  const safe = Number.isSafeInteger(amount) ? amount : Math.round(amount);
  const formatted = new Intl.NumberFormat(numberFormat, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    useGrouping: true,
  }).format(safe);
  return symbol ? `${formatted} ${CURRENCY_SYMBOL}` : formatted;
}

export function formatSignedMoney(
  amount: number,
  numberFormat: NumberFormat = activeNumberFormat,
): string {
  if (amount === 0) return formatMoney(0, numberFormat);
  const sign = amount > 0 ? '+' : '\u2212';
  return `${sign}${formatMoney(Math.abs(amount), numberFormat)}`;
}

/** Formate un pourcentage déjà calculé ; `null` signifie non calculable. */
export function formatPercent(
  value: number | null,
  fractionDigits = 2,
  numberFormat: NumberFormat = activeNumberFormat,
): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat(numberFormat, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(value)} %`;
}

export function roundPercent(value: number, fractionDigits = 2): number {
  const factor = 10 ** fractionDigits;
  return Math.round(value * factor) / factor;
}
