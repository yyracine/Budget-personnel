import type { AppSettings, Category } from '../domain/types';

export const DATABASE_NAME = 'budget-personnel';
export const SCHEMA_VERSION = 1;
export const APP_DATA_VERSION = 1;

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'app',
  currency: 'XOF',
  initialBalance: 0,
  theme: 'system',
  dateFormat: 'DD/MM/YYYY',
  numberFormat: 'fr-FR',
  version: APP_DATA_VERSION,
};

interface SeedCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  color: string;
  icon: string;
  description: string;
}

const SEED: SeedCategory[] = [
  // Revenus
  {
    id: 'cat_income_salary',
    name: 'Salaire',
    type: 'income',
    color: '#0f9d76',
    icon: 'briefcase',
    description: 'Salaire net et rémunération principale.',
  },
  {
    id: 'cat_income_independent',
    name: 'Activité indépendante',
    type: 'income',
    color: '#2563eb',
    icon: 'laptop',
    description: 'Prestations, missions et travail indépendant.',
  },
  {
    id: 'cat_income_commerce',
    name: 'Commerce et ventes',
    type: 'income',
    color: '#7c3aed',
    icon: 'store',
    description: 'Recettes d’un commerce ou de ventes ponctuelles.',
  },
  {
    id: 'cat_income_bonus',
    name: 'Primes et commissions',
    type: 'income',
    color: '#d97706',
    icon: 'award',
    description: 'Primes, bonus, commissions et gratifications.',
  },
  {
    id: 'cat_income_rent',
    name: 'Revenus locatifs',
    type: 'income',
    color: '#0e7490',
    icon: 'home',
    description: 'Loyers perçus et locations.',
  },
  {
    id: 'cat_income_investments',
    name: 'Intérêts et placements',
    type: 'income',
    color: '#059669',
    icon: 'trending-up',
    description: 'Intérêts, dividendes et gains de placement.',
  },
  {
    id: 'cat_income_other',
    name: 'Autres revenus',
    type: 'income',
    color: '#475569',
    icon: 'plus-circle',
    description: 'Revenus qui ne relèvent pas des autres catégories.',
  },
  // Dépenses
  {
    id: 'cat_expense_housing',
    name: 'Logement et loyer',
    type: 'expense',
    color: '#b45309',
    icon: 'home',
    description: 'Loyer, charges de logement et entretien.',
  },
  {
    id: 'cat_expense_food',
    name: 'Alimentation',
    type: 'expense',
    color: '#0e7490',
    icon: 'basket',
    description: 'Courses, marchés et repas.',
  },
  {
    id: 'cat_expense_transport',
    name: 'Transport',
    type: 'expense',
    color: '#2563eb',
    icon: 'car',
    description: 'Carburant, transports en commun et déplacements.',
  },
  {
    id: 'cat_expense_health',
    name: 'Santé',
    type: 'expense',
    color: '#dc2626',
    icon: 'heart',
    description: 'Consultations, médicaments et soins.',
  },
  {
    id: 'cat_expense_education',
    name: 'Éducation et formation',
    type: 'expense',
    color: '#7c3aed',
    icon: 'graduation',
    description: 'Scolarité, cours et formations.',
  },
  {
    id: 'cat_expense_utilities',
    name: 'Factures et énergie',
    type: 'expense',
    color: '#ca8a04',
    icon: 'zap',
    description: 'Électricité, eau et autres factures.',
  },
  {
    id: 'cat_expense_telecom',
    name: 'Télécommunications et Internet',
    type: 'expense',
    color: '#0891b2',
    icon: 'wifi',
    description: 'Téléphone, données mobiles et Internet.',
  },
  {
    id: 'cat_expense_family',
    name: 'Famille et enfants',
    type: 'expense',
    color: '#db2777',
    icon: 'users',
    description: 'Dépenses familiales et besoins des enfants.',
  },
  {
    id: 'cat_expense_leisure',
    name: 'Loisirs',
    type: 'expense',
    color: '#9333ea',
    icon: 'gamepad',
    description: 'Sorties, activités et divertissement.',
  },
  {
    id: 'cat_expense_clothing',
    name: 'Vêtements',
    type: 'expense',
    color: '#e11d48',
    icon: 'shirt',
    description: 'Habillement et chaussures.',
  },
  {
    id: 'cat_expense_subscriptions',
    name: 'Abonnements',
    type: 'expense',
    color: '#4f46e5',
    icon: 'repeat',
    description: 'Abonnements numériques et services récurrents.',
  },
  {
    id: 'cat_expense_savings',
    name: 'Épargne et placements',
    type: 'expense',
    color: '#059669',
    icon: 'piggy-bank',
    description: 'Sommes mises de côté, suivies comme sorties de trésorerie.',
  },
  {
    id: 'cat_expense_taxes',
    name: 'Impôts et frais administratifs',
    type: 'expense',
    color: '#64748b',
    icon: 'receipt',
    description: 'Impôts, taxes et frais de dossier.',
  },
  {
    id: 'cat_expense_other',
    name: 'Autres dépenses',
    type: 'expense',
    color: '#78716c',
    icon: 'more',
    description: 'Dépenses qui ne relèvent pas des autres catégories.',
  },
];

export function buildDefaultCategories(now: string = new Date().toISOString()): Category[] {
  return SEED.map((category) => ({
    ...category,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }));
}

export const CATEGORY_COLORS = [
  '#0f9d76',
  '#2563eb',
  '#7c3aed',
  '#d97706',
  '#0e7490',
  '#059669',
  '#b45309',
  '#dc2626',
  '#ca8a04',
  '#db2777',
  '#0891b2',
  '#9333ea',
  '#e11d48',
  '#4f46e5',
  '#64748b',
  '#78716c',
  '#334155',
  '#be123c',
  '#1d4ed8',
  '#047857',
];

export const CATEGORY_ICONS = [
  'briefcase',
  'laptop',
  'store',
  'award',
  'home',
  'trending-up',
  'plus-circle',
  'basket',
  'car',
  'heart',
  'graduation',
  'zap',
  'wifi',
  'users',
  'gamepad',
  'shirt',
  'repeat',
  'piggy-bank',
  'receipt',
  'more',
  'wallet',
  'tag',
];
