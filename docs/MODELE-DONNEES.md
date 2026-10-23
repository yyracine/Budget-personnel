# Modèle de données

Stockage : **IndexedDB** via Dexie 4, base `budget-personnel`, schéma version 1.
Aucune autre base n’est utilisée. Le stockage est local au navigateur et n’est pas chiffré.

---

## 1. Tables et index

| Table | Clé primaire | Index | Contrainte d’unicité |
| --- | --- | --- | --- |
| `transactions` | `id` | `date`, `type`, `categoryId`, `source`, `recurrenceRuleId`, `importBatchId` | `occurrenceKey` |
| `categories` | `id` | `type`, `isActive`, `name` | — |
| `budgets` | `id` | `categoryId`, `periodStart` | `budgetKey` |
| `recurrences` | `id` | `isActive`, `nextOccurrence` | — |
| `settings` | `id` (valeur fixe `app`) | — | — |
| `meta` | `key` | — | — |

Les index uniques `occurrenceKey` et `budgetKey` sont des champs techniques :

- `occurrenceKey = "${recurrenceRuleId}|${occurrenceDate}"` — garantit qu’une échéance ne peut être
  matérialisée qu’une fois, même en cas de double action ;
- `budgetKey = "${categoryId}|month|${periodStart}"` — garantit un seul budget par catégorie et par
  mois.

Les enregistrements sans ces champs ne sont pas indexés dans les index uniques (comportement
IndexedDB), donc les opérations manuelles et les budgets concernés ne sont pas affectés.

---

## 2. Entités

### Transaction

```ts
interface Transaction {
  id: string;                  // UUID
  date: string;                // YYYY-MM-DD, date calendaire
  type: 'income' | 'expense';
  amount: number;              // entier strictement positif, FCFA
  categoryId: string;          // référence Category
  label: string;               // 1 à 120 caractères
  note: string;                // 0 à 500 caractères
  source: string;              // manual | CSV | Excel | recurrence | import
  sourceId?: string;           // identifiant du fichier source
  recurrenceRuleId?: string;   // provenance récurrence
  occurrenceDate?: string;     // date de l’échéance matérialisée
  occurrenceKey?: string;      // "${ruleId}|${occurrenceDate}" (unique)
  importBatchId?: string;      // traçabilité d’un lot d’import
  createdAt: string;           // ISO 8601 UTC
  updatedAt: string;           // ISO 8601 UTC
}
```

Contraintes : catégorie existante et du même type ; montant entier > 0 ; date réelle ; libellé
non vide. Le type et la date d’une occurrence matérialisée ne sont pas modifiés par l’édition d’une
règle.

### Category

```ts
interface Category {
  id: string;
  name: string;                // unique par type (casse/accents comparés en français)
  type: 'income' | 'expense';
  color: string;               // #RRGGBB
  icon: string;                // nom d’icône du jeu intégré
  description: string;
  isActive: boolean;           // désactivation sans perte d’historique
  createdAt: string;
  updatedAt: string;
}
```

Contraintes : type explicite, couleur hexadécimale, nom unique au sein d’un type. Le type ne peut
pas être changé lorsqu’une opération utilise déjà la catégorie. La suppression est refusée si la
catégorie est référencée par une opération, un budget ou une récurrence ; la désactivation est
alors proposée.

### Budget

```ts
interface Budget {
  id: string;
  categoryId: string;          // catégorie de dépense uniquement
  periodType: 'month';         // périmètre minimal implémenté
  periodStart: string;         // YYYY-MM-01
  amount: number;              // entier > 0
  alertThreshold: number;      // 1 à 100, défaut 80
  budgetKey: string;           // unique
  createdAt: string;
  updatedAt: string;
}
```

Un budget cible obligatoirement une catégorie de dépense. Le mois est le premier jour du mois.
Aucun pourcentage n’est calculé pour un budget nul.

### RecurrenceRule

```ts
interface RecurrenceRule {
  id: string;
  type: 'income' | 'expense';
  amount: number;              // entier > 0
  categoryId: string;
  label: string;
  note: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual';
  startDate: string;           // YYYY-MM-DD, jour d’ancrage
  endDate?: string;            // >= startDate
  nextOccurrence: string;      // prochaine échéance non matérialisée
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

Contraintes : catégorie existante et du même type ; date de fin ≥ date de début ; prochaine
échéance ≥ date de début. La date de début n’est pas modifiable après création.

`nextOccurrence` est stocké volontairement : c’est un état de progression de la règle, pas un
montant calculé. Il n’est jamais utilisé pour comptabiliser une opération.

### AppSettings

```ts
interface AppSettings {
  id: 'app';
  currency: 'XOF';             // fixe
  initialBalance: number;      // entier, peut être négatif
  theme: 'light' | 'dark' | 'system';
  dateFormat: 'DD/MM/YYYY' | 'YYYY-MM-DD';
  numberFormat: 'fr-FR' | 'en-US';
  version: number;             // version des données
}
```

### Meta

`{ key: string; value: string }` — drapeau `seeded` utilisé pour ne pas recréer les catégories par
défaut après une réinitialisation ou une restauration volontaire.

---

## 3. Valeurs dérivées

Ne sont pas stockées, car recalculées de manière fiable à partir des opérations :

- totaux de revenus et de dépenses ;
- soldes net et disponible ;
- parts par catégorie ;
- consommation et état des budgets ;
- séries mensuelles et cumulées ;
- rapports et comparaisons.

Les seules valeurs persistées non directement dérivables sont les clés techniques d’unicité et la
progression des récurrences (`nextOccurrence`), qui est un état métier explicite.

---

## 4. Versions et migrations

Le schéma est déclaré dans `src/data/db.ts` :

```ts
this.version(1).stores({
  transactions: 'id, date, type, categoryId, source, recurrenceRuleId, importBatchId, &occurrenceKey',
  categories: 'id, type, isActive, name',
  budgets: 'id, categoryId, periodStart, &budgetKey',
  recurrences: 'id, isActive, nextOccurrence',
  settings: 'id',
  meta: 'key',
});
```

Procédure pour une évolution :

1. Ne jamais modifier la déclaration `version(1)`.
2. Ajouter `this.version(2).stores({...}).upgrade(async (tx) => { ... })`.
3. Rendre la migration idempotente et testable.
4. Mettre à jour `APP_DATA_VERSION` et, si le format de sauvegarde change,
   `BACKUP_FORMAT_VERSION` avec un validateur correspondant.
5. Ajouter un test de réouverture d’une base créée avec l’ancienne version.
6. Documenter la migration et demander une sauvegarde avant mise à jour.

Les catégories par défaut sont insérées au premier démarrage uniquement (`meta.seeded`). Une
réinitialisation recrée les 21 catégories par défaut et un solde initial nul.

---

## 5. Format de sauvegarde

Fichier JSON, encodage UTF-8 :

```json
{
  "app": "budget-personnel",
  "formatVersion": 1,
  "schemaVersion": 1,
  "exportedAt": "2026-10-19T20:00:00.000Z",
  "settings": { "...": "..." },
  "categories": [],
  "transactions": [],
  "budgets": [],
  "recurrences": []
}
```

La validation (`src/data/backup.ts`) vérifie avant toute écriture :

- l’application et la version du format ;
- les paramètres (devise XOF, thème, formats, solde initial entier) ;
- l’unicité des identifiants ;
- les dates réelles et les montants entiers positifs ;
- l’existence et la compatibilité de type des catégories référencées ;
- l’existence des règles de récurrence référencées ;
- l’unicité des clés d’échéance ;
- les budgets (catégorie de dépense, premier jour du mois, unicité catégorie/mois, seuil 1-100) ;
- les récurrences (fréquence, dates, catégorie, type).

Une erreur, même unique, provoque le refus complet de la sauvegarde. La restauration remplace
toutes les tables dans une transaction IndexedDB unique : soit tout est restauré, soit rien ne
change.

Les fichiers de sauvegarde ne contiennent aucun secret et ne sont pas chiffrés. Leur intégrité
repose sur le fichier lui-même ; conservez-les sur un support de confiance.
