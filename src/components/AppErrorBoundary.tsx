import React from 'react';

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('SortSight AI render error:', error, info.componentStack);
    }
  }

  private retry = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12 text-slate-900 dark:bg-[#070B14] dark:text-slate-100">
          <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl dark:border-slate-800 dark:bg-[#0F172A]">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
              <span className="text-xl font-bold" aria-hidden="true">!</span>
            </div>
            <h1 className="mt-5 font-display text-xl font-bold">Something went wrong</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">SortSight AI hit an unexpected interface error. Your saved server data has not been intentionally changed. Reload the application to try again.</p>
            <button type="button" onClick={this.retry} className="mt-6 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500">Reload application</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
