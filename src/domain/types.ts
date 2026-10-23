/** Types métier partagés. Tous les montants monétaires sont des entiers de FCFA (XOF). */

export type TransactionType = 'income' | 'expense';
export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual';
export type PeriodType = 'month' | 'quarter' | 'semester' | 'year';
export type ThemeMode = 'light' | 'dark' | 'system';
export type DateFormat = 'DD/MM/YYYY' | 'YYYY-MM-DD';
export type NumberFormat = 'fr-FR' | 'en-US';

/** Date calendaire sans heure, au format YYYY-MM-DD. */
export type ISODate = string;
/** Horodatage ISO complet (UTC) pour la traçabilité technique. */
export type ISODateTime = string;

export interface Transaction {
  id: string;
  date: ISODate;
  type: TransactionType;
  /** Entier strictement positif, en FCFA. */
  amount: number;
  categoryId: string;
  label: string;
  note: string;
  /** Origine de l'opération : saisie manuelle, import, récurrence. */
  source: string;
  /** Identifiant fourni par le fichier importé, s'il existe. */
  sourceId?: string;
  recurrenceRuleId?: string;
  occurrenceDate?: ISODate;
  /** Clé d'unicité `${recurrenceRuleId}|${occurrenceDate}`. */
  occurrenceKey?: string;
  /** Identifiant du lot d'import, pour la traçabilité. */
  importBatchId?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
  description: string;
  isActive: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Budget {
  id: string;
  categoryId: string;
  periodType: 'month';
  /** Premier jour du mois budgété, YYYY-MM-01. */
  periodStart: ISODate;
  /** Entier strictement positif, en FCFA. */
  amount: number;
  /** Pourcentage d'alerte (0-100 exclus). */
  alertThreshold: number;
  /** Clé d'unicité `${categoryId}|${periodType}|${periodStart}`. */
  budgetKey: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface RecurrenceRule {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  label: string;
  note: string;
  frequency: Frequency;
  startDate: ISODate;
  endDate?: ISODate;
  /** Prochaine échéance non encore matérialisée. */
  nextOccurrence: ISODate;
  isActive: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface AppSettings {
  id: 'app';
  currency: 'XOF';
  initialBalance: number;
  theme: ThemeMode;
  dateFormat: DateFormat;
  numberFormat: NumberFormat;
  version: number;
}

export interface DateRange {
  start: ISODate;
  end: ISODate;
}

export interface Period extends DateRange {
  type: PeriodType;
  year: number;
  /** Mois (1-12), trimestre (1-4) ou semestre (1-2) ; absent pour une année. */
  index?: number;
  label: string;
  key: string;
}

export interface TransactionFilter {
  range?: DateRange;
  type?: TransactionType | 'all';
  categoryId?: string | 'all';
  minAmount?: number;
  maxAmount?: number;
  keyword?: string;
  source?: string | 'all';
}
