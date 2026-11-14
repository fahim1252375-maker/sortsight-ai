import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  Box,
  Building,
  Camera,
  CheckSquare,
  ChevronRight,
  ClipboardCheck,
  Cpu,
  Database,
  FileStack,
  GitBranch,
  Globe,
  History,
  KeyRound,
  Layers,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Moon,
  Network,
  Scan,
  Search,
  Settings,
  Shield,
  Sliders,
  Sun,
  User,
  Users,
  Video,
  X,
} from 'lucide-react';
import { t } from '../lib/i18n.ts';
import { getBreadcrumbs } from '../lib/routes.ts';
import { Facility, LanguageCode, UserSession, ViewId } from '../types/sortsight.ts';

interface AppShellProps {
  user: UserSession;
  facilities: Facility[];
  activeFacilityId: string;
  onSelectFacility: (id: string) => void;
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  language: LanguageCode;
  onChangeLanguage: (lang: LanguageCode) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  unreadNotifications: number;
  onOpenCommandPalette: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

interface NavGroup {
  title: string;
  items: Array<{ id: ViewId; labelKey: string; fallbackLabel: string; icon: React.FC<{ className?: string }> }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Command & Overview',
    items: [
      { id: 'dashboard', labelKey: 'dashboard', fallbackLabel: 'Main Dashboard', icon: LayoutDashboard },
      { id: 'product_overview', labelKey: 'overview', fallbackLabel: 'Product Overview', icon: Layers },
    ],
  },
  {
    title: 'Vision & Intelligence',
    items: [
      { id: 'scanner', labelKey: 'scanner', fallbackLabel: 'Smart Waste Scanner', icon: Scan },
      { id: 'realtime', labelKey: 'realtime', fallbackLabel: 'Real-Time Studio', icon: Video },
      { id: 'batch', labelKey: 'batch', fallbackLabel: 'Batch Analysis', icon: FileStack },
      { id: 'materials', labelKey: 'materials', fallbackLabel: 'Material Intelligence', icon: Box },
      { id: 'contamination', labelKey: 'contamination', fallbackLabel: 'Contamination Analysis', icon: Activity },
      { id: 'hazards', labelKey: 'hazards', fallbackLabel: 'Hazard Intelligence', icon: AlertTriangle },
    ],
  },
  {
    title: 'Sorting & Global Rules',
    items: [
      { id: 'sorting', labelKey: 'sorting', fallbackLabel: 'Smart Sorting Engine', icon: Sliders },
      { id: 'conveyor', labelKey: 'conveyor', fallbackLabel: 'Conveyor Monitoring', icon: Camera },
      { id: 'global_rules', labelKey: 'globalRules', fallbackLabel: 'Global Recycling Rules', icon: Globe },
      { id: 'country_rules', labelKey: 'countryRules', fallbackLabel: 'Country & Region Rules', icon: Globe },
      { id: 'directory', labelKey: 'directory', fallbackLabel: 'Facility Directory', icon: Building },
    ],
  },
  {
    title: 'Analytics & Assistant',
    items: [
      { id: 'analytics', labelKey: 'analytics', fallbackLabel: 'Analytics Center', icon: BarChart3 },
      { id: 'environment', labelKey: 'environment', fallbackLabel: 'Environmental Impact', icon: Leaf },
      { id: 'assistant', labelKey: 'assistant', fallbackLabel: 'AI Operator Assistant', icon: Bot },
    ],
  },
  {
    title: 'Human QA & AI/ML',
    items: [
      { id: 'reviews', labelKey: 'reviews', fallbackLabel: 'Human Review Queue', icon: CheckSquare },
      { id: 'annotations', labelKey: 'annotations', fallbackLabel: 'Annotation Workspace', icon: Layers },
      { id: 'models', labelKey: 'models', fallbackLabel: 'Model Management', icon: Cpu },
      { id: 'datasets', labelKey: 'datasets', fallbackLabel: 'Dataset Management', icon: Database },
    ],
  },
  {
    title: 'Digital Twin & Operations',
    items: [
      { id: 'digital_twin', labelKey: 'digitalTwin', fallbackLabel: 'Digital Twin', icon: Network },
      { id: 'simulator', labelKey: 'simulator', fallbackLabel: 'Optimization Simulator', icon: GitBranch },
      { id: 'material_flow', labelKey: 'materialFlow', fallbackLabel: 'Material Flow Explorer', icon: Activity },
      { id: 'operations', labelKey: 'operations', fallbackLabel: 'Operations & Handover', icon: ClipboardCheck },
      { id: 'inventory', labelKey: 'inventory', fallbackLabel: 'Material Inventory', icon: Box },
      { id: 'batches', labelKey: 'batches', fallbackLabel: 'Collection Batches', icon: FileStack },
    ],
  },
  {
    title: 'Platform & Governance',
    items: [
      { id: 'team', labelKey: 'team', fallbackLabel: 'Team & Roles', icon: Users },
      { id: 'notifications', labelKey: 'notifications', fallbackLabel: 'Alert Center', icon: Bell },
      { id: 'developers', labelKey: 'developers', fallbackLabel: 'API & Developers', icon: KeyRound },
      { id: 'security', labelKey: 'security', fallbackLabel: 'Security & Audit', icon: Shield },
      { id: 'settings', labelKey: 'settings', fallbackLabel: 'Organization Settings', icon: Settings },
      { id: 'profile', labelKey: 'profile', fallbackLabel: 'User Profile', icon: User },
      { id: 'admin', labelKey: 'admin', fallbackLabel: 'Admin Control Panel', icon: Shield },
    ],
  },
];

export const AppShell: React.FC<AppShellProps> = ({
  user,
  facilities,
  activeFacilityId,
  onSelectFacility,
  activeView,
  onNavigate,
  language,
  onChangeLanguage,
  isDark,
  onToggleTheme,
  unreadNotifications,
  onOpenCommandPalette,
  onLogout,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const breadcrumbs = getBreadcrumbs(location.pathname);

  const activeFacility = facilities.find((f) => f.id === activeFacilityId) || facilities[0];
  const currentNavItem = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === activeView);

  const renderNav = () => (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Workspace navigation">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {group.title}
          </div>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive =
                activeView === item.id && !(item.id === 'scanner' && location.pathname.startsWith('/scanner/history'));
              const label = t(language, item.labelKey) === item.labelKey ? item.fallbackLabel : t(language, item.labelKey);
              return (
                <React.Fragment key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{label}</span>
                    </span>
                    {item.id === 'notifications' && unreadNotifications > 0 && (
                      <span
                        className={`font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded font-semibold ${
                          isActive ? 'bg-white/20 text-white' : 'bg-rose-600 text-white'
                        }`}
                      >
                        {unreadNotifications}
                      </span>
                    )}
                  </button>
                  {item.id === 'scanner' && (
                    <Link
                      to="/scanner/history"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`w-full flex items-center gap-2.5 pl-8 pr-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        location.pathname.startsWith('/scanner/history') || location.pathname.startsWith('/scanner/result')
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                      }`}
                    >
                      <History className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Inspection History</span>
                    </Link>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 dark:bg-[#0B1120] dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] shrink-0 h-screen sticky top-0">
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-2.5 text-left cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-emerald-600 text-white flex items-center justify-center shrink-0 font-display font-bold text-sm">
              S
            </div>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                SortSight AI
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[165px]">
                {user.organizationName}
              </div>
            </div>
          </button>
        </div>

        {renderNav()}

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-xs bg-slate-50/60 dark:bg-slate-900/60">
          <div className="flex items-center justify-between gap-2 px-1.5 py-1">
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-80 cursor-pointer"
            >
              <div className="w-7 h-7 rounded-md bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border border-emerald-600/30 flex items-center justify-center font-mono text-[11px] font-bold shrink-0">
                {user.avatarInitials}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 dark:text-white truncate">{user.fullName}</div>
                <div className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 uppercase">{user.roleName}</div>
              </div>
            </button>
            <button
              type="button"
              onClick={onLogout}
              title="Sign Out"
              aria-label="Sign Out"
              className="p-1.5 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative w-72 max-w-full bg-white dark:bg-[#0F172A] border-r border-slate-200 dark:border-slate-800 flex flex-col h-full z-10">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="font-display font-bold text-base">SortSight AI</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {renderNav()}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-sm px-4 sm:px-6 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open menu"
                className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {breadcrumbs.map((crumb, idx) => (
                    <React.Fragment key={`${crumb.label}_${idx}`}>
                      {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />}
                      {crumb.path ? (
                        <Link to={crumb.path} className="hover:text-emerald-600 dark:hover:text-emerald-400 truncate">
                          {crumb.label}
                        </Link>
                      ) : (
                        <span className="text-slate-700 dark:text-slate-200 font-medium truncate">{crumb.label}</span>
                      )}
                    </React.Fragment>
                  ))}
                </nav>
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate font-display">
                  {currentNavItem?.fallbackLabel || 'Workspace'}
                </div>
              </div>
            </div>

            {/* Global Command Center & Search Trigger */}
            <button
              type="button"
              onClick={onOpenCommandPalette}
              className="hidden md:flex items-center justify-between gap-4 w-72 lg:w-80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400 hover:border-emerald-500 dark:hover:border-emerald-600 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 truncate">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">Search scans, materials, facilities...</span>
              </span>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 shrink-0">
                ⌘K
              </kbd>
            </button>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onOpenCommandPalette}
                aria-label="Open global search and command center"
                className="md:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Search className="h-4 w-4" />
              </button>

              {facilities.length > 0 && (
                <select
                  value={activeFacility?.id || ''}
                  onChange={(e) => onSelectFacility(e.target.value)}
                  aria-label="Select active facility"
                  className="hidden xl:block max-w-[210px] truncate rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
                >
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.country_code})
                    </option>
                  ))}
                </select>
              )}

              <select
                value={language}
                onChange={(e) => onChangeLanguage(e.target.value as LanguageCode)}
                aria-label="Select interface language"
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200"
              >
                <option value="en">EN</option>
                <option value="sv">SV</option>
                <option value="de">DE</option>
                <option value="es">ES</option>
                <option value="ja">JA</option>
              </select>

              <button
                type="button"
                onClick={() => onNavigate('notifications')}
                aria-label="Open Alert Center"
                className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Bell className="h-4 w-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded bg-rose-600 text-white text-[10px] font-mono font-bold flex items-center justify-center tabular-nums">
                    {unreadNotifications}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={onToggleTheme}
                aria-label="Toggle color theme"
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={() => onNavigate('scanner')}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
              >
                <Scan className="w-3.5 h-3.5" />
                <span>Scan Waste</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
