import { useMemo, useState, type FormEvent } from 'react';
import { useApp } from '../state/AppContext';
import type { Category, TransactionType } from '../domain/types';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../data/defaults';
import {
  createCategory,
  deleteCategory,
  setCategoryActive,
  updateCategory,
  type CategoryInput,
} from '../data/repository';
import { validateCategoryName } from '../domain/validation';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  InlineAlert,
  Modal,
  PageHeader,
  SegmentedControl,
} from '../components/ui';
import { Icon, isIconName, type IconName } from '../components/Icon';

export default function CategoriesPage() {
  const { categories, transactions, budgets, recurrences, run } = useApp();
  const [type, setType] = useState<TransactionType>('expense');
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showInactive, setShowInactive] = useState(true);

  const usage = useMemo(() => {
    const map = new Map<string, { transactions: number; budgets: number; recurrences: number }>();
    for (const category of categories) {
      map.set(category.id, { transactions: 0, budgets: 0, recurrences: 0 });
    }
    for (const transaction of transactions) {
      const entry = map.get(transaction.categoryId);
      if (entry) entry.transactions += 1;
    }
    for (const budget of budgets) {
      const entry = map.get(budget.categoryId);
      if (entry) entry.budgets += 1;
    }
    for (const rule of recurrences) {
      const entry = map.get(rule.categoryId);
      if (entry) entry.recurrences += 1;
    }
    return map;
  }, [categories, transactions, budgets, recurrences]);

  const rows = useMemo(
    () =>
      categories
        .filter((category) => category.type === type)
        .filter((category) => showInactive || category.isActive)
        .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, 'fr')),
    [categories, type, showInactive],
  );

  const counts = useMemo(
    () => ({
      expense: categories.filter((category) => category.type === 'expense').length,
      income: categories.filter((category) => category.type === 'income').length,
    }),
    [categories],
  );

  const toggleActive = async (category: Category) => {
    setBusyId(category.id);
    await run(
      () => setCategoryActive(category.id, !category.isActive),
      category.isActive
        ? `Catégorie « ${category.name} » désactivée. L’historique est conservé.`
        : `Catégorie « ${category.name} » réactivée.`,
    );
    setBusyId(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await run(
      () => deleteCategory(pendingDelete.id),
      `Catégorie « ${pendingDelete.name} » supprimée.`,
    );
    setDeleting(false);
    if (result.ok) setPendingDelete(null);
  };

  const deleteUsage = pendingDelete ? usage.get(pendingDelete.id) : undefined;
  const deleteBlocked = Boolean(
    deleteUsage && (deleteUsage.transactions > 0 || deleteUsage.budgets > 0 || deleteUsage.recurrences > 0),
  );

  return (
    <>
      <PageHeader
        title="Catégories"
        subtitle="Organisez vos revenus et vos dépenses. Une catégorie utilisée dans l’historique ne peut pas être supprimée : désactivez-la pour préserver l’intégrité des chiffres."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            Nouvelle catégorie
          </Button>
        }
      />

      <div className="row-between mb-3">
        <SegmentedControl
          ariaLabel="Type de catégories"
          value={type}
          onChange={setType}
          options={[
            { value: 'expense', label: `Dépenses (${counts.expense})`, icon: 'arrow-up-right' },
            { value: 'income', label: `Revenus (${counts.income})`, icon: 'arrow-down-right' },
          ]}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
          />
          Afficher les catégories désactivées
        </label>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="categories"
          title="Aucune catégorie à afficher"
          description="Créez une catégorie pour classer vos opérations."
          actions={
            <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
              Créer une catégorie
            </Button>
          }
        />
      ) : (
        <div className="category-grid">
          {rows.map((category) => {
            const categoryUsage = usage.get(category.id);
            const isUsed = Boolean(
              categoryUsage &&
                (categoryUsage.transactions > 0 ||
                  categoryUsage.budgets > 0 ||
                  categoryUsage.recurrences > 0),
            );
            return (
              <article
                key={category.id}
                className={`category-card${category.isActive ? '' : ' inactive'}`}
              >
                <div className="category-card-top">
                  <span
                    className="category-color-dot"
                    style={{ background: category.color }}
                    aria-hidden="true"
                  >
                    <Icon name={isIconName(category.icon) ? category.icon : 'tag'} size={16} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="category-card-name">{category.name}</div>
                    <div className="row" style={{ gap: 6, marginTop: 3 }}>
                      <Badge tone={category.type === 'income' ? 'income' : 'expense'}>
                        {category.type === 'income' ? 'Revenu' : 'Dépense'}
                      </Badge>
                      {!category.isActive && <Badge tone="neutral">Désactivée</Badge>}
                    </div>
                  </div>
                </div>
                <p className="category-card-desc">{category.description || 'Sans description.'}</p>
                <div className="category-card-foot">
                  <span className="small muted">
                    {categoryUsage?.transactions ?? 0} opération
                    {(categoryUsage?.transactions ?? 0) > 1 ? 's' : ''}
                    {isUsed ? ' · utilisée' : ''}
                  </span>
                  <div className="row-actions">
                    <IconButton
                      icon="edit"
                      label={`Modifier ${category.name}`}
                      onClick={() => setEditing(category)}
                    />
                    <IconButton
                      icon={category.isActive ? 'power' : 'refresh'}
                      label={
                        category.isActive
                          ? `Désactiver ${category.name}`
                          : `Réactiver ${category.name}`
                      }
                      onClick={() => toggleActive(category)}
                      disabled={busyId === category.id}
                    />
                    <IconButton
                      icon="trash"
                      label={`Supprimer ${category.name}`}
                      variant="danger"
                      onClick={() => setPendingDelete(category)}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-3">
        <InlineAlert tone="info">
          Désactiver une catégorie la retire des formulaires sans toucher aux opérations déjà
          enregistrées. Les montants historiques ne sont jamais réécrits.
        </InlineAlert>
      </div>

      {editing && (
        <CategoryFormModal
          key={editing === 'new' ? `new-${type}` : editing.id}
          category={editing === 'new' ? undefined : editing}
          initialType={type}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Supprimer cette catégorie ?"
        description={
          pendingDelete ? (
            <>
              <strong>{pendingDelete.name}</strong>.{' '}
              {deleteBlocked
                ? 'Cette catégorie est utilisée par des opérations, budgets ou récurrences : la suppression est refusée pour préserver l’intégrité des données. Désactivez-la à la place.'
                : 'Aucune opération, budget ou récurrence ne l’utilise. La suppression est définitive.'}
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Supprimer"
        danger
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      >
        {deleteBlocked && (
          <Button
            onClick={() => {
              if (pendingDelete) {
                void toggleActive(pendingDelete);
                setPendingDelete(null);
              }
            }}
          >
            Désactiver plutôt
          </Button>
        )}
      </ConfirmDialog>
    </>
  );
}

function CategoryFormModal({
  category,
  initialType,
  onClose,
}: {
  category?: Category;
  initialType: TransactionType;
  onClose: () => void;
}) {
  const { categories, run } = useApp();
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [color, setColor] = useState(
    category?.color ?? CATEGORY_COLORS[(categories.length * 3) % CATEGORY_COLORS.length],
  );
  const [icon, setIcon] = useState<IconName>(
    category && isIconName(category.icon) ? category.icon : 'tag',
  );
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const type = category?.type ?? initialType;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const validationError = validateCategoryName(name, type, categories, category?.id);
    setNameError(validationError);
    if (validationError) return;
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      setError('Sélectionnez une couleur valide.');
      return;
    }
    const input: CategoryInput = {
      name,
      type,
      color,
      icon,
      description,
      isActive,
    };
    setBusy(true);
    const result = await run(
      () => (category ? updateCategory(category.id, input) : createCategory(input)),
      category ? 'Catégorie modifiée.' : 'Catégorie créée.',
    );
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  };

  return (
    <Modal
      open
      title={category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
      subtitle={
        category
          ? 'Le type et l’historique des opérations restent inchangés.'
          : `Catégorie de ${type === 'income' ? 'revenus' : 'dépenses'}.`
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const form = document.getElementById('category-form') as HTMLFormElement | null;
              form?.requestSubmit();
            }}
            disabled={busy}
          >
            {busy ? 'Enregistrement…' : category ? 'Enregistrer' : 'Créer la catégorie'}
          </Button>
        </>
      }
    >
      <form id="category-form" className="stack" onSubmit={handleSubmit} noValidate>
        <Field label="Nom" htmlFor="category-name" error={nameError ?? undefined} required>
          <input
            id="category-name"
            className="input"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(nameError)}
            placeholder="Ex. Alimentation"
            required
          />
        </Field>

        <Field
          label="Description (facultative)"
          htmlFor="category-description"
          hint="Aide à comprendre ce que regroupe cette catégorie."
        >
          <textarea
            id="category-description"
            className="textarea"
            value={description}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Courses, marché, repas…"
          />
        </Field>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 8 }}>
            Couleur
          </legend>
          <div className="row" style={{ gap: 7 }}>
            {CATEGORY_COLORS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-label={`Couleur ${preset}`}
                aria-pressed={color.toLowerCase() === preset.toLowerCase()}
                onClick={() => setColor(preset)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: preset,
                  border:
                    color.toLowerCase() === preset.toLowerCase()
                      ? '2px solid var(--text)'
                      : '2px solid transparent',
                  boxShadow: '0 0 0 1px var(--border)',
                }}
              />
            ))}
            <label className="small muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                aria-label="Couleur personnalisée"
                style={{ width: 34, height: 30, border: 'none', background: 'none' }}
              />
              Personnalisée
            </label>
          </div>
        </fieldset>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 8 }}>
            Icône
          </legend>
          <div className="row" style={{ gap: 6 }}>
            {CATEGORY_ICONS.map((preset) => {
              const iconName = isIconName(preset) ? preset : 'tag';
              return (
                <button
                  key={preset}
                  type="button"
                  aria-label={`Icône ${preset}`}
                  aria-pressed={icon === iconName}
                  onClick={() => setIcon(iconName)}
                  className="icon-tile"
                  style={{
                    width: 34,
                    height: 34,
                    borderColor: icon === iconName ? 'var(--accent)' : undefined,
                    boxShadow: icon === iconName ? '0 0 0 2px var(--ring)' : undefined,
                  }}
                >
                  <Icon name={iconName} size={17} />
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Catégorie active (disponible dans les formulaires de saisie)
        </label>

        {error && <div className="form-error">{error}</div>}
      </form>
    </Modal>
  );
}
