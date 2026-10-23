# Guide utilisateur

## 1. Lancer l’application

1. Ouvrir un terminal dans le dossier du projet.
2. Exécuter `npm ci` la première fois.
3. Exécuter `npm run dev`.
4. Ouvrir **http://127.0.0.1:5173** dans le navigateur.

Pour un usage quotidien hors ligne, exécuter `npm run build` puis `npm run preview`, ouvrir
l’application une première fois pour l’installer dans le cache, et utiliser l’adresse indiquée par
la prévisualisation. Les données, elles, sont conservées dans le navigateur.

Le bouton **Nouvelle opération** en haut de l’écran est accessible depuis toutes les pages.

---

## 2. Première utilisation

1. Ouvrir **Paramètres** et saisir le **solde initial** (par exemple le montant réellement disponible
   avant de commencer le suivi). Cette valeur peut être nulle ou négative.
2. Vérifier les **catégories** proposées : 21 catégories sont créées automatiquement (7 revenus,
   14 dépenses). Elles peuvent être renommées, colorées, décrites, désactivées ou complétées.
3. Ajouter une première opération, ou importer un historique depuis **Import & export**.

Aucun chiffre fictif n’est affiché : tant qu’aucune opération n’existe, le tableau de bord propose
des actions de démarrage.

---

## 3. Saisir une opération

1. Cliquer sur **Nouvelle opération**.
2. Choisir **Dépense** ou **Revenu**.
3. Saisir un montant entier, par exemple `25 000`. Le suffixe FCFA est fixe.
4. Choisir la date (aujourd’hui par défaut).
5. Choisir une catégorie correspondant au type.
6. Saisir un libellé, puis éventuellement une note.
7. Valider.

Règles de saisie :

- le montant est obligatoire, entier et strictement positif ;
- une virgule décimale est refusée (le XOF n’a pas de centimes) ;
- une catégorie de revenu ne peut pas être utilisée pour une dépense, et inversement ;
- une catégorie désactivée n’apparaît pas dans les nouvelles saisies, mais reste visible dans
  l’historique.

Les champs déjà saisis sont conservés si une erreur est signalée. Les doubles soumissions sont
empêchées pendant l’enregistrement.

---

## 4. Consulter et gérer les opérations

Le menu **Opérations** affiche le registre complet. Les menus **Revenus** et **Dépenses** montrent
le même registre, limité à un type.

Filtres disponibles, combinables :

- recherche dans le libellé et la note (accents et casse ignorés) ;
- type et catégorie ;
- source (saisie manuelle, import CSV/Excel, récurrence) ;
- date de début et de fin ;
- montant minimum et maximum.

Les raccourcis **Ce mois** et **Cette année** remplissent les dates. **Réinitialiser** efface tous
les critères. La ligne de synthèse indique les revenus, dépenses et le solde **des lignes filtrées**,
et non de tout l’historique.

Le tableau se trie par date, libellé ou montant. Chaque ligne propose la modification et la
suppression avec confirmation. Une suppression recalcule immédiatement les totaux, budgets et
rapports. Le bouton **Exporter en Excel** exporte exactement les lignes filtrées.

---

## 5. Catégories

Menu **Catégories**, onglet **Dépenses** ou **Revenus**.

- **Nouvelle catégorie** : nom, description, couleur et icône.
- **Modifier** : le type existant n’est pas modifié pour ne pas fausser l’historique.
- **Désactiver** : la catégorie disparaît des formulaires, les opérations passées restent comptées.
- **Supprimer** : possible uniquement si aucune opération, aucun budget et aucune récurrence ne
  l’utilise. Sinon, la désactivation est proposée.
- **Afficher les catégories désactivées** permet de les réactiver.

Une modification de nom, de couleur ou de description ne change jamais les montants ni les dates des
opérations.

---

## 6. Budgets mensuels

Menu **Budgets**, choisir un mois.

1. Cliquer sur **Définir un budget** (ou sur **Définir** en face d’une catégorie).
2. Choisir une catégorie de dépense.
3. Saisir un montant prévisionnel entier.
4. Ajuster le seuil d’alerte (80 % par défaut).

Chaque ligne affiche le budget, la consommation du mois, le reste, une barre de progression et
l’état : **Normal**, **Alerte**, **Dépassé**, **Non défini**. Un budget nul affiche « Budget nul »
et aucun pourcentage.

La consommation ne prend en compte que les dépenses datées dans ce mois précis. Un budget de janvier
n’est jamais impacté par une dépense de février. Les rapports trimestriels, semestriels et annuels
additionnent les budgets des mois concernés.

Un dépassement est signalé en haut de la page et sur le tableau de bord. Il n’est jamais masqué.

---

## 7. Récurrences

Menu **Récurrences** pour un salaire, un loyer, un abonnement, etc.

1. Cliquer sur **Nouvelle récurrence**.
2. Choisir le type, le montant, la catégorie, le libellé, la fréquence, la date de début et
   éventuellement une date de fin.
3. Laisser la règle active.

Une récurrence ne crée **aucune** opération automatiquement. Elle affiche :

- sa prochaine échéance et les échéances prévisionnelles suivantes ;
- un statut : à venir, due aujourd’hui, en retard, suspendue ou terminée ;
- l’action **Matérialiser**.

**Matérialiser** ouvre une confirmation rappelant la date et le montant. Après validation, une
opération réelle est créée et la prochaine échéance avance. Une même échéance ne peut pas être créée
deux fois : la clé d’unicité est garantie par la base.

Si la date de début est un 31, les mois plus courts utilisent leur dernier jour, puis le 31 est
repris le mois suivant. Le 29 février est conservé pour les années bissextiles.

**Suspendre** empêche toute nouvelle matérialisation. **Supprimer la règle** ne supprime jamais les
opérations déjà créées : elles restent dans l’historique.

---

## 8. Importer un fichier CSV ou XLSX

Menu **Import & export**.

1. Choisir un fichier `.csv` ou `.xlsx` (10 Mo maximum).
2. Indiquer si la première ligne contient les en-têtes.
3. Vérifier l’association des colonnes : date, montant et catégorie sont obligatoires.
4. Cliquer sur **Contrôler les lignes**.
5. Examiner les statistiques, les anomalies, les doublons et les 25 premières lignes valides.
6. Choisir la stratégie pour les doublons :
   - les ignorer (recommandé) ;
   - ou tout importer.
7. Si nécessaire, cocher l’arrondi explicite des montants décimaux (les lignes concernées sont
   listées).
8. Cliquer sur **Importer**.

Les lignes invalides ne sont jamais importées silencieusement. Le rapport final indique le nombre
d’opérations importées, de doublons ignorés, de lignes invalides et d’arrondis.

Le type peut être déduit de la catégorie s’il manque. Un libellé vide prend le nom de la catégorie.
Les catégories inconnues sont refusées : créez-les avant l’import.

Un exemple de fichier est disponible :
[`examples/import-exemple.csv`](../examples/import-exemple.csv).

---

## 9. Rapports et exports

Menu **Rapports**.

1. Choisir le type de période (mois, trimestre, semestre, année), la date et l’année.
2. Lire la synthèse, la comparaison avec la période précédente, les tableaux par catégorie, le
   détail mensuel et les budgets.
3. Cliquer sur **Excel** ou **PDF**.

Le rapport PDF contient le titre, la période, la date de génération, les totaux, la comparaison, les
graphiques, les tableaux par catégorie, les budgets, la devise et la pagination.

Le bouton **Excel** produit un classeur avec les feuilles Synthèse, Opérations, Catégories, Budgets
et Mensuel. Les montants y sont numériques, les dates typées, et les textes saisis ne peuvent pas
être interprétés comme des formules.

Les totaux affichés à l’écran, dans Excel et dans le PDF sont calculés par la même fonction métier.

---

## 10. Sauvegarder et restaurer

Menu **Import & export**.

- **Sauvegarde complète JSON** : télécharge toutes les données, y compris les paramètres.
- **Export Excel complet** : version lisible dans un tableur (opérations, catégories, budgets,
  récurrences, paramètres).
- **Restaurer une sauvegarde…** : sélectionne un fichier JSON. L’application valide tout le fichier
  puis demande une confirmation détaillée avant de remplacer les données.

Recommandation : effectuer une sauvegarde avant une mise à jour, un import massif ou une
réinitialisation. Conserver la sauvegarde sur un support de confiance : le fichier n’est pas chiffré.

Le menu **Paramètres** indique l’espace de stockage utilisé et rappelle que les données sont locales
et non chiffrées. **Réinitialiser l’application** efface tout après confirmation et recrée les
catégories par défaut.

---

## 11. Accessibilité et confort

- Navigation complète au clavier ; le focus est visible.
- Les fenêtres modales piègent le focus et se ferment avec `Échap`.
- Les formulaires ont des libellés explicites et des messages d’erreur associés.
- Les couleurs ne sont jamais le seul indicateur : les types sont aussi écrits en toutes lettres.
- Thème clair, sombre ou système, mémorisé.
- Les animations sont réduites si le système le demande.

---

## 12. Questions fréquentes

**Pourquoi mon solde disponible diffère-t-il du solde du mois ?**
Le solde disponible cumule tout l’historique depuis le solde initial. Le solde net ne concerne que
la période sélectionnée.

**Pourquoi une dépense n’apparaît-elle pas dans le budget du mois ?**
Vérifiez sa date : le budget utilise le mois de la date de l’opération, pas la date de saisie.

**Pourquoi une récurrence ne modifie-t-elle pas mon solde ?**
Une échéance prévue n’est pas une opération. Utilisez **Matérialiser** pour créer l’opération réelle.

**Puis-je supprimer une catégorie utilisée ?**
Non, pour préserver l’intégrité de l’historique. Désactivez-la.

**Que se passe-t-il si j’importe deux fois le même fichier ?**
Les doublons sont détectés par date, type, montant, catégorie et libellé. Par défaut, ils sont
ignorés. Vous pouvez choisir de les importer malgré tout.

**Où sont mes données ?**
Dans la base IndexedDB du navigateur, sur cet ordinateur. Elles ne sont pas envoyées en ligne. Pour
les déplacer, utilisez la sauvegarde JSON.

**Comment retrouver mes données après avoir effacé les données du navigateur ?**
Uniquement en restaurant une sauvegarde JSON. C’est pourquoi une sauvegarde régulière est
recommandée.
