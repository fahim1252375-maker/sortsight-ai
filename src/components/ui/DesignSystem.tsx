import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  X,
} from 'lucide-react';

export type StatusTone = 'neutral' | 'emerald' | 'teal' | 'amber' | 'rose' | 'indigo';

const TAG_TONES: Record<StatusTone, string> = {
  neutral:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700',
  emerald:
    'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70',
  teal: 'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800/70',
  amber:
    'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70',
  rose: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/70',
  indigo:
    'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
};

export function StatusTag({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: React.ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold tracking-tight whitespace-nowrap ${TAG_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning';
  size?: 'sm' | 'md';
  loading?: boolean;
}) {
  const variants: Record<string, string> = {
    primary:
      'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 shadow-xs disabled:opacity-50',
    secondary:
      'bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-200 dark:border-slate-700 disabled:opacity-50',
    ghost:
      'bg-transparent hover:bg-slate-100 text-slate-700 border border-transparent dark:hover:bg-slate-800 dark:text-slate-300 disabled:opacity-50',
    danger:
      'bg-rose-600 hover:bg-rose-700 text-white border border-rose-600 shadow-xs disabled:opacity-50',
    warning:
      'bg-amber-500 hover:bg-amber-600 text-slate-950 border border-amber-500 shadow-xs disabled:opacity-50',
  };
  const sizes: Record<string, string> = {
    sm: 'px-2.5 py-1.5 text-xs gap-1.5',
    md: 'px-3.5 py-2 text-sm gap-2',
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
      {children}
    </button>
  );
}

export function Panel({
  children,
  className = '',
  padding = 'p-5',
}: {
  children: React.ReactNode;
  className?: string;
  padding?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/95 shadow-xs ${padding} ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
  badge,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">{title}</h3>
          {badge}
        </div>
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  subtext,
  icon,
  tone = 'neutral',
  provenance,
  onClick,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  tone?: 'neutral' | 'emerald' | 'amber' | 'rose' | 'teal';
  provenance?: 'LIVE' | 'DEMO' | 'MODELED' | 'SIMULATED' | 'VERIFIED';
  onClick?: () => void;
}) {
  const iconTone: Record<string, string> = {
    neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400',
    teal: 'bg-teal-50 text-teal-700 dark:bg-teal-950/70 dark:text-teal-400',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-400',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-400',
  };
  const provTone: Record<string, StatusTone> = {
    LIVE: 'emerald',
    VERIFIED: 'teal',
    DEMO: 'neutral',
    MODELED: 'amber',
    SIMULATED: 'amber',
  };

  const Comp = onClick ? 'button' : 'div';

  return (
    <Comp
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`text-left w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/95 p-4 transition-all ${
        onClick
          ? 'hover:border-emerald-400 dark:hover:border-emerald-700 hover:shadow-sm cursor-pointer group'
          : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{label}</span>
        {icon && <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconTone[tone]}`}>{icon}</div>}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums font-display">
          {value}
        </span>
        {provenance && <StatusTag tone={provTone[provenance]}>{provenance}</StatusTag>}
      </div>
      {subtext && (
        <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between gap-1">
          <span className="truncate">{subtext}</span>
          {onClick && (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 shrink-0 transition-transform group-hover:translate-x-0.5" />
          )}
        </div>
      )}
    </Comp>
  );
}

export function AlertBanner({
  tone = 'info',
  title,
  message,
  action,
}: {
  tone?: 'info' | 'warning' | 'critical' | 'success';
  title?: string;
  message: string;
  action?: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    info: 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300',
    warning:
      'bg-amber-50/90 border-amber-200 text-amber-950 dark:bg-amber-950/30 dark:border-amber-800/70 dark:text-amber-200',
    critical:
      'bg-rose-50/90 border-rose-200 text-rose-950 dark:bg-rose-950/35 dark:border-rose-800/70 dark:text-rose-200',
    success:
      'bg-emerald-50/90 border-emerald-200 text-emerald-950 dark:bg-emerald-950/30 dark:border-emerald-800/70 dark:text-emerald-200',
  };
  const icons: Record<string, React.ReactNode> = {
    info: <Info className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />,
    critical: <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />,
    success: <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />,
  };

  return (
    <div className={`rounded-xl border px-4 py-3 flex flex-wrap items-start justify-between gap-3 text-xs ${styles[tone]}`}>
      <div className="flex items-start gap-2.5 flex-1 min-w-[220px]">
        {icons[tone]}
        <div>
          {title && <div className="font-semibold mb-0.5">{title}</div>}
          <div className="leading-relaxed">{message}</div>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Tabs<T extends string>({
  items,
  activeId,
  onChange,
}: {
  items: Array<{ id: T; label: string; count?: number }>;
  activeId: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80">
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
              active
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <span>{item.label}</span>
            {typeof item.count === 'number' && (
              <span
                className={`px-1.5 py-0.2 rounded text-[10px] tabular-nums font-mono ${
                  active
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-slate-200/80 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 p-8 text-center flex flex-col items-center justify-center">
      {icon && (
        <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center mb-3">
          {icon}
        </div>
      )}
      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md leading-relaxed">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse" aria-label="Loading content">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-200/70 dark:bg-slate-800/70" />
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="h-9 rounded-lg bg-slate-200/60 dark:bg-slate-800/60" />
        ))}
      </div>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (nextPage: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
      <span className="tabular-nums">
        Page {page} of {totalPages} · {totalItems} records
      </span>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="w-3.5 h-3.5" />
          Prev
        </Button>
        <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm Action',
  tone = 'danger',
  loading = false,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: 'danger' | 'warning' | 'primary';
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth="max-w-md">
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{description}</p>
      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button variant={tone} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export interface TableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  pageSize = 10,
  emptyTitle = 'No matching records',
  emptyDescription = 'Adjust filters or add new operational records.',
}: {
  rows: T[];
  columns: Array<TableColumn<T>>;
  rowKey: (row: T) => string;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const sorted = React.useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const getVal = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      return sortDir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }, [rows, columns, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`py-2.5 pr-4 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (sortKey === col.key) {
                          setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                        } else {
                          setSortKey(col.key);
                          setSortDir('desc');
                        }
                      }}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <span>{col.header}</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {pageRows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`py-2.5 pr-4 align-middle ${col.align === 'right' ? 'text-right tabular-nums' : 'text-left'}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={safePage} totalPages={totalPages} totalItems={rows.length} onPageChange={setPage} />
    </div>
  );
}
