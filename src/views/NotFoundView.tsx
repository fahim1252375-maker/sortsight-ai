import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Compass, LayoutDashboard, Scan } from 'lucide-react';

export const NotFoundView: React.FC<{ isAuthenticated: boolean }> = ({ isAuthenticated }) => {
  return (
    <div className="min-h-[65vh] flex items-center justify-center px-4">
      <div className="max-w-lg w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] p-8 text-center shadow-sm">
        <div className="w-12 h-12 mx-auto rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
          <Compass className="w-6 h-6" />
        </div>
        <div className="mt-4 font-mono text-xs font-semibold uppercase tracking-widest text-slate-400">
          Route 404 · Not Found
        </div>
        <h1 className="mt-1.5 font-display text-2xl font-bold text-slate-900 dark:text-white">
          Industrial Route Unavailable
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          The requested SortSight AI module or record identifier does not exist or belongs to another workspace route.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            to={isAuthenticated ? '/dashboard' : '/'}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
          >
            {isAuthenticated ? <LayoutDashboard className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
            {isAuthenticated ? 'Return to Dashboard' : 'Back to Landing'}
          </Link>
          {isAuthenticated && (
            <Link
              to="/scanner"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap"
            >
              <Scan className="w-3.5 h-3.5" />
              Open Smart Scanner
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};
