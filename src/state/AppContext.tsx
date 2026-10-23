import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AppSettings,
  Budget,
  Category,
  RecurrenceRule,
  Transaction,
  TransactionType,
} from '../domain/types';
import { DEFAULT_SETTINGS } from '../data/defaults';
import { ensureInitialized } from '../data/db';
import { loadSnapshot, type DataSnapshot } from '../data/repository';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface EditorState {
  type: TransactionType;
  transaction?: Transaction;
}

export type RunResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

interface AppContextValue extends DataSnapshot {
  loading: boolean;
  loadError: string | null;
  refresh: () => Promise<void>;
  run: <T>(action: () => Promise<T>, successMessage?: string) => Promise<RunResult<T>>;
  notify: (message: string, tone?: ToastTone) => void;
  toasts: ToastItem[];
  dismissToast: (id: number) => void;
  editor: EditorState | null;
  openTransactionEditor: (type?: TransactionType, transaction?: Transaction) => void;
  closeTransactionEditor: () => void;
  reloadApplication: () => void;
}

const EMPTY_SNAPSHOT: DataSnapshot = {
  settings: { ...DEFAULT_SETTINGS },
  categories: [],
  transactions: [],
  budgets: [],
  recurrences: [],
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<DataSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const refreshSequence = useRef(0);
  const toastId = useRef(0);
  const timers = useRef<number[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = (toastId.current += 1);
      setToasts((current) => [...current.slice(-3), { id, message, tone }]);
      const timer = window.setTimeout(() => dismissToast(id), tone === 'error' ? 8000 : 4500);
      timers.current.push(timer);
    },
    [dismissToast],
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const refresh = useCallback(async () => {
    const sequence = (refreshSequence.current += 1);
    const next = await loadSnapshot();
    if (sequence === refreshSequence.current) {
      setSnapshot(next);
      setLoadError(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureInitialized();
        const next = await loadSnapshot();
        if (!cancelled) {
          setSnapshot(next);
          setLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Impossible d’ouvrir la base de données locale.',
          );
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = useCallback(
    async <T,>(action: () => Promise<T>, successMessage?: string): Promise<RunResult<T>> => {
      try {
        const value = await action();
        await refresh();
        if (successMessage) notify(successMessage, 'success');
        return { ok: true, value };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
        notify(message, 'error');
        return { ok: false, error: message };
      }
    },
    [notify, refresh],
  );

  const openTransactionEditor = useCallback(
    (type: TransactionType = 'expense', transaction?: Transaction) => {
      setEditor({ type: transaction?.type ?? type, transaction });
    },
    [],
  );

  const closeTransactionEditor = useCallback(() => setEditor(null), []);

  const reloadApplication = useCallback(() => {
    window.location.reload();
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      ...snapshot,
      loading,
      loadError,
      refresh,
      run,
      notify,
      toasts,
      dismissToast,
      editor,
      openTransactionEditor,
      closeTransactionEditor,
      reloadApplication,
    }),
    [
      snapshot,
      loading,
      loadError,
      refresh,
      run,
      notify,
      toasts,
      dismissToast,
      editor,
      openTransactionEditor,
      closeTransactionEditor,
      reloadApplication,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp doit être utilisé dans AppProvider.');
  return context;
}

export function useCategoriesByType(type: TransactionType): Category[] {
  const { categories } = useApp();
  return useMemo(
    () =>
      categories
        .filter((category) => category.type === type && category.isActive)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [categories, type],
  );
}

export function useSettings(): AppSettings {
  return useApp().settings;
}

export function useBudgets(): Budget[] {
  return useApp().budgets;
}

export function useRecurrences(): RecurrenceRule[] {
  return useApp().recurrences;
}
