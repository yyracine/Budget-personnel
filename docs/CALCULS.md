# Règles de calcul

Ce document est la référence fonctionnelle. L’implémentation correspondante se trouve dans
`src/domain/` et est couverte par les tests de `src/domain/*.test.ts`.

---

## 1. Représentation des montants

- Tous les montants sont des **entiers JavaScript de francs CFA** (`Number.isSafeInteger`).
- Le XOF n’a pas de décimale : aucun montant monétaire n’est calculé en virgule flottante.
- Une saisie décimale (`12,50`) est refusée avec un message explicite. L’arrondi n’est possible que
  par une option explicite lors d’un import, et chaque arrondi est signalé dans le rapport.
- Les sommes utilisent `sumAmounts`, qui vérifie que le total reste un entier sûr. Au-delà de
  `Number.MAX_SAFE_INTEGER`, une erreur est levée plutôt que de produire un résultat faux.
- Les pourcentages et les parts sont les seules valeurs arrondies, à **2 décimales**, et uniquement
  pour l’affichage ou la comparaison. Ils ne sont jamais réinjectés dans un total monétaire.
- Le solde initial peut être positif, nul ou négatif. Il n’est pas un revenu.

Conversion d’affichage : `Intl.NumberFormat('fr-FR')` pour les groupes de milliers, suffixe `FCFA`.
Le format `en-US` est proposé dans les paramètres pour le séparateur.

---

## 2. Opérations

Une opération contient au minimum : identifiant, date calendaire, type (`income` ou `expense`),
montant entier strictement positif, catégorie, libellé. La note est facultative. Les horodatages de
création et de modification sont techniques et n’entrent dans aucun calcul.

Le type détermine le sens :

- `income` : effet `+montant` ;
- `expense` : effet `−montant`.

Une opération dont la catégorie ne correspond pas au type est refusée. Une opération modifiée est
recalculée immédiatement ; une opération supprimée disparaît de tous les totaux, graphiques,
budgets et rapports.

La date d’opération est une date calendaire `YYYY-MM-DD`, sans heure. Le classement se fait sur
cette date, jamais sur `createdAt` ou `updatedAt`. Les bornes de période sont inclusives.

---

## 3. Périodes calendaires

Pour une année `A` :

| Période | Début | Fin |
| --- | --- | --- |
| Mois `M` | 1er du mois | dernier jour réel du mois |
| T1 | A-01-01 | A-03-31 |
| T2 | A-04-01 | A-06-30 |
| T3 | A-07-01 | A-09-30 |
| T4 | A-10-01 | A-12-31 |
| S1 | A-01-01 | A-06-30 |
| S2 | A-07-01 | A-12-31 |
| Année | A-01-01 | A-12-31 |

Les années bissextiles sont gérées : février 2024 se termine le 29, février 2026 le 28. Les
calculs calendaires internes utilisent UTC afin d’éviter tout décalage d’heure d’été.

Exemple de classement : le 31 mars appartient à mars, T1, S1 et à l’année ; le 1er avril appartient
à avril, T2, S1 ; le 1er juillet à juillet, T3, S2.

---

## 4. Totaux d’une période

Pour une période `P` :

```
R_P = Σ montants des opérations de type income dont la date ∈ P
D_P = Σ montants des opérations de type expense dont la date ∈ P
S_P = R_P − D_P            (solde net de la période)
N_P = nombre d’opérations dont la date ∈ P
```

Le solde net peut être positif, nul ou négatif. Il ne doit jamais être confondu avec le solde
disponible.

### Exemple fondamental (test automatisé)

Revenus 300 000 + 150 000, dépenses 80 000 + 20 000 :

- revenus = 450 000 FCFA ;
- dépenses = 100 000 FCFA ;
- solde net = 350 000 FCFA.

---

## 5. Solde disponible cumulé

Pour une date d’arrêté `t` :

```
S_disponible(t) = solde_initial + R_(≤t) − D_(≤t)
```

Le solde initial par défaut est zéro. Il représente la situation financière avant le premier
mouvement suivi.

Le solde disponible inclut toutes les opérations passées, même si elles appartiennent à des mois ou
années antérieurs. Changer de période ne réinitialise donc jamais ce solde.

### Exemple (test automatisé)

Solde initial 50 000, revenu 100 000, dépenses 30 000 et 20 000 → solde disponible = 100 000 FCFA.
Le solde net de la période, lui, vaut 50 000 FCFA.

### Courbe d’évolution

La courbe part du solde initial et applique chaque opération dans l’ordre chronologique de sa date.
Elle ne peut pas être obtenue en additionnant naïvement des soldes mensuels sans tenir compte des
opérations antérieures. L’ouverture d’une plage est égale au solde de toutes les opérations
strictement antérieures au début de la plage.

---

## 6. Totaux et parts par catégorie

Pour une catégorie `c` de type `T` (revenu ou dépense) et une période `P` :

```
Montant_c = Σ montants des opérations de catégorie c et de type T dans P
Nombre_c = nombre de ces opérations
Total_T = Σ montants de toutes les catégories de type T dans P
Part_c = Montant_c / Total_T × 100
```

Règles :

- la part d’une catégorie de **dépenses** est calculée sur le total des **dépenses** ;
- la part d’une catégorie de **revenus** est calculée sur le total des **revenus** ;
- si `Total_T = 0`, la part vaut `null` et l’interface affiche « — » ; aucune division par zéro ;
- les revenus et les dépenses ne sont jamais additionnés dans un même total ambigu.

### Exemple (test automatisé)

Alimentation 30 000 + 20 000, transport 10 000, salaire 250 000 :

- dépenses alimentation = 50 000 ; transport = 10 000 ; total dépenses = 60 000 ;
- total revenus = 250 000 ; solde net = 190 000 ;
- part alimentation = 83,33 % ; part transport = 16,67 % (arrondis d’affichage).

---

## 7. Budgets mensuels

Un budget contient une catégorie de dépense, un mois (`periodStart` = premier jour), un montant
prévu entier strictement positif et un seuil d’alerte entre 1 et 100 (80 par défaut).

```
Consommation = Σ dépenses de la catégorie dont la date ∈ mois du budget
Reste = Budget − Consommation
Taux = Consommation / Budget × 100
```

États :

| Condition | État |
| --- | --- |
| aucun budget enregistré | Non défini |
| budget ≤ 0 | Budget nul (taux non calculable) |
| consommation > budget | Dépassé |
| consommation ≥ seuil % du budget | Alerte |
| sinon | Normal |

À 80 % pile, l’état est « Alerte ». Un budget nul ou absent ne produit jamais de division par zéro.

Une dépense de janvier n’est jamais imputée au budget de février. Le mois est déterminé par la date
de l’opération, pas par sa date de saisie.

### Exemple (test automatisé)

Budget 100 000, dépenses 85 000, seuil 80 % → consommation 85 000, reste 15 000, taux 85 %,
état « Alerte ». Avec 105 000 → reste −5 000, taux 105 %, état « Dépassé ».

### Agrégation dans les rapports

Pour un trimestre, un semestre ou une année, les budgets mensuels des mois couverts sont additionnés
et la consommation est celle de la période complète. Le seuil agrégé est le plus bas des seuils des
budgets concernés.

---

## 8. Opérations récurrentes

Une règle définit : type, montant, catégorie, libellé, note, fréquence, date de début, date de fin
facultative, prochaine échéance, statut actif/suspendu.

Fréquences : hebdomadaire (+7 jours), mensuelle (+1 mois), trimestrielle (+3 mois), semestrielle
(+6 mois), annuelle (+12 mois).

### Ancrage de fin de mois

Le jour d’ancrage est le jour du mois de la **date de début**. Si le mois cible est plus court,
l’échéance est ramenée à son dernier jour, puis l’ancrage d’origine est repris :

- 31 janvier → 28 février (2026) → 31 mars → 30 avril → 31 mai ;
- 31 janvier 2024 → 29 février 2024 ;
- 29 février 2024 (annuel) → 28 février 2025 → 28 février 2026 → 29 février 2028.

Le comportement ne dérive donc pas : ce n’est pas un simple « +1 mois » sur la dernière occurrence.

### Matérialisation

Une occurrence prévue n’est **pas** une opération. Elle ne compte ni dans les soldes, ni dans les
budgets, ni dans les rapports. L’action « Matérialiser » crée une opération réelle à la date due,
avec `source = recurrence`.

La clé d’unicité `${ruleId}|${date}` est portée par un index unique IndexedDB. Une seconde
matérialisation de la même échéance est refusée, y compris en cas de double clic. Une règle
suspendue ou terminée ne peut pas être matérialisée.

Après création, `nextOccurrence` avance selon la fréquence et l’ancrage. Si la date de fin est
dépassée, le statut devient « Terminée ».

---

## 9. Comparaisons de périodes

On compare une période à la période de même nature immédiatement précédente (mois précédent,
trimestre précédent, semestre précédent, année précédente).

```
Δ = X_récente − X_précédente
Variation % = Δ / X_précédente × 100
```

Cas particuliers :

| Situation | Affichage |
| --- | --- |
| référence 0, valeur courante 0 | Non calculable |
| référence 0, valeur courante ≠ 0 | Nouvelle valeur |
| valeur courante 0, référence ≠ 0 | Passage à zéro |
| référence négative | Non calculable (pourcentage trompeur) |

Une hausse des dépenses donne un écart positif, mais n’est pas un signal favorable : l’interface
n’associe pas automatiquement une couleur positive à une hausse de dépenses.

Aucune comparaison entre un mois complet et un mois partiel n’est présentée comme équivalente.

---

## 10. Import

- Les montants sont analysés sans conversion flottante : la partie entière est validée, une partie
  décimale non nulle est refusée par défaut.
- Option explicite « arrondir à l’unité » : les lignes concernées sont listées dans le rapport.
- Les dates doivent correspondre à un format reconnu et à un jour réel. Aucune interprétation
  ambiguë jour/mois n’est faite.
- Les montants nuls ou négatifs sont refusés.
- Les catégories doivent exister ; la comparaison ignore accents, casse et ponctuation.
- Un type absent peut être déduit du type de la catégorie, avec un avertissement.
- Un libellé absent utilise le nom de la catégorie, avec un avertissement.
- Une empreinte de doublon combine date, type, montant, catégorie et libellé normalisé.
- L’écriture finale est transactionnelle : si une ligne échoue au moment de l’écriture, aucune
  opération du lot n’est conservée.

---

## 11. Exports

L’écran, Excel et PDF appellent la même fonction `buildPeriodReport` et les mêmes fonctions de
calcul. Aucun export ne recalcule les chiffres avec une logique parallèle.

- Excel : montants en cellules numériques, dates en cellules de type date, parts en pourcentages
  numériques, textes contrôlés par l’utilisateur écrits explicitement comme texte.
- PDF : totaux, tableaux par catégorie, ventilation mensuelle, budgets, comparaison, graphiques
  (barres mensuelles et anneau des dépenses) et pagination.
- Les lignes de total d’un export correspondent aux opérations exportées, filtres compris.
