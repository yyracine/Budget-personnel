import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './state/AppContext';
import { AppShell } from './components/AppShell';
import { TransactionEditor } from './components/TransactionEditor';
import { Icon } from './components/Icon';
import { Button } from './components/ui';
import { setDisplayNumberFormat } from './domain/money';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import CategoriesPage from './pages/CategoriesPage';
import BudgetsPage from './pages/BudgetsPage';
import RecurrencesPage from './pages/RecurrencesPage';
import ReportsPage from './pages/ReportsPage';
import DataToolsPage from './pages/DataToolsPage';
import SettingsPage from './pages/SettingsPage';

const TITLES: Record<string, string> = {
  '/': 'Tableau de bord',
  '/operations': 'Opérations',
  '/revenus': 'Revenus',
  '/depenses': 'Dépenses',
  '/categories': 'Catégories',
  '/budgets': 'Budgets',
  '/recurrences': 'Récurrences',
  '/rapports': 'Rapports',
  '/donnees': 'Import & export',
  '/parametres': 'Paramètres',
};

export default function App() {
  const { settings, loading, loadError, reloadApplication, toasts, dismissToast } = useApp();
  const location = useLocation();

  // Format d’affichage uniquement : appliqué avant le rendu des pages.
  setDisplayNumberFormat(settings.numberFormat);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved =
        settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme;
      root.dataset.theme = resolved;
      const meta = document.querySelector('meta[name="theme-color"]');
      meta?.setAttribute('content', resolved === 'dark' ? '#070b12' : '#f2f5f8');
    };
    apply();
    try {
      localStorage.setItem('budget-theme', settings.theme);
    } catch {
      // Le stockage local du thème est optionnel.
    }
    if (settings.theme === 'system') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
    return undefined;
  }, [settings.theme]);

  useEffect(() => {
    document.title = `${TITLES[location.pathname] ?? 'Budget personnel'} — Budget personnel`;
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-card" role="status" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <span>Ouverture de vos données locales…</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="loading-screen">
        <div className="fatal-card" role="alert">
          <div className="empty-icon" aria-hidden="true">
            <Icon name="alert" size={24} />
          </div>
          <h1 className="page-title" style={{ fontSize: '1.35rem' }}>
            Impossible d’ouvrir le stockage local
          </h1>
          <p className="muted small">
            L’application utilise IndexedDB pour conserver vos données dans ce navigateur. La base
            n’a pas pu être ouverte : {loadError}
          </p>
          <p className="muted small">
            Vérifiez que la navigation privée n’est pas active et que le stockage du site n’est pas
            bloqué, puis rechargez la page.
          </p>
          <div className="row">
            <Button variant="primary" onClick={reloadApplication}>
              Recharger l’application
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/operations" element={<TransactionsPage />} />
          <Route path="/revenus" element={<TransactionsPage lockedType="income" />} />
          <Route path="/depenses" element={<TransactionsPage lockedType="expense" />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/budgets" element={<BudgetsPage />} />
          <Route path="/recurrences" element={<RecurrencesPage />} />
          <Route path="/rapports" element={<ReportsPage />} />
          <Route path="/donnees" element={<DataToolsPage />} />
          <Route path="/parametres" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
      <TransactionEditor />
      <div className="toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`} role="status">
            <Icon
              name={toast.tone === 'error' ? 'alert' : toast.tone === 'success' ? 'check' : 'info'}
              size={16}
            />
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button
              type="button"
              aria-label="Fermer la notification"
              onClick={() => dismissToast(toast.id)}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
