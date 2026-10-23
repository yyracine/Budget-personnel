# Budget personnel — gestion de budget en FCFA

Application web **locale, personnelle et hors ligne** de gestion de budget. Elle permet
d’enregistrer revenus et dépenses, de les classer, de définir des budgets mensuels, de programmer
des récurrences, d’importer des fichiers CSV/XLSX et d’obtenir des rapports mensuels,
trimestriels, semestriels et annuels exportables en Excel et PDF.

Aucun compte, aucun serveur distant, aucune télémétrie : les données restent dans le navigateur
de l’utilisateur. Devise unique : **franc CFA BCEAO (XOF, symbole FCFA)**, montants entiers.

---

## Stack technique retenue

| Domaine | Choix | Justification |
| --- | --- | --- |
| Langage | TypeScript strict | Fiabilité des calculs et des modèles |
| Interface | React 18 + React Router (HashRouter) | Application locale monopage, navigation simple |
| Build | Vite 6 | Démarrage rapide, build statique, aucun serveur métier |
| Stockage | IndexedDB via Dexie 4 | Persistance locale, transactions atomiques, schéma versionné |
| Graphiques | Recharts 3 | Graphiques interactifs maintenus |
| CSV | PapaParse 5 | Analyse robuste, détection de séparateur |
| XLSX lecture | read-excel-file 6 | Lecture navigateur, dates et nombres typés |
| XLSX écriture | write-excel-file 2 | Feuilles multiples, styles, cellules typées |
| PDF | jsPDF 3 + jspdf-autotable 5 | Génération locale, tableaux paginés |
| Tests | Vitest 3 + fake-indexeddb | Tests métier et persistance sans navigateur |
| Tests de bout en bout | Playwright | Parcours réels dans Chrome, profil isolé |

Aucune police, icône ou ressource distante n’est chargée. Les icônes sont des SVG intégrés et la
typographie utilise les polices système. Aucune clé secrète n’est présente dans le frontend.

---

## Prérequis (Windows natif)

- Windows 10 ou 11.
- Node.js **20 ou supérieur** (testé avec Node 24) et npm.
- Un navigateur récent (Chrome, Edge ou Firefox).
- **Google Chrome** (ou Microsoft Edge) installé pour les tests Playwright.
- Aucun Docker, aucun WSL, aucun service cloud.

Toutes les commandes suivantes fonctionnent dans **PowerShell** et **CMD**, à la racine du projet.

---

## Installation, lancement, tests et compilation

```powershell
# Installation des dépendances (le fichier package-lock.json est fourni)
npm ci

# Lancement en développement
npm run dev
```

Ouvrir ensuite **http://127.0.0.1:5173**. Le serveur écoute uniquement sur la boucle locale
(`127.0.0.1`), pas sur toutes les interfaces réseau.

```powershell
# Vérification TypeScript
npm run typecheck

# Tests automatisés des calculs et du stockage
npm test

# Tests de bout en bout dans un vrai navigateur
npm run test:e2e

# Compilation de production
npm run build

# Prévisualisation locale du build (recommandé pour tester le mode hors ligne)
npm run preview
```

Le build est produit dans `dist/`. `npm run build` exécute d’abord la vérification TypeScript.

### Fonctionnement hors ligne

En développement, aucun service worker n’est enregistré (pour éviter les caches de développement).
Après un `npm run build` puis un `npm run preview`, ouvrez l’application une première fois : le
service worker met en cache l’application. Les visites suivantes de la même origine fonctionnent
sans connexion Internet.

Le stockage des données (IndexedDB) est indépendant du service worker : il persiste après fermeture
du navigateur, tant que les données du site ne sont pas effacées.

### Tests de bout en bout (Playwright)

`npm run test:e2e` démarre automatiquement un serveur Vite dédié sur
`http://127.0.0.1:5180` (sans toucher au serveur de développement du port 5173) et ouvre
**Google Chrome**. Chaque test dispose d’un profil de navigateur neuf : la base IndexedDB de
l’utilisateur n’est jamais utilisée ni modifiée.

La suite couvre :

- import CSV réel, mise à jour immédiate des totaux et détection des doublons ;
- création d’un budget, calcul du dépassement, alerte et cloisonnement mensuel ;
- rapport mensuel, parts et comparaison sans pourcentage trompeur ;
- export d’une sauvegarde JSON, suppression d’une opération, restauration et refus d’un fichier
  invalide sans altération des données.

Pour utiliser Microsoft Edge à la place de Chrome :

```powershell
$env:PLAYWRIGHT_CHANNEL='msedge'; npm run test:e2e
```

Les tests s’exécutent dans Chrome ou Edge : aucun navigateur supplémentaire n’est téléchargé.
---

## Stockage, sauvegarde et restauration

### Fonctionnement du stockage

- Base **IndexedDB** nommée `budget-personnel`, schéma versionné par Dexie (version 1).
- Tables : `transactions`, `categories`, `budgets`, `recurrences`, `settings`, `meta`.
- Toutes les écritures critiques (import, restauration, matérialisation d’une récurrence) sont
  transactionnelles : en cas d’erreur, aucune écriture partielle ne subsiste.
- Les montants sont stockés en **entiers de FCFA** et additionnés avec contrôle de dépassement de
  la précision entière.
- **Limite importante : le stockage IndexedDB n’est pas chiffré.** Toute personne ayant accès au
  profil de navigateur peut lire les données. Protégez la session Windows et les fichiers exportés.

### Sauvegarde

Menu **Import & export** → **Sauvegarde complète JSON**. Le fichier contient les paramètres, les
catégories, toutes les opérations, les budgets et les récurrences, avec un numéro de version et une
date d’export. Il n’est pas chiffré.

### Restauration

Menu **Import & export** → **Restaurer une sauvegarde…**. Le fichier est validé intégralement
(format, types, montants, dates, identifiants, relations catégories/budgets/récurrences) **avant**
toute modification. Une confirmation détaillée rappelle que les données actuelles seront remplacées.
Un fichier invalide est refusé sans toucher aux données existantes.

Pour transférer les données vers un autre navigateur ou ordinateur : exporter le JSON, puis le
restaurer sur la nouvelle installation.

---

## Structure du projet

```
.
├─ index.html
├─ public/                  icône, manifeste, service worker
├─ src/
│  ├─ domain/               logique métier pure, sans React ni IndexedDB
│  │  ├─ money.ts           montants entiers, validation, formatage
│  │  ├─ periods.ts         mois, trimestres, semestres, années, bissextiles
│  │  ├─ calculations.ts    totaux, soldes, séries, parts, comparaisons
│  │  ├─ budgets.ts         consommation, états, agrégation
│  │  ├─ recurrence.ts      échéances, ancrage de fin de mois, statuts
│  │  ├─ reports.ts         rapport de période unifié (écran, Excel, PDF)
│  │  ├─ importer.ts        mapping, validation et doublons d’import
│  │  ├─ filters.ts         recherche et filtres combinables
│  │  └─ validation.ts      règles de saisie
│  ├─ data/                 Dexie, dépôt validé, sauvegarde, catégories par défaut
│  ├─ exports/              Excel, PDF, rendu canvas des graphiques
│  ├─ services/             lecture des fichiers CSV/XLSX
│  ├─ state/                contexte applicatif, notifications
│  ├─ components/           design system et composants partagés
│  ├─ pages/                tableau de bord, opérations, budgets, rapports…
│  └─ test/                 fabriques de données de test
├─ e2e/                     scénarios Playwright (import, budgets, rapports, restauration)
├─ playwright.config.ts     serveur de test dédié et navigateur
├─ docs/
│  ├─ CALCULS.md            règles de calcul détaillées
│  ├─ MODELE-DONNEES.md     modèle, contraintes, versions et migrations
│  └─ GUIDE-UTILISATEUR.md  prise en main et parcours courants
└─ examples/import-exemple.csv
```

---

## Fonctionnalités réalisées

- Tableau de bord : solde disponible cumulé, revenus, dépenses, solde net, opérations, budget
  consommé, graphique mensuel, répartition des dépenses, évolution du solde, activité récente.
- Opérations : création, modification, suppression avec confirmation, recherche, filtres combinables
  (période, type, catégorie, montant, mot-clé, source), tri, pagination, export Excel filtré.
- Catégories : 21 catégories initiales (7 revenus, 14 dépenses), création, modification, couleur,
  icône, description, désactivation/réactivation. Suppression refusée si la catégorie est utilisée.
- Budgets mensuels par catégorie de dépense, seuil d’alerte configurable, états normal/alerte/
  dépassé/non défini, consommation limitée au mois exact.
- Récurrences hebdomadaires, mensuelles, trimestrielles, semestrielles et annuelles, avec ancrage de
  fin de mois, date de fin facultative, suspension et matérialisation explicite sans doublon.
- Import CSV/XLSX : détection des colonnes, mapping corrigeable, prévisualisation, validation ligne
  par ligne, détection des doublons, arrondi explicite des décimales, import transactionnel.
- Rapports : totaux, soldes, parts par catégorie, ventilation mensuelle, budgets, comparaison avec la
  période précédente. Export Excel multi-feuilles et PDF avec graphiques, pagination et pied de page.
- Sauvegarde JSON complète, restauration validée, export Excel complet.
- Paramètres : solde initial, thème clair/sombre/système, formats de date et de nombre, information
  de stockage, réinitialisation confirmée.
- Accessibilité : navigation clavier, focus visible, libellés de formulaires, messages d’erreur,
  contrastes, respect de `prefers-reduced-motion`.

---

## Règles financières essentielles

- Une opération possède un montant **entier strictement positif** ; le type (`income`/`expense`)
  détermine son sens.
- **Solde net d’une période** = revenus de la période − dépenses de la période.
- **Solde disponible cumulé** = solde initial + tous les revenus − toutes les dépenses jusqu’à la
  date d’arrêté. Les deux notions ne sont jamais confondues.
- La part d’une catégorie de dépenses est calculée sur le total des dépenses, celle d’une catégorie
  de revenus sur le total des revenus. Aucune division par zéro : la part vaut « non calculable ».
- Les comparaisons utilisent des périodes de même nature ; l’écart vaut période récente − période
  précédente. Aucun pourcentage n’est affiché lorsque la base est nulle ou négative.
- Les échéances récurrentes ne sont **jamais** comptées avant matérialisation.

Détails complets : [docs/CALCULS.md](docs/CALCULS.md).

---

## Import : format attendu

Fichiers acceptés : `.csv` et `.xlsx` (le format `.xls` ancien n’est pas pris en charge).
Taille maximale : 10 Mo ; maximum 20 000 lignes analysées ; seule la première feuille du classeur
est importée.

Colonnes reconnues automatiquement (français ou anglais) :

| Champ | Obligatoire | Exemples d’en-têtes |
| --- | --- | --- |
| Date | Oui | `date`, `date operation`, `jour` |
| Montant | Oui | `montant`, `amount`, `somme` |
| Catégorie | Oui | `catégorie`, `category`, `rubrique` |
| Type | Non (déduit de la catégorie) | `type`, `sens`, `nature` |
| Libellé | Non (nom de catégorie par défaut) | `libellé`, `description`, `label` |
| Note | Non | `note`, `commentaire` |
| Identifiant source | Non | `id`, `référence`, `source id` |

Valeurs de type acceptées : `revenu`, `dépense`, `income`, `expense`, `entrée`, `sortie`,
`crédit`, `débit` (accents et casse ignorés).

Dates acceptées : `AAAA-MM-JJ`, `AAAA/MM/JJ`, `JJ/MM/AAAA`, `JJ-MM-AAAA`, `JJ.MM.AAAA`.
Le type et la catégorie doivent déjà exister. Un exemple est fourni :
[examples/import-exemple.csv](examples/import-exemple.csv).

Les lignes invalides sont listées avec leur numéro et **ne sont pas importées**. Les doublons
potentiels reposent sur la date, le type, le montant, la catégorie et le libellé normalisé (ou
l’identifiant source) ; l’utilisateur choisit de les ignorer ou de les importer. Les montants
décimaux sont refusés par défaut et ne peuvent être arrondis qu’avec une option explicite, qui les
signale dans le rapport d’import.

---

## Limites connues et choix explicites

- Application **mono-utilisateur**, sans authentification ni rôles.
- Données locales **non chiffrées** ; pas de synchronisation cloud.
- XOF entier uniquement : les décimales sont refusées à la saisie et signalées à l’import.
- Budgets **mensuels** uniquement (les rapports agrègent les mois d’une période plus longue).
- Le format XLS (BIFF) n’est pas pris en charge ; convertir en XLSX ou CSV.
- Une seule feuille XLSX est importée (la première) ; un avertissement le signale.
- Les exports PDF avec graphiques nécessitent un navigateur disposant de Canvas.
- Le service worker hors ligne n’est actif qu’après un build de production et un premier chargement.
- Les tests E2E nécessitent Google Chrome (par défaut) ou Microsoft Edge ; ils ne s’exécutent pas
  dans Firefox ou Safari.
- L’application ne réalise aucune conversion de devise et n’utilise aucun taux de change.
- Les exports Excel écrivent les textes utilisateur avec un type texte explicite : une valeur
  commençant par `=` ne peut pas devenir une formule.

---

## Mise à jour et compatibilité des données

1. Télécharger une sauvegarde JSON depuis l’application.
2. Récupérer la nouvelle version du projet.
3. Exécuter `npm ci` puis `npm run typecheck` et `npm test`.
4. Lancer le build ou le serveur de développement.

Les données existantes ne sont pas effacées lors d’une mise à jour. Toute évolution du schéma doit
ajouter une nouvelle version Dexie avec migration explicite (voir
[docs/MODELE-DONNEES.md](docs/MODELE-DONNEES.md)). Le format de sauvegarde est versionné : une
sauvegarde d’un format plus récent est refusée avec un message clair plutôt que lue partiellement.

---

## Documentation

- [Guide utilisateur](docs/GUIDE-UTILISATEUR.md)
- [Règles de calcul](docs/CALCULS.md)
- [Modèle de données](docs/MODELE-DONNEES.md)
