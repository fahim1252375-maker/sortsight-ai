import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Camera,
  CheckSquare,
  Clock,
  Cpu,
  FileText,
  FlaskConical,
  Globe,
  Layers,
  LayoutDashboard,
  Moon,
  Package,
  Search,
  ShieldAlert,
  Sliders,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { GlobalSearchResult, ViewId } from '../types/sortsight.ts';
import { StatusTag } from './ui/DesignSystem.tsx';

interface QuickCommand {
  id: string;
  label: string;
  group: 'Navigate' | 'Quick Action';
  keywords: string;
  icon: React.ReactNode;
  action: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onNavigatePath,
  darkMode,
  onToggleTheme,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: ViewId) => void;
  onNavigatePath?: (path: string) => void;
  darkMode: boolean;
  onToggleTheme: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<Array<{ id: string; query_text: string; result_count: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openResult = (r: GlobalSearchResult) => {
    if (r.targetPath && onNavigatePath) {
      onNavigatePath(r.targetPath);
    } else {
      onNavigate(r.targetView);
    }
    onClose();
  };

  const quickCommands: QuickCommand[] = useMemo(
    () => [
      { id: 'cmd_dash', label: 'Go to Operations Command Dashboard', group: 'Navigate', keywords: 'dashboard kpi overview home', icon: <LayoutDashboard className="w-4 h-4" />, action: () => { onNavigate('dashboard'); onClose(); } },
      { id: 'cmd_scan', label: 'Open Smart Waste Scanner', group: 'Quick Action', keywords: 'scanner upload image detect vision ai', icon: <Camera className="w-4 h-4" />, action: () => { onNavigate('scanner'); onClose(); } },
      { id: 'cmd_scan_hist', label: 'Open Scanner History & Comparison', group: 'Navigate', keywords: 'scanner history compare archive', icon: <FileText className="w-4 h-4" />, action: () => { if (onNavigatePath) onNavigatePath('/scanner/history'); else onNavigate('scanner'); onClose(); } },
      { id: 'cmd_realtime', label: 'Open Real-Time Detection Studio', group: 'Navigate', keywords: 'camera live stream realtime tracking', icon: <Activity className="w-4 h-4" />, action: () => { onNavigate('realtime'); onClose(); } },
      { id: 'cmd_batch', label: 'Open Batch Image Analysis', group: 'Navigate', keywords: 'batch bulk multi upload export', icon: <Layers className="w-4 h-4" />, action: () => { onNavigate('batch'); onClose(); } },
      { id: 'cmd_hazards', label: 'Inspect Hazard & Safety Alerts', group: 'Quick Action', keywords: 'hazard lithium battery fire safety chemical', icon: <ShieldAlert className="w-4 h-4" />, action: () => { onNavigate('hazards'); onClose(); } },
      { id: 'cmd_reviews', label: 'Open Human Review QA Queue', group: 'Navigate', keywords: 'human review qa queue approve label', icon: <CheckSquare className="w-4 h-4" />, action: () => { onNavigate('reviews'); onClose(); } },
      { id: 'cmd_sorting', label: 'Configure Smart Sorting 8-Chute Rules', group: 'Navigate', keywords: 'sorting chute rule mapping threshold', icon: <Sliders className="w-4 h-4" />, action: () => { onNavigate('sorting'); onClose(); } },
      { id: 'cmd_conveyor', label: 'Monitor Conveyor & PLC Simulator', group: 'Navigate', keywords: 'conveyor belt plc speed emergency stop', icon: <Cpu className="w-4 h-4" />, action: () => { onNavigate('conveyor'); onClose(); } },
      { id: 'cmd_twin', label: 'Open 3D Digital Twin & Simulator', group: 'Navigate', keywords: 'digital twin 3d simulator scenario handover shift', icon: <FlaskConical className="w-4 h-4" />, action: () => { onNavigate('digital_twin'); onClose(); } },
      { id: 'cmd_ops', label: 'Log Shift Handover & Incident Report', group: 'Quick Action', keywords: 'shift handover incident log operations tasks', icon: <FileText className="w-4 h-4" />, action: () => { onNavigate('operations'); onClose(); } },
      { id: 'cmd_rules', label: 'Explore Global & Facility Recycling Rules', group: 'Navigate', keywords: 'global rules policy eu compliance acceptance', icon: <Globe className="w-4 h-4" />, action: () => { onNavigate('global_rules'); onClose(); } },
      { id: 'cmd_assistant', label: 'Ask AI Operator Assistant', group: 'Navigate', keywords: 'assistant chatbot question summary report', icon: <Bot className="w-4 h-4" />, action: () => { onNavigate('assistant'); onClose(); } },
      { id: 'cmd_theme', label: darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode', group: 'Quick Action', keywords: 'theme dark light mode appearance', icon: darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />, action: () => { onToggleTheme(); onClose(); } },
    ],
    [darkMode, onClose, onNavigate, onNavigatePath, onToggleTheme]
  );

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quickCommands.slice(0, 7);
    return quickCommands.filter((c) => c.label.toLowerCase().includes(q) || c.keywords.includes(q));
  }, [query, quickCommands]);

  useEffect(() => {
    if (open) {
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiRequest<{
          results: GlobalSearchResult[];
          recentSearches: Array<{ id: string; query_text: string; result_count: number }>;
        }>(`/search?q=${encodeURIComponent(query.trim())}&category=${encodeURIComponent(category)}`);
        if (!active) return;
        setResults(res.results || []);
        setRecentSearches(res.recentSearches || []);
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, query, category]);

  const combinedItems = useMemo(() => {
    const items: Array<{ id: string; run: () => void }> = [];
    for (const r of results) {
      items.push({
        id: `res_${r.entityType}_${r.id}`,
        run: () => openResult(r),
      });
    }
    for (const c of filteredCommands) {
      items.push({ id: c.id, run: c.action });
    }
    return items;
  }, [results, filteredCommands, onNavigate, onNavigatePath, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (combinedItems.length ? (prev + 1) % combinedItems.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (combinedItems.length ? (prev - 1 + combinedItems.length) % combinedItems.length : 0));
      } else if (e.key === 'Enter' && combinedItems[selectedIndex]) {
        e.preventDefault();
        combinedItems[selectedIndex].run();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, combinedItems, selectedIndex, onClose]);

  if (!open) return null;

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'facility', label: 'Facilities' },
    { id: 'material', label: 'Materials' },
    { id: 'detection', label: 'Scans' },
    { id: 'hazard', label: 'Hazards' },
    { id: 'review', label: 'Reviews' },
    { id: 'batch', label: 'Batches' },
    { id: 'policy', label: 'Policies' },
  ];

  const entityIcon = (type: GlobalSearchResult['entityType']) => {
    switch (type) {
      case 'hazard':
        return <AlertTriangle className="w-4 h-4 text-rose-500" />;
      case 'material':
        return <Package className="w-4 h-4 text-emerald-500" />;
      case 'facility':
        return <Globe className="w-4 h-4 text-teal-500" />;
      case 'detection':
        return <Camera className="w-4 h-4 text-emerald-500" />;
      case 'review':
        return <CheckSquare className="w-4 h-4 text-amber-500" />;
      default:
        return <Sparkles className="w-4 h-4 text-slate-400" />;
    }
  };

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center pt-[10vh] px-4 bg-slate-950/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Global Command Center and Search"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search facilities, materials, scans, hazards, batches, policies, or jump to module..."
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono rounded border border-slate-200 dark:border-slate-700 text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Entity Filter Bar */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 dark:border-slate-800/80 overflow-x-auto bg-slate-50/70 dark:bg-slate-900/50">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                category === cat.id
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="max-h-[58vh] overflow-y-auto p-3 space-y-4">
          {/* Recent Searches when query is empty */}
          {!query && recentSearches.length > 0 && (
            <div>
              <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Recent Searches
              </div>
              <div className="flex flex-wrap gap-1.5 px-2">
                {recentSearches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setQuery(item.query_text)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-700 dark:text-slate-300 hover:border-emerald-500 cursor-pointer"
                  >
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>{item.query_text}</span>
                    <span className="text-[10px] font-mono text-slate-400 tabular-nums">({item.result_count})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Global Search Results */}
          {query && (
            <div>
              <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Organization Records {loading ? '· Searching...' : `(${results.length})`}</span>
              </div>
              {results.length === 0 && !loading ? (
                <div className="px-3 py-4 text-xs text-slate-500 dark:text-slate-400 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                  No facility, material, scan, hazard, batch, or policy matched "{query}".
                </div>
              ) : (
                <div className="space-y-1">
                  {results.map((r) => {
                    runningIndex += 1;
                    const isActive = runningIndex === selectedIndex;
                    return (
                      <button
                        key={`${r.entityType}_${r.id}`}
                        type="button"
                        onClick={() => openResult(r)}
                        className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 ring-1 ring-emerald-500/40'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {entityIcon(r.entityType)}
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{r.title}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{r.subtitle}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusTag tone={r.severity === 'critical' ? 'rose' : 'neutral'}>{r.badge}</StatusTag>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Quick Navigation & Commands */}
          <div>
            <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Commands & Module Navigation
            </div>
            <div className="space-y-1">
              {filteredCommands.map((cmd) => {
                runningIndex += 1;
                const isActive = runningIndex === selectedIndex;
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    onClick={cmd.action}
                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 ring-1 ring-emerald-500/40'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-200">
                      <span className="text-emerald-600 dark:text-emerald-400">{cmd.icon}</span>
                      <span className="text-xs font-medium">{cmd.label}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase">{cmd.group}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer keyboard legend */}
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between text-[11px] text-slate-400">
          <span>Use ↑↓ arrows to navigate · Enter to open</span>
          <span>Org-scoped search & command center</span>
        </div>
      </div>
    </div>
  );
}
