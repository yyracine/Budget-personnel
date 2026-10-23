import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './Icon';
import { formatMoney } from '../domain/money';

export function Card({
  title,
  subtitle,
  actions,
  children,
  flush = false,
  className = '',
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`card ${className}`.trim()} id={id}>
      {(title || actions) && (
        <div className="card-header">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      <div className={flush ? 'card-body flush' : 'card-body'}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export type BadgeTone =
  | 'neutral'
  | 'income'
  | 'expense'
  | 'warning'
  | 'danger'
  | 'success'
  | 'info';

export function Badge({
  children,
  tone = 'neutral',
  dot = true,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
}) {
  return (
    <span className={`badge badge-${tone}${dot ? '' : ' no-dot'}`}>{children}</span>
  );
}

export function StatCard({
  label,
  value,
  meta,
  tone = 'default',
  icon,
  valueClassName = '',
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  tone?: 'default' | 'income' | 'expense' | 'warning' | 'info';
  icon?: IconName;
  valueClassName?: string;
}) {
  return (
    <article className={`stat-card${tone === 'default' ? '' : ` tone-${tone}`}`}>
      <div className="stat-label">
        {icon && <Icon name={icon} size={15} />}
        {label}
      </div>
      <div className={`stat-value ${valueClassName}`.trim()}>{value}</div>
      {meta && <div className="stat-meta">{meta}</div>}
    </article>
  );
}

export function Money({
  value,
  signed = false,
  tone = 'auto',
  className = '',
}: {
  value: number;
  signed?: boolean;
  tone?: 'auto' | 'income' | 'expense' | 'neutral';
  className?: string;
}) {
  const text = signed
    ? `${value > 0 ? '+' : value < 0 ? '\u2212' : ''}${formatMoney(Math.abs(value)).replace(/\u00a0|\u202f/g, ' ')}`
    : formatMoney(value).replace(/\u00a0|\u202f/g, ' ');
  let toneClass = '';
  if (tone === 'auto') {
    if (value < 0) toneClass = 'text-expense';
  } else if (tone === 'income') toneClass = 'text-income';
  else if (tone === 'expense') toneClass = 'text-expense';
  return <span className={`num ${toneClass} ${className}`.trim()}>{text}</span>;
}

export function Button({
  variant = 'secondary',
  size,
  icon,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
  size?: 'sm';
  icon?: IconName;
}) {
  return (
    <button
      type="button"
      className={`btn btn-${variant}${size ? ` btn-${size}` : ''} ${className}`.trim()}
      {...props}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  icon: IconName;
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
}) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} btn-icon`}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

export function EmptyState({
  icon = 'sparkle',
  title,
  description,
  actions,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name={icon} size={24} />
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className = '',
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field ${className}`.trim()}>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="required" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && (
        <span className="error-text" id={`${htmlFor}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function ProgressBar({
  value,
  state = 'normal',
  label,
}: {
  value: number;
  state?: 'normal' | 'warning' | 'exceeded';
  label: string;
}) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <div
      className={`progress ${state}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
    >
      <span style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'normal',
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'normal' | 'small' | 'wide';
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousActive = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const dialog = dialogRef.current;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = dialog?.querySelectorAll<HTMLElement>(focusableSelector);
    if (focusables && focusables.length > 0) {
      const firstInput = dialog?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      (firstInput ?? focusables[0]).focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const elements = Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.offsetParent !== null);
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = bodyOverflow;
      previousActive?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`modal${size === 'small' ? ' small' : size === 'wide' ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title" id={titleId}>
              {title}
            </h2>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <IconButton icon="x" label="Fermer" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  onConfirm,
  onCancel,
  busy = false,
  danger = false,
  children,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  danger?: boolean;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      size="small"
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger-solid' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Traitement…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="muted small">{description}</div>
        {children}
      </div>
    </Modal>
  );
}

export function InlineAlert({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  children: ReactNode;
}) {
  const icon: IconName =
    tone === 'danger' || tone === 'warning' ? 'alert' : tone === 'success' ? 'check' : 'info';
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon name={icon} size={16} />
      <div>{children}</div>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string; icon?: IconName; className?: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={option.className ?? ''}
          onClick={() => onChange(option.value)}
        >
          {option.icon && <Icon name={option.icon} size={14} />}
          {option.label}
        </button>
      ))}
    </div>
  );
}
