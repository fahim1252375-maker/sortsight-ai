import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

export type ToastTone = 'success' | 'info' | 'warning' | 'critical';

interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue>({
  pushToast: () => undefined,
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const toneStyles: Record<ToastTone, { border: string; icon: React.ReactNode }> = {
    success: {
      border: 'border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />,
    },
    info: {
      border: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900',
      icon: <Info className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />,
    },
    warning: {
      border: 'border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900',
      icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />,
    },
    critical: {
      border: 'border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900',
      icon: <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />,
    },
  };

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-[min(380px,calc(100vw-2rem))] pointer-events-none"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto rounded-lg border shadow-lg p-3.5 flex items-start gap-2.5 text-sm ${toneStyles[toast.tone].border}`}
          >
            {toneStyles[toast.tone].icon}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-900 dark:text-slate-100 leading-snug">{toast.title}</div>
              {toast.description && (
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">{toast.description}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
