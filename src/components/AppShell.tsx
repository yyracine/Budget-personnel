import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { Icon, type IconName } from './Icon';
import { isRuleDue } from '../domain/recurrence';
import { todayISO } from '../domain/periods';
import { updateSettings } from '../data/repository';
import { IconButton } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

const NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Pilotage',
    items: [
      { to: '/', label: 'Tableau de bord', icon: 'dashboard', end: true },
      { to: '/operations', label: 'Opérations', icon: 'list' },
      { to: '/rapports', label: 'Rapports', icon: 'chart' },
    ],
  },
  {
    heading: 'Gestion',
    items: [
      { to: '/revenus', label: 'Revenus', icon: 'arrow-down-right' },
      { to: '/depenses', label: 'Dépenses', icon: 'arrow-up-right' },
      { to: '/categories', label: 'Catégories', icon: 'categories' },
      { to: '/budgets', label: 'Budgets', icon: 'target' },
      { to: '/recurrences', label: 'Récurrences', icon: 'repeat' },
    ],
  },
  {
    heading: 'Données',
    items: [
      { to: '/donnees', label: 'Import & export', icon: 'database' },
      { to: '/parametres', label: 'Paramètres', icon: 'settings' },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

export function AppShell({ children }: { children: ReactNode }) {
  const { openTransactionEditor, recurrences, settings, run } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const location = useLocation();

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setSystemDark(media.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  const today = todayISO();
  const dueCount = recurrences.filter((rule) => isRuleDue(rule, today)).length;
  const current =
    ALL_ITEMS.find((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
    ) ?? ALL_ITEMS[0];

  const resolvedTheme =
    settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;

  const toggleTheme = async () => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    await run(
      () => updateSettings({ theme: next }),
      `Thème ${next === 'dark' ? 'sombre' : 'clair'} activé.`,
    );
  };

  return (
    <div className="shell">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`} aria-label="Navigation principale">
        <NavLink to="/" className="brand" aria-label="Budget personnel, accueil">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="wallet" size={22} />
          </span>
          <span className="brand-text">
            <span className="brand-name">Budget personnel</span>
            <span className="brand-sub">Franc CFA · XOF</span>
          </span>
        </NavLink>

        <nav className="nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.heading}>
              <div className="nav-heading">{group.heading}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  <Icon name={item.icon} size={17} className="nav-icon" />
                  <span>{item.label}</span>
                  {item.to === '/recurrences' && dueCount > 0 && (
                    <span className="nav-badge" aria-label={`${dueCount} échéance(s) à matérialiser`}>
                      {dueCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span>
            Stockage local · <strong>IndexedDB</strong>
          </span>
          <span>Aucune donnée envoyée en ligne.</span>
          <span>Version 1.0.0</span>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <button
            type="button"
            className="btn btn-ghost btn-icon mobile-only"
            aria-label="Ouvrir le menu"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <Icon name="menu" size={18} />
          </button>
          <div>
            <div style={{ fontSize: 13, fontWeight: 650 }}>{current.label}</div>
            <div className="topbar-meta">
              <span>Données locales</span>
              <span aria-hidden="true">·</span>
              <span>{settings.dateFormat}</span>
            </div>
          </div>
          <div className="topbar-spacer" />
          <div className="topbar-meta">
            {dueCount > 0 && (
              <NavLink to="/recurrences" className="badge badge-warning" style={{ textDecoration: 'none' }}>
                {dueCount} échéance{dueCount > 1 ? 's' : ''} à traiter
              </NavLink>
            )}
            <IconButton
              icon={resolvedTheme === 'dark' ? 'sun' : 'moon'}
              label="Changer de thème"
              onClick={toggleTheme}
              variant="ghost"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => openTransactionEditor('expense')}
            >
              <Icon name="plus" size={16} />
              Nouvelle opération
            </button>
          </div>
        </header>
        <main id="contenu" className="main">
          {children}
        </main>
      </div>
    </div>
  );
}
