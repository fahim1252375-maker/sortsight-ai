import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  Download,
  FileCheck2,
  Gauge,
  Leaf,
  Network,
  Plus,
  RefreshCw,
  Scan,
  ShieldAlert,
  Sliders,
  Trash2,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertBanner,
  Button,
  EmptyState,
  KpiCard,
  LoadingSkeleton,
  Modal,
  Panel,
  SectionHeader,
  StatusTag,
} from '../components/ui/DesignSystem.tsx';
import { useToast } from '../components/ui/ToastProvider.tsx';
import { apiRequest } from '../lib/api.ts';
import {
  AnomalyInsight,
  Facility,
  SavedDashboardView,
  TimeRangePreset,
  UserSession,
  ViewId,
} from '../types/sortsight.ts';

interface OverviewPayload {
  dataProvenanceNotice: string;
  filterWindow: { timeRange: string; startDate: string; endDate: string; facilityId: string | null };
  detectionMetrics: {
    totalScans: number;
    avgReadiness: number | null;
    avgRecovery: number | null;
    avgLatencyMs: number | null;
    liveScanCount: number;
    hazardScanCount: number;
    reviewFlaggedScanCount: number;
  };
  composition: Array<{
    material_code: string;
    material_name: string;
    parent_group: string;
    item_count: number;
    avg_confidence_pct: number;
    avg_recovery_score: number;
  }>;
  contaminationBreakdown: Array<{
    contamination_type: string;
    severity: string;
    event_count: number;
    avg_purity_pct: number;
  }>;
  snapshots: Array<{
    id: string;
    facility_id: string;
    facility_name: string;
    snapshot_date: string;
    total_items_scanned: number;
    recovery_rate_pct: number;
    contamination_rate_pct: number;
    sorting_accuracy_pct: number;
    throughput_tons: number;
    is_demo_data: number;
  }>;
  volumeTotals: {
    intakeKg: number | null;
    recoveredKg: number | null;
    contaminatedKg: number | null;
    batchCount: number;
  };
  operationalCounters: {
    openHazardsCount: number;
    criticalHazardsCount: number;
    pendingReviewsCount: number;
    verifiedReviewsCount: number;
    verifiedAccuracyPct: number | null;
    activeConveyorSessions: number;
    totalConveyorSessions: number;
    totalConveyorItems: number;
    totalDivertedReject: number;
    openHandoversCount: number;
  };
  conveyorSessions: Array<{
    id: string;
    facility_name: string;
    line_name: string;
    belt_speed_mps: number;
    status: string;
    mode: string;
    items_processed: number;
    items_diverted_reject: number;
  }>;
  recentDetections: Array<{
    id: string;
    image_name: string;
    source_type: string;
    inference_provider: string;
    overall_readiness_score: number;
    overall_recovery_score: number;
    object_count: number;
    has_hazards: number;
    needs_human_review: number;
    is_demo_data: number;
    created_at: string;
    facility_name: string;
  }>;
  recentHazards: Array<{
    id: string;
    title: string;
    hazard_type: string;
    severity: string;
    status: string;
    facility_name: string;
    warning_message: string;
    created_at: string;
    is_demo_data: number;
  }>;
  recentAuditEvents: Array<{
    id: string;
    actor_email: string;
    action: string;
    resource_type: string;
    resource_id: string | null;
    created_at: string;
  }>;
  digitalTwinSummary: {
    config: {
      id: string;
      name: string;
      facility_name: string;
      stages: Array<{ id: string; name: string; capacityTph: number; currentLoadTph: number; recoveryEff: number }>;
    } | null;
    latestScenario: {
      id: string;
      name: string;
      created_at: string;
      results: { projectedRecoveryRatePct?: number; bottleneckStage?: string; projectedThroughputTph?: number };
    } | null;
  };
  environmentalSummary: {
    estimateCount: number;
    totalRecoveredKg: number;
    totalCo2AvoidedKg: number;
    totalEnergySavedKwh: number;
    totalLandfillDivertedM3: number;
  };
}

interface FacilityCompareRow {
  id: string;
  name: string;
  country_code: string;
  city: string;
  capacity_tons_per_day: number;
  avg_recovery_pct: number | null;
  avg_contamination_pct: number | null;
  avg_accuracy_pct: number | null;
  total_recovered_kg: number;
}

export function MainDashboardView({
  user,
  facilities,
  activeFacility,
  onSelectFacility,
  onNavigate,
}: {
  user: UserSession;
  facilities: Facility[];
  activeFacility?: Facility;
  onSelectFacility: (id: string) => void;
  onNavigate: (view: ViewId) => void;
}) {
  const { pushToast } = useToast();
  const [scopeFacilityId, setScopeFacilityId] = useState<string>('');
  const [timeRange, setTimeRange] = useState<TimeRangePreset>('30d');
  const [customStart, setCustomStart] = useState<string>('2026-11-01');
  const [customEnd, setCustomEnd] = useState<string>('2026-11-14');

  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [compareRows, setCompareRows] = useState<FacilityCompareRow[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyInsight[]>([]);
  const [savedViews, setSavedViews] = useState<SavedDashboardView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [saveViewModalOpen, setSaveViewModalOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newViewDesc, setNewViewDesc] = useState('');
  const [savingView, setSavingView] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (scopeFacilityId) params.set('facilityId', scopeFacilityId);
      params.set('timeRange', timeRange);
      if (timeRange === 'custom') {
        if (customStart) params.set('startDate', customStart);
        if (customEnd) params.set('endDate', customEnd);
      }

      const [ov, cmp, anom, viewsRes] = await Promise.all([
        apiRequest<OverviewPayload>(`/analytics/overview?${params.toString()}`),
        apiRequest<{ facilities: FacilityCompareRow[] }>('/analytics/facilities-compare'),
        apiRequest<{ anomalies: AnomalyInsight[] }>(
          `/analytics/anomalies${scopeFacilityId ? `?facilityId=${encodeURIComponent(scopeFacilityId)}` : ''}`
        ),
        apiRequest<{ views: SavedDashboardView[] }>('/analytics/dashboard-views'),
      ]);

      setOverview(ov);
      setCompareRows(cmp.facilities || []);
      setAnomalies(anom.anomalies || []);
      setSavedViews(viewsRes.views || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operational telemetry.');
    } finally {
      setLoading(false);
    }
  }, [scopeFacilityId, timeRange, customStart, customEnd]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleApplySavedView = (view: SavedDashboardView) => {
    const cfg = view.config || {};
    setScopeFacilityId(cfg.facilityId || '');
    if (cfg.facilityId) onSelectFacility(cfg.facilityId);
    setTimeRange((cfg.timeRange as TimeRangePreset) || '30d');
    if (cfg.startDate) setCustomStart(cfg.startDate);
    if (cfg.endDate) setCustomEnd(cfg.endDate);
    pushToast({ tone: 'info', title: `Applied view: ${view.name}` });
  };

  const handleSaveView = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newViewName.trim()) return;
    setSavingView(true);
    try {
      await apiRequest('/analytics/dashboard-views', {
        method: 'POST',
        body: JSON.stringify({
          name: newViewName.trim(),
          description: newViewDesc.trim(),
          config: {
            facilityId: scopeFacilityId,
            timeRange,
            startDate: timeRange === 'custom' ? customStart : undefined,
            endDate: timeRange === 'custom' ? customEnd : undefined,
          },
          isShared: true,
        }),
      });
      setNewViewName('');
      setNewViewDesc('');
      setSaveViewModalOpen(false);
      pushToast({ tone: 'success', title: 'Dashboard view saved' });
      fetchDashboardData();
    } catch (err) {
      pushToast({
        tone: 'critical',
        title: 'Could not save view',
        description: err instanceof Error ? err.message : 'Unexpected error',
      });
    } finally {
      setSavingView(false);
    }
  };

  const handleDeleteSavedView = async (id: string) => {
    try {
      await apiRequest(`/analytics/dashboard-views/${id}`, { method: 'DELETE' });
      setSavedViews((prev) => prev.filter((v) => v.id !== id));
      pushToast({ tone: 'info', title: 'Saved view removed' });
    } catch {
      pushToast({ tone: 'critical', title: 'Unable to delete view' });
    }
  };

  const latestSnap = overview?.snapshots?.[overview.snapshots.length - 1];
  const primaryConveyor = overview?.conveyorSessions?.[0];
  const avgContamRate =
    overview?.snapshots && overview.snapshots.length > 0
      ? Number(
          (
            overview.snapshots.reduce((s, r) => s + r.contamination_rate_pct, 0) /
            overview.snapshots.length
          ).toFixed(1)
        )
      : null;

  const avgRecoveryFromSnaps =
    overview?.snapshots && overview.snapshots.length > 0
      ? Number(
          (
            overview.snapshots.reduce((s, r) => s + r.recovery_rate_pct, 0) /
            overview.snapshots.length
          ).toFixed(1)
        )
      : null;

  return (
    <div className="space-y-6">
      {/* Command Header + Time & Facility Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
              Operations Command Center
            </h1>
            <StatusTag tone="emerald">{user.organizationName}</StatusTag>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Unified Material Recovery intelligence across vision scans, hazard safety, sorting lines, and environmental impact.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setSaveViewModalOpen(true)}>
            <Bookmark className="w-3.5 h-3.5" />
            Save View
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onNavigate('operations')}>
            <ClipboardCheck className="w-3.5 h-3.5" />
            Shift Handover ({overview?.operationalCounters.openHandoversCount ?? 0})
          </Button>
          <Button size="sm" variant="secondary" onClick={fetchDashboardData} loading={loading}>
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Link
            to="/scanner/history"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-emerald-500 whitespace-nowrap"
          >
            Scan Archive
          </Link>
          <Button size="sm" variant="secondary" onClick={() => onNavigate('digital_twin')}>
            <Network className="w-3.5 h-3.5" />
            3D Twin
          </Button>
          <Button size="sm" variant="primary" onClick={() => onNavigate('scanner')}>
            <Scan className="w-3.5 h-3.5" />
            Inspect Frame
          </Button>
        </div>
      </div>

      {/* Filter & Saved Views Bar */}
      <Panel padding="p-3.5" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1">Window</span>
            {(
              [
                { id: 'today', label: 'Today' },
                { id: '7d', label: 'Last 7 Days' },
                { id: '30d', label: 'Last 30 Days' },
                { id: '90d', label: 'Last 90 Days' },
                { id: 'custom', label: 'Custom Range' },
              ] as Array<{ id: TimeRangePreset; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTimeRange(opt.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  timeRange === opt.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}

            {timeRange === 'custom' && (
              <div className="flex items-center gap-1.5 ml-1">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-mono"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-mono"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Scope</span>
            <select
              value={scopeFacilityId}
              onChange={(e) => setScopeFacilityId(e.target.value)}
              aria-label="Filter dashboard by facility"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
            >
              <option value="">All Organization Facilities ({facilities.length})</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.country_code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Saved Dashboard Views Strip */}
        {savedViews.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <Bookmark className="w-3 h-3" />
              Saved Views:
            </span>
            {savedViews.map((v) => (
              <div
                key={v.id}
                className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => handleApplySavedView(v)}
                  title={v.description || v.name}
                  className="px-2.5 py-1 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-slate-700 dark:text-slate-200 font-medium cursor-pointer"
                >
                  {v.name}
                </button>
                {v.is_demo_data === 0 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteSavedView(v.id)}
                    aria-label={`Delete saved view ${v.name}`}
                    className="px-1.5 py-1 text-slate-400 hover:text-rose-600 border-l border-slate-200 dark:border-slate-700 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {error && (
        <AlertBanner
          tone="critical"
          title="Telemetry Load Error"
          message={error}
          action={
            <Button size="sm" variant="secondary" onClick={fetchDashboardData}>
              Retry
            </Button>
          }
        />
      )}

      {loading && !overview ? (
        <LoadingSkeleton rows={6} />
      ) : overview ? (
        <>
          {/* Data Provenance Notice */}
          <AlertBanner
            tone="info"
            message={`${overview.dataProvenanceNotice} Active plant focus: ${
              scopeFacilityId
                ? facilities.find((f) => f.id === scopeFacilityId)?.name || scopeFacilityId
                : activeFacility?.name || 'All Facilities'
            }.`}
          />

          {/* 10 Operational KPI Cards (Clickable Navigation) */}
          <section aria-label="Operational Key Performance Indicators">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              <KpiCard
                label="Total Waste Inspected"
                value={overview.detectionMetrics.totalScans ?? 0}
                subtext={`${overview.detectionMetrics.liveScanCount ?? 0} live user scans`}
                icon={<Scan className="w-4 h-4" />}
                tone="emerald"
                provenance={Number(overview.detectionMetrics.liveScanCount || 0) > 0 ? 'LIVE' : 'DEMO'}
                onClick={() => onNavigate('scanner')}
              />
              <KpiCard
                label="Daily Processing Volume"
                value={`${latestSnap ? latestSnap.throughput_tons.toFixed(1) : ((overview.volumeTotals.intakeKg || 0) / 1000).toFixed(1)} t`}
                subtext={`${overview.volumeTotals.batchCount || 0} tracked intake batches`}
                icon={<Activity className="w-4 h-4" />}
                tone="teal"
                provenance={latestSnap?.is_demo_data ? 'DEMO' : 'LIVE'}
                onClick={() => onNavigate('batches')}
              />
              <KpiCard
                label="Material Recovery Rate"
                value={`${avgRecoveryFromSnaps ?? overview.detectionMetrics.avgRecovery ?? 0}%`}
                subtext="Across active time window"
                icon={<CheckCircle2 className="w-4 h-4" />}
                tone="emerald"
                provenance={latestSnap?.is_demo_data ? 'DEMO' : 'LIVE'}
                onClick={() => onNavigate('analytics')}
              />
              <KpiCard
                label="Recycling Readiness Score"
                value={`${overview.detectionMetrics.avgReadiness ?? 0}/100`}
                subtext="Optical polymer & fiber grade"
                icon={<Gauge className="w-4 h-4" />}
                tone="teal"
                provenance={Number(overview.detectionMetrics.liveScanCount || 0) > 0 ? 'LIVE' : 'DEMO'}
                onClick={() => onNavigate('scanner')}
              />
              <KpiCard
                label="Contamination Rate"
                value={avgContamRate !== null ? `${avgContamRate}%` : 'N/A'}
                subtext={`${overview.contaminationBreakdown.length} residue categories`}
                icon={<AlertTriangle className="w-4 h-4" />}
                tone={avgContamRate && avgContamRate > 9 ? 'amber' : 'neutral'}
                provenance="DEMO"
                onClick={() => onNavigate('contamination')}
              />
              <KpiCard
                label="Hazardous Items Detected"
                value={overview.operationalCounters.openHazardsCount}
                subtext={`${overview.operationalCounters.criticalHazardsCount} critical open alerts`}
                icon={<ShieldAlert className="w-4 h-4" />}
                tone={overview.operationalCounters.openHazardsCount > 0 ? 'rose' : 'emerald'}
                provenance="LIVE"
                onClick={() => onNavigate('hazards')}
              />
              <KpiCard
                label="AI Detection Accuracy"
                value={
                  overview.operationalCounters.verifiedAccuracyPct !== null
                    ? `${overview.operationalCounters.verifiedAccuracyPct}%`
                    : 'N/A'
                }
                subtext={`${overview.operationalCounters.verifiedReviewsCount} human-verified labels`}
                icon={<FileCheck2 className="w-4 h-4" />}
                tone="teal"
                provenance="VERIFIED"
                onClick={() => onNavigate('reviews')}
              />
              <KpiCard
                label="Conveyor System Status"
                value={(primaryConveyor?.status || 'idle').toUpperCase()}
                subtext={primaryConveyor ? `${primaryConveyor.belt_speed_mps} m/s · ${primaryConveyor.mode}` : 'No line active'}
                icon={<Cpu className="w-4 h-4" />}
                tone={primaryConveyor?.status === 'running' ? 'emerald' : 'amber'}
                provenance="SIMULATED"
                onClick={() => onNavigate('conveyor')}
              />
              <KpiCard
                label="Active Sorting Sessions"
                value={`${overview.operationalCounters.activeConveyorSessions}/${overview.operationalCounters.totalConveyorSessions}`}
                subtext={`${overview.operationalCounters.totalConveyorItems.toLocaleString()} items routed`}
                icon={<Sliders className="w-4 h-4" />}
                tone="neutral"
                provenance="SIMULATED"
                onClick={() => onNavigate('sorting')}
              />
              <KpiCard
                label="Pending Human Reviews"
                value={overview.operationalCounters.pendingReviewsCount}
                subtext="Low confidence (<0.65) & OOD"
                icon={<AlertOctagon className="w-4 h-4" />}
                tone={overview.operationalCounters.pendingReviewsCount > 0 ? 'amber' : 'emerald'}
                provenance="LIVE"
                onClick={() => onNavigate('reviews')}
              />
            </div>
          </section>

          {/* Feature 6: Operational Anomaly Insights + Section 5: Critical Hazard Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <Panel className="lg:col-span-7">
              <SectionHeader
                title="Operational Anomaly Insights"
                subtitle="Deterministic threshold and rolling-baseline inspection across contamination, recovery yield, hazards, and QA queue."
                badge={<StatusTag tone="teal">RULE-BASED ENGINE</StatusTag>}
                action={
                  <Button size="sm" variant="ghost" onClick={() => onNavigate('analytics')}>
                    Full Analytics
                  </Button>
                }
              />
              {anomalies.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                  title="No baseline deviations detected"
                  description="All facility recovery yields, contamination levels, and review queues are operating within configured thresholds."
                />
              ) : (
                <div className="space-y-2.5">
                  {anomalies.slice(0, 4).map((anom) => (
                    <div
                      key={anom.id}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 bg-slate-50/70 dark:bg-slate-900/60"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <StatusTag
                            tone={anom.severity === 'critical' ? 'rose' : anom.severity === 'warning' ? 'amber' : 'teal'}
                          >
                            {anom.severity.toUpperCase()}
                          </StatusTag>
                          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {anom.title}
                          </span>
                        </div>
                        <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                          {anom.observedValue} <span className="text-slate-400">vs {anom.baselineValue}</span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">{anom.explanation}</p>
                      <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                        Recommended action: {anom.recommendedAction}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel className="lg:col-span-5">
              <SectionHeader
                title="Critical Hazard Alerts"
                subtitle="Visual AI flags batteries, sharps & chemical vessels — NOT chemical verification."
                badge={
                  <StatusTag tone={overview.operationalCounters.openHazardsCount > 0 ? 'rose' : 'emerald'}>
                    {overview.operationalCounters.openHazardsCount} OPEN
                  </StatusTag>
                }
                action={
                  <Button size="sm" variant="secondary" onClick={() => onNavigate('hazards')}>
                    Safety Console
                  </Button>
                }
              />
              {overview.recentHazards.length === 0 ? (
                <EmptyState
                  title="No hazardous items flagged"
                  description="No lithium batteries, pressurized vessels, or chemical hazards in selected scope."
                />
              ) : (
                <div className="space-y-2.5">
                  {overview.recentHazards.map((haz) => (
                    <Link
                      key={haz.id}
                      to={`/hazards/${haz.id}`}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 hover:border-rose-400 p-3 flex flex-col gap-1.5 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">{haz.title}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {haz.is_demo_data === 1 && <StatusTag tone="neutral">DEMO</StatusTag>}
                          <StatusTag tone={haz.status === 'open' ? 'rose' : 'emerald'}>
                            {haz.status.toUpperCase()}
                          </StatusTag>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {haz.facility_name} · {haz.hazard_type.replace('_', ' ')} · Severity: {haz.severity}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{haz.warning_message}</p>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {/* Sections 1, 2 & 3: Recovery Performance Trends + Material Composition Analytics + Waste Processing Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <Panel className="lg:col-span-7">
              <SectionHeader
                title="Recovery Performance & Contamination Trends"
                subtitle="Daily MRF recovery yield vs incoming contamination percentage across selected date filter."
                badge={<StatusTag tone="neutral">DEMO DATA SNAPSHOTS</StatusTag>}
                action={
                  <a
                    href="/api/v1/analytics/export-csv"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV
                  </a>
                }
              />
              {overview.snapshots.length === 0 ? (
                <EmptyState
                  title="No trend snapshots in date range"
                  description="Widen the date range or select 30 Days to inspect historical facility metrics."
                />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={overview.snapshots} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="recovGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#059669" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="contamGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#d97706" stopOpacity={0.24} />
                          <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                      <XAxis dataKey="snapshot_date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="recovery_rate_pct"
                        name="Recovery Rate (%)"
                        stroke="#059669"
                        strokeWidth={2}
                        fill="url(#recovGrad)"
                      />
                      <Area
                        type="monotone"
                        dataKey="contamination_rate_pct"
                        name="Contamination (%)"
                        stroke="#d97706"
                        strokeWidth={2}
                        fill="url(#contamGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel className="lg:col-span-5">
              <SectionHeader
                title="Material Composition Analytics"
                subtitle="Detected object distribution and average recovery score by resin/material code."
                action={
                  <Button size="sm" variant="ghost" onClick={() => onNavigate('materials')}>
                    Taxonomy
                  </Button>
                }
              />
              {overview.composition.length === 0 ? (
                <EmptyState
                  title="No classified objects yet"
                  description="Run a scan in Smart Waste Scanner to populate material composition telemetry."
                />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overview.composition.slice(0, 7)} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                      <XAxis dataKey="material_code" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="item_count" name="Objects Detected" fill="#0F766E" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
          </div>

          {/* Sections 1 (Processing Overview), 4 (Contamination Monitoring), 6 (Conveyor Performance) & 8 (Human Review Summary) */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Panel>
              <SectionHeader title="Waste Processing Overview" subtitle="Cumulative intake vs recovered mass" />
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Total Batch Intake</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                    {Number(overview.volumeTotals.intakeKg || 0).toLocaleString()} kg
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Clean Recovered Mass</span>
                  <span className="font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {Number(overview.volumeTotals.recoveredKg || 0).toLocaleString()} kg
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Contaminated Reject</span>
                  <span className="font-mono font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                    {Number(overview.volumeTotals.contaminatedKg || 0).toLocaleString()} kg
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Button size="sm" variant="secondary" className="w-full" onClick={() => onNavigate('batches')}>
                    Manage Collection Batches
                  </Button>
                </div>
              </div>
            </Panel>

            <Panel>
              <SectionHeader title="Contamination Monitoring" subtitle="Active surface & cross-material flags" />
              <div className="space-y-2.5">
                {overview.contaminationBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-500">No contamination events recorded.</p>
                ) : (
                  overview.contaminationBreakdown.slice(0, 3).map((c, idx) => (
                    <div
                      key={`${c.contamination_type}_${idx}`}
                      className="flex items-center justify-between gap-2 text-xs p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{c.contamination_type}</div>
                        <div className="text-[11px] text-slate-500 tabular-nums">Avg purity {c.avg_purity_pct}%</div>
                      </div>
                      <StatusTag tone={c.severity === 'high' || c.severity === 'critical' ? 'rose' : 'amber'}>
                        {c.event_count}×
                      </StatusTag>
                    </div>
                  ))
                )}
                <Button size="sm" variant="secondary" className="w-full mt-1" onClick={() => onNavigate('contamination')}>
                  Open Contamination Studio
                </Button>
              </div>
            </Panel>

            <Panel>
              <SectionHeader
                title="Conveyor Performance"
                subtitle="PLC simulator & optical line status"
                badge={<StatusTag tone="amber">SIMULATOR</StatusTag>}
              />
              {overview.conveyorSessions.length === 0 ? (
                <p className="text-xs text-slate-500">No conveyor sessions initialized.</p>
              ) : (
                <div className="space-y-2.5 text-xs">
                  {overview.conveyorSessions.slice(0, 2).map((s) => (
                    <Link
                      key={s.id}
                      to={`/conveyor/session/${s.id}`}
                      className="block p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500 space-y-1 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white truncate">{s.line_name}</span>
                        <StatusTag tone={s.status === 'running' ? 'emerald' : s.status === 'emergency_stopped' ? 'rose' : 'amber'}>
                          {s.status.toUpperCase()}
                        </StatusTag>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {s.belt_speed_mps} m/s · {s.items_processed} routed · {s.items_diverted_reject} rejected
                      </div>
                    </Link>
                  ))}
                  <Button size="sm" variant="secondary" className="w-full" onClick={() => onNavigate('conveyor')}>
                    Control Conveyor Line
                  </Button>
                </div>
              )}
            </Panel>

            <Panel>
              <SectionHeader title="Human Review Queue" subtitle="HITL verification & label calibration" />
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Pending Escalations</span>
                  <span className="font-mono font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {overview.operationalCounters.pendingReviewsCount}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Verified QA Labels</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                    {overview.operationalCounters.verifiedReviewsCount}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Verified Accuracy</span>
                  <span className="font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {overview.operationalCounters.verifiedAccuracyPct !== null
                      ? `${overview.operationalCounters.verifiedAccuracyPct}%`
                      : 'Awaiting labels'}
                  </span>
                </div>
                <Button size="sm" variant="secondary" className="w-full" onClick={() => onNavigate('reviews')}>
                  Triage Review Queue
                </Button>
              </div>
            </Panel>
          </div>

          {/* Section 7: Recent AI Detection Activity + Section 9: Facility Performance Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <Panel className="lg:col-span-7">
              <SectionHeader
                title="Recent AI Detection Activity"
                subtitle="Latest optical waste frame analyses across Smart Scanner, Real-Time Studio, and Batch jobs."
                action={
                  <Button size="sm" variant="ghost" onClick={() => onNavigate('scanner')}>
                    New Scan
                  </Button>
                }
              />
              {overview.recentDetections.length === 0 ? (
                <EmptyState
                  title="No detection records"
                  description="Upload or capture an image in Smart Waste Scanner to record live inspection frames."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-left">
                        <th className="py-2 pr-3 font-medium">Frame / Batch</th>
                        <th className="py-2 pr-3 font-medium">Provider</th>
                        <th className="py-2 pr-3 font-medium text-right">Readiness</th>
                        <th className="py-2 pr-3 font-medium text-right">Recovery</th>
                        <th className="py-2 font-medium text-right">Flags</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {overview.recentDetections.map((d) => (
                        <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 pr-3">
                            <Link
                              to={`/scanner/result/${d.id}`}
                              className="font-medium text-slate-900 dark:text-slate-100 hover:text-emerald-600 dark:hover:text-emerald-400 truncate max-w-[190px] block"
                            >
                              {d.image_name}
                            </Link>
                            <div className="text-[11px] text-slate-500 truncate">
                              {d.facility_name} · {d.object_count} obj
                            </div>
                          </td>
                          <td className="py-2.5 pr-3">
                            <StatusTag tone={d.inference_provider.includes('gemini') ? 'emerald' : 'neutral'}>
                              {d.inference_provider.includes('gemini') ? 'GEMINI' : 'EDGE'}
                            </StatusTag>
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{d.overall_readiness_score}</td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                            {d.overall_recovery_score}%
                          </td>
                          <td className="py-2.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              {d.is_demo_data === 1 && <StatusTag tone="neutral">DEMO</StatusTag>}
                              {d.has_hazards === 1 && <StatusTag tone="rose">HAZARD</StatusTag>}
                              {d.needs_human_review === 1 && <StatusTag tone="amber">QA</StatusTag>}
                              {d.has_hazards === 0 && d.needs_human_review === 0 && <StatusTag tone="emerald">CLEAR</StatusTag>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel className="lg:col-span-5">
              <SectionHeader
                title="Facility Performance Comparison"
                subtitle="Cross-plant recovery, contamination, and capacity comparison."
                action={
                  <Button size="sm" variant="ghost" onClick={() => onNavigate('directory')}>
                    Directory
                  </Button>
                }
              />
              <div className="space-y-2.5">
                {compareRows.map((fac) => (
                  <div
                    key={fac.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-white">{fac.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {fac.city}, {fac.country_code} · Capacity {fac.capacity_tons_per_day} t/d
                        </div>
                      </div>
                      <StatusTag tone="emerald">{fac.avg_recovery_pct ?? '—'}% Recov</StatusTag>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span>Contam: {fac.avg_contamination_pct ?? '—'}%</span>
                      <span>Acc: {fac.avg_accuracy_pct ?? '—'}%</span>
                      <span className="text-right">{(fac.total_recovered_kg / 1000).toFixed(1)} t rec</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* Sections 10 (Environmental Impact Summary), 11 (Digital Twin Status) & 12 (Recent Operational Events) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Panel>
              <SectionHeader
                title="Environmental Impact Summary"
                subtitle="Lifecycle displacement over recovered mass (not audited carbon credits)."
                badge={<StatusTag tone="amber">MODELED ESTIMATE</StatusTag>}
                action={
                  <Button size="sm" variant="ghost" onClick={() => onNavigate('environment')}>
                    Estimator
                  </Button>
                }
              />
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70">
                  <div className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Leaf className="w-3.5 h-3.5 text-emerald-600" />
                    CO2e Avoided
                  </div>
                  <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {Number(overview.environmentalSummary.totalCo2AvoidedKg || 0).toLocaleString()} kg
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70">
                  <div className="text-slate-500 dark:text-slate-400">Energy Saved</div>
                  <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {Number(overview.environmentalSummary.totalEnergySavedKwh || 0).toLocaleString()} kWh
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70">
                  <div className="text-slate-500 dark:text-slate-400">Landfill Diverted</div>
                  <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {Number(overview.environmentalSummary.totalLandfillDivertedM3 || 0).toFixed(1)} m³
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70">
                  <div className="text-slate-500 dark:text-slate-400">Recovered Mass</div>
                  <div className="mt-1 text-lg font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {Number(overview.environmentalSummary.totalRecoveredKg || 0).toLocaleString()} kg
                  </div>
                </div>
              </div>
            </Panel>

            <Panel>
              <SectionHeader
                title="Digital Twin Status"
                subtitle="7-Stage MRF throughput & bottleneck model."
                badge={<StatusTag tone="amber">SIMULATION</StatusTag>}
                action={
                  <Button size="sm" variant="ghost" onClick={() => onNavigate('simulator')}>
                    Simulate
                  </Button>
                }
              />
              {overview.digitalTwinSummary.config ? (
                <div className="space-y-3 text-xs">
                  <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Network className="w-3.5 h-3.5 text-teal-600" />
                    {overview.digitalTwinSummary.config.name}
                  </div>
                  <div className="space-y-1.5">
                    {overview.digitalTwinSummary.config.stages.slice(0, 4).map((stg) => {
                      const util = Math.min(100, Math.round((stg.currentLoadTph / stg.capacityTph) * 100));
                      return (
                        <Link key={stg.id} to={`/digital-twin/stages/${stg.id}`} className="block group">
                          <div className="flex justify-between text-[11px] mb-0.5">
                            <span className="truncate text-slate-600 dark:text-slate-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                              {stg.name}
                            </span>
                            <span className="font-mono tabular-nums text-slate-500">{util}% load</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${util > 85 ? 'bg-amber-500' : 'bg-emerald-600'}`}
                              style={{ width: `${util}%` }}
                            />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                  {overview.digitalTwinSummary.latestScenario && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                      Last run: <span className="font-medium text-slate-800 dark:text-slate-200">{overview.digitalTwinSummary.latestScenario.name}</span>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState title="No Twin Configured" description="Configure an MRF twin in Digital Twin studio." />
              )}
            </Panel>

            <Panel>
              <SectionHeader
                title="Recent Operational Events"
                subtitle="Immutable tenant audit trail & shift log."
                action={
                  <Button size="sm" variant="ghost" onClick={() => onNavigate('security')}>
                    Audit Log
                  </Button>
                }
              />
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {overview.recentAuditEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-start justify-between gap-2 text-xs py-1.5 border-b border-slate-100 dark:border-slate-800/80 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {ev.action}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{ev.actor_email}</div>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0 tabular-nums">
                      {ev.created_at.slice(11, 16) || ev.created_at.slice(0, 10)}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </>
      ) : null}

      {/* Save Dashboard View Modal */}
      <Modal
        open={saveViewModalOpen}
        onClose={() => setSaveViewModalOpen(false)}
        title="Save Dashboard View"
        subtitle="Persist current time window and facility filter as a reusable team preset."
      >
        <form onSubmit={handleSaveView} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">View Name</label>
            <input
              type="text"
              required
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              placeholder="e.g., Gothenburg 7-Day Contamination Watch"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
            <input
              type="text"
              value={newViewDesc}
              onChange={(e) => setNewViewDesc(e.target.value)}
              placeholder="Optional summary for operations & sustainability teams"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 p-3 text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <div>
              <strong>Window:</strong> {timeRange} {timeRange === 'custom' ? `(${customStart} to ${customEnd})` : ''}
            </div>
            <div>
              <strong>Facility Scope:</strong>{' '}
              {scopeFacilityId
                ? facilities.find((f) => f.id === scopeFacilityId)?.name || scopeFacilityId
                : 'All Organization Facilities'}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSaveViewModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={savingView}>
              <Plus className="w-3.5 h-3.5" />
              Save View Preset
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
