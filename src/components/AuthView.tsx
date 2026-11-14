import React, { useEffect, useState } from 'react';
import { ArrowLeft, Building2, Lock, UserCheck } from 'lucide-react';
import { apiRequest, setStoredToken } from '../lib/api.ts';
import { UserSession } from '../types/sortsight.ts';

interface AuthViewProps {
  initialMode: 'login' | 'register';
  onAuthenticated: (user: UserSession) => void;
  onBack: () => void;
}

interface DemoAccountInfo {
  email: string;
  full_name: string;
  role_name: string;
  organization_name: string;
  facility_name: string | null;
}

export const AuthView: React.FC<AuthViewProps> = ({ initialMode, onAuthenticated, onBack }) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('admin@sortsight.demo');
  const [password, setPassword] = useState('SortSightDemo2026!');
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [countryCode, setCountryCode] = useState('US');
  const [region, setRegion] = useState('North America');
  const [demoAccounts, setDemoAccounts] = useState<DemoAccountInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiRequest<{ accounts: DemoAccountInfo[] }>('/auth/demo-accounts')
      .then((res) => setDemoAccounts(res.accounts))
      .catch(() => {});
  }, []);

  const handleLogin = async (targetEmail: string, targetPassword: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: UserSession }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: targetEmail, password: targetPassword }),
      });
      setStoredToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      await handleLogin(email, password);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: UserSession }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          fullName,
          organizationName,
          countryCode,
          region,
        }),
      });
      setStoredToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 px-6">
      <div className="mx-auto w-full max-w-4xl">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Overview
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Form Column */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                  {mode === 'login' ? 'Sign in to SortSight AI' : 'Organization Onboarding'}
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {mode === 'login'
                    ? 'Authenticate to access your tenant-isolated facility workspace.'
                    : 'Provision a new isolated organization, admin role, and primary MRF.'}
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap ${
                    mode === 'login'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setEmail('');
                    setPassword('');
                    setError(null);
                  }}
                  className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap ${
                    mode === 'register'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Register Org
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs text-red-800 dark:text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Dr. Clara Lindqvist"
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Organization Name
                      </label>
                      <input
                        type="text"
                        required
                        value={organizationName}
                        onChange={(e) => setOrganizationName(e.target.value)}
                        placeholder="EuroRecover Materials AB"
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Country Code (ISO)
                      </label>
                      <input
                        type="text"
                        maxLength={2}
                        required
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Operating Region
                      </label>
                      <input
                        type="text"
                        required
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Work Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Password {mode === 'register' && '(minimum 8 characters)'}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60"
              >
                {mode === 'login' ? <Lock className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                {loading ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Create Organization & Sign In'}
              </button>
            </form>
          </div>

          {/* Demo Role Switcher Column */}
          <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
              DEMO ACCOUNTS (SANDBOX EVALUATION)
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Select any seeded role to inspect role-based permissions and multi-tenant isolation. Password: <code className="font-mono">SortSightDemo2026!</code>
            </p>
            <div className="space-y-2.5">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  disabled={loading}
                  onClick={() => handleLogin(acc.email, 'SortSightDemo2026!')}
                  className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-600 dark:hover:border-emerald-500 p-3 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                      {acc.full_name}
                    </span>
                    <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                      {acc.role_name}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                    {acc.email} · {acc.organization_name}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
