import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { clearAllData, updateSettings } from '../data/repository';
import { availableBalanceAt } from '../domain/calculations';
import { formatDisplayDate } from '../domain/format';
import { parseAmount } from '../domain/money';
import { todayISO } from '../domain/periods';
import {
  Button,
  Card,
  ConfirmDialog,
  Field,
  InlineAlert,
  Money,
  PageHeader,
} from '../components/ui';
import { Icon, type IconName } from '../components/Icon';

function parseInitialBalance(raw: string): { amount?: number; error?: string } {
  const text = raw.trim();
  if (!text) return { error: 'Saisissez un solde initial (0 est accepté).' };
  if (text === '0') return { amount: 0 };
  const negative = text.startsWith('-') || text.startsWith('−');
  const body = negative ? text.slice(1) : text;
  const parsed = parseAmount(body);
  if (!parsed.ok) {
    if (parsed.code === 'zero') return { amount: 0 };
    return { error: 'Le solde initial doit être un entier de FCFA.' };
  }
  return { amount: negative ? -parsed.amount : parsed.amount };
}

export default function SettingsPage() {
  const {
    settings,
    transactions,
    categories,
    budgets,
    recurrences,
    run,
    notify,
  } = useApp();
  const [initialBalanceText, setInitialBalanceText] = useState(String(settings.initialBalance));
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [savingBalance, setSavingBalance] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const available = useMemo(
    () => availableBalanceAt(transactions, settings.initialBalance, todayISO()),
    [transactions, settings.initialBalance],
  );

  const saveInitialBalance = async (event: FormEvent) => {
    event.preventDefault();
    setBalanceError(null);
    const parsed = parseInitialBalance(initialBalanceText);
    if (parsed.amount === undefined) {
      setBalanceError(parsed.error ?? 'Solde initial invalide.');
      return;
    }
    setSavingBalance(true);
    const result = await run(
      () => updateSettings({ initialBalance: parsed.amount }),
      'Solde initial enregistré. Les soldes disponibles sont recalculés.',
    );
    setSavingBalance(false);
    if (result.ok) setInitialBalanceText(String(parsed.amount));
  };

  const changeSetting = async (
    patch: Parameters<typeof updateSettings>[0],
    message: string,
  ) => {
    await run(() => updateSettings(patch), message);
  };

  const resetApplication = async () => {
    setResetting(true);
    const result = await run(
      () => clearAllData(),
      'Application réinitialisée avec les catégories par défaut.',
    );
    setResetting(false);
    if (result.ok) {
      setResetOpen(false);
      setInitialBalanceText('0');
      notify('Toutes les données ont été effacées.', 'info');
    }
  };

  const themeOptions: { value: 'light' | 'dark' | 'system'; label: string; icon: IconName }[] = [
    { value: 'light', label: 'Clair', icon: 'sun' },
    { value: 'dark', label: 'Sombre', icon: 'moon' },
    { value: 'system', label: 'Système', icon: 'monitor' },
  ];

  return (
    <>
      <PageHeader
        title="Paramètres"
        subtitle="Préférences d’affichage, solde initial et gestion du stockage local."
      />

      <div className="settings-grid">
        <Card title="Solde initial" subtitle="Point de départ de votre historique">
          <form className="stack" onSubmit={saveInitialBalance} noValidate>
            <p className="small muted">
              Le solde disponible cumulé = solde initial + revenus − dépenses jusqu’à la date
              consultée. Modifier cette valeur recalcule tous les soldes disponibles, sans toucher
              aux opérations.
            </p>
            <Field
              label="Solde initial (FCFA)"
              htmlFor="initial-balance"
              error={balanceError ?? undefined}
              hint="Entier, positif, nul ou négatif accepté. Ex. 50 000 ou -20 000."
            >
              <div className="input-money">
                <input
                  id="initial-balance"
                  className="input"
                  inputMode="numeric"
                  value={initialBalanceText}
                  onChange={(event) => setInitialBalanceText(event.target.value)}
                  aria-invalid={Boolean(balanceError)}
                />
                <span className="suffix">FCFA</span>
              </div>
            </Field>
            <div className="row-between">
              <span className="small muted">
                Solde disponible aujourd’hui : <Money value={available} />
              </span>
              <Button variant="primary" type="submit" disabled={savingBalance}>
                {savingBalance ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
            <p className="hint">
              Il s’agit d’une situation de départ, pas d’un revenu. Le solde net d’une période ne
              dépend jamais du solde initial.
            </p>
          </form>
        </Card>

        <Card title="Apparence" subtitle="Thème appliqué à l’application">
          <div className="stack">
            <div className="theme-options">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="theme-option"
                  aria-pressed={settings.theme === option.value}
                  onClick={() => changeSetting({ theme: option.value }, `Thème « ${option.label} » appliqué.`)}
                >
                  <Icon name={option.icon} size={22} />
                  {option.label}
                </button>
              ))}
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <strong>Format des dates</strong>
                <span>Affichage dans les tableaux et formulaires.</span>
              </div>
              <select
                className="select"
                style={{ width: 'auto' }}
                value={settings.dateFormat}
                aria-label="Format des dates"
                onChange={(event) =>
                  changeSetting(
                    { dateFormat: event.target.value as typeof settings.dateFormat },
                    'Format de date mis à jour.',
                  )
                }
              >
                <option value="DD/MM/YYYY">JJ/MM/AAAA</option>
                <option value="YYYY-MM-DD">AAAA-MM-JJ</option>
              </select>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <strong>Format des nombres</strong>
                <span>Séparateur des milliers.</span>
              </div>
              <select
                className="select"
                style={{ width: 'auto' }}
                value={settings.numberFormat}
                aria-label="Format des nombres"
                onChange={(event) =>
                  changeSetting(
                    { numberFormat: event.target.value as typeof settings.numberFormat },
                    'Format des nombres mis à jour.',
                  )
                }
              >
                <option value="fr-FR">Français (1 234 567)</option>
                <option value="en-US">Anglais (1,234,567)</option>
              </select>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <strong>Devise</strong>
                <span>Franc CFA BCEAO, sans décimale et sans conversion.</span>
              </div>
              <strong className="small">XOF · FCFA</strong>
            </div>
          </div>
        </Card>

        <Card title="Données et stockage" subtitle="Tout reste sur cet ordinateur">
          <div className="stack">
            <div className="setting-row">
              <div className="setting-info">
                <strong>Stockage</strong>
                <span>Base IndexedDB locale, non chiffrée.</span>
              </div>
              <span className="badge badge-success">Hors ligne</span>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <strong>Volume de données</strong>
                <span>
                  {transactions.length} opération(s) · {categories.length} catégorie(s)
                </span>
              </div>
              <span className="small muted">
                {budgets.length} budget(s) · {recurrences.length} récurrence(s)
              </span>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <strong>Sauvegarde</strong>
                <span>Export JSON complet et restauration validée.</span>
              </div>
              <Link className="btn btn-sm btn-secondary" to="/donnees">
                Gérer
              </Link>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <strong>Version</strong>
                <span>
                  Application 1.0.0 · données v{settings.version} · schéma 1
                </span>
              </div>
              <span className="small muted">Dernière ouverture : aujourd’hui</span>
            </div>
          </div>
        </Card>

        <Card title="Confidentialité et limites" subtitle="Ce que l’application garantit">
          <div className="stack-sm small muted">
            <p>
              Aucune donnée financière n’est transmise à un service externe. Les calculs, les
              imports et les exports sont exécutés dans ce navigateur.
            </p>
            <p>
              Le stockage local n’est pas chiffré : protégez votre session Windows et vos
              sauvegardes. Effacer les données du site ou utiliser un autre navigateur rend les
              données invisibles ; utilisez la sauvegarde JSON pour les transférer.
            </p>
            <p>
              Les fichiers importés sont traités comme des données non fiables : contrôles de
              format, de taille et validation ligne par ligne.
            </p>
            <p>
              Dernière date de référence affichée :{' '}
              {formatDisplayDate(todayISO(), settings.dateFormat)}.
            </p>
          </div>
        </Card>
      </div>

      <div className="section">
        <Card title="Zone sensible" subtitle="Actions irréversibles">
          <div className="stack">
            <InlineAlert tone="warning">
              Réinitialiser efface toutes les opérations, catégories personnalisées, budgets,
              récurrences et paramètres, puis restaure les catégories par défaut. Pensez à
              télécharger une sauvegarde avant de continuer.
            </InlineAlert>
            <div className="row">
              <Link className="btn btn-secondary" to="/donnees">
                <Icon name="download" size={16} /> Sauvegarder d’abord
              </Link>
              <Button variant="danger" onClick={() => setResetOpen(true)} icon="trash">
                Réinitialiser l’application
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={resetOpen}
        title="Réinitialiser toute l’application ?"
        description={
          <>
            <strong>Cette action est irréversible.</strong> Les {transactions.length} opération(s),{' '}
            {categories.length} catégorie(s), {budgets.length} budget(s) et {recurrences.length}{' '}
            récurrence(s) seront définitivement supprimés de ce navigateur. Les catégories par
            défaut seront recréées avec un solde initial nul.
          </>
        }
        confirmLabel="Tout effacer"
        danger
        busy={resetting}
        onCancel={() => setResetOpen(false)}
        onConfirm={resetApplication}
      />
    </>
  );
}
