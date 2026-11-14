import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Cpu, Pause, Play, Radio, Save, ShieldAlert, Sliders, Zap } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LazyConveyorLive3D, Scene3DSuspense } from '../components/3d/Lazy3DScenes.tsx';
import {
  AlertBanner,
  Button,
  ConfirmDialog,
  EmptyState,
  KpiCard,
  Panel,
  SectionHeader,
  StatusTag,
} from '../components/ui/DesignSystem.tsx';
import { useToast } from '../components/ui/ToastProvider.tsx';
import { apiRequest } from '../lib/api.ts';
import { Facility } from '../types/sortsight.ts';

interface ChuteRule {
  id: string;
  label: string;
  materials: string[];
  airJetPort: number;
}

export const SmartSortingView: React.FC<{ activeFacility?: Facility; mode?: 'overview' | 'configuration' }> = ({ activeFacility, mode = 'overview' }) => {
  const isConfigurationPage = mode === 'configuration';
  const { pushToast } = useToast();
  const [config, setConfig] = useState<{
    id: string;
    name: string;
    min_confidence_auto_sort: number;
    max_contamination_pct: number;
    rules: { hazardAutoStop: boolean; lowConfidenceRoute: string; chutes: ChuteRule[] };
  } | null>(null);
  const [decisions, setDecisions] = useState<Array<Record<string, unknown>>>([]);
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [minConf, setMinConf] = useState(0.72);
  const [maxContam, setMaxContam] = useState(12);
  const [hazardAutoStop, setHazardAutoStop] = useState(true);
  const [chutes, setChutes] = useState<ChuteRule[]>([]);
  const [simMaterial, setSimMaterial] = useState('PET_01');
  const [simConf, setSimConf] = useState(0.88);
  const [simContam, setSimContam] = useState(4);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError('');
    const q = activeFacility ? `?facilityId=${encodeURIComponent(activeFacility.id)}` : '';
    const results = await Promise.allSettled([
      apiRequest<{ config: NonNullable<typeof config> }>(`/sorting/config${q}`),
      apiRequest<{ decisions: Array<Record<string, unknown>> }>(`/sorting/decisions${q}`),
      apiRequest<Record<string, unknown>>('/sorting/metrics'),
    ]);

    const [configResult, decisionsResult, metricsResult] = results;
    const failures: string[] = [];
    if (configResult.status === 'fulfilled') {
      const nextConfig = configResult.value.config;
      if (nextConfig) {
        setConfig(nextConfig);
        setMinConf(nextConfig.min_confidence_auto_sort);
        setMaxContam(nextConfig.max_contamination_pct);
        setHazardAutoStop(Boolean(nextConfig.rules?.hazardAutoStop ?? true));
        setChutes(nextConfig.rules?.chutes || []);
      }
    } else {
      failures.push('sorting configuration');
    }
    if (decisionsResult.status === 'fulfilled') setDecisions(decisionsResult.value.decisions);
    else failures.push('sorting decisions');
    if (metricsResult.status === 'fulfilled') setMetrics(metricsResult.value);
    else failures.push('sorting metrics');

    if (failures.length) {
      setLoadError(`Could not load ${failures.join(', ')}. Check your connection and try again.`);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [activeFacility?.id]);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await apiRequest('/sorting/config', {
        method: 'PUT',
        body: JSON.stringify({
          id: config.id,
          minConfidenceAutoSort: minConf,
          maxContaminationPct: maxContam,
          rules: {
            ...config.rules,
            hazardAutoStop,
            chutes,
          },
        }),
      });
      pushToast({ tone: 'success', title: 'Sorting rules & 8-chute configuration saved' });
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const updateChuteMaterials = (chuteId: string, rawMaterials: string) => {
    const list = rawMaterials
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    setChutes((prev) => prev.map((c) => (c.id === chuteId ? { ...c, materials: list } : c)));
  };

  // Live Rule Simulation Preview
  const simulationPreview = useMemo(() => {
    if (simMaterial === 'BATT_LI' || simMaterial === 'HAZ_CHEM') {
      return {
        chute: 'chute_hazard_firebox',
        reason: hazardAutoStop ? 'Hazard Auto-Stop triggered: quarantine chute + belt halt.' : 'Hazard quarantined to Chute 8.',
        tone: 'rose' as const,
      };
    }
    if (simConf < minConf) {
      return {
        chute: config?.rules?.lowConfidenceRoute || 'chute_manual_qc',
        reason: `Confidence ${(simConf * 100).toFixed(0)}% < ${(minConf * 100).toFixed(0)}% threshold -> routed to Manual QC.`,
        tone: 'amber' as const,
      };
    }
    if (simContam > maxContam) {
      return {
        chute: 'chute_reject_residue',
        reason: `Contamination ${simContam}% > ${maxContam}% limit -> diverted to Reject Residue.`,
        tone: 'amber' as const,
      };
    }
    const matched = chutes.find((c) => c.materials.includes(simMaterial));
    return {
      chute: matched?.id || 'chute_manual_qc',
      reason: matched
        ? `Matched ${matched.label} (Air-Jet Port #${matched.airJetPort}).`
        : 'No chute mapping for material code -> fallback to Manual QC.',
      tone: matched ? ('emerald' as const) : ('amber' as const),
    };
  }, [simMaterial, simConf, simContam, minConf, maxContam, hazardAutoStop, chutes, config?.rules?.lowConfidenceRoute]);

  return (
    <div className="space-y-6">
      {loadError && (
        <AlertBanner
          tone="warning"
          title="Some sorting data is unavailable"
          message={loadError}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Retry</Button>}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {isConfigurationPage ? 'Sorting Rule Configuration' : 'Smart Sorting Engine'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isConfigurationPage
              ? 'Manage eight-chute material routing, safety thresholds, and rule validation for the active facility.'
              : 'Monitor sorting decisions, inspect routing performance, and validate the active facility configuration.'}
          </p>
        </div>
        <Link
          to={isConfigurationPage ? '/sorting' : '/sorting/configuration'}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-emerald-300"
        >
          {isConfigurationPage ? 'Back to Sorting Overview' : 'Open Chute Configuration'}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {!isConfigurationPage && metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard label="Total Sorting Decisions" value={String(metrics.totalDecisions)} tone="teal" provenance="SIMULATED" />
          <KpiCard label="Rejection Stream Rate" value={`${String(metrics.rejectionRatePct)}%`} tone="amber" provenance="SIMULATED" />
          <KpiCard
            label={`Measured QA Accuracy (${String(metrics.reviewedSampleCount)} reviews)`}
            value={metrics.measuredAccuracyPct != null ? `${metrics.measuredAccuracyPct}%` : 'Awaiting Labels'}
            tone="emerald"
            provenance="VERIFIED"
          />
        </div>
      )}

      {loading ? (
        <Panel className="py-10 text-center text-sm text-slate-500">Loading sorting configuration…</Panel>
      ) : config ? (
        <Panel className="space-y-5">
          <SectionHeader
            title={config.name}
            subtitle="Edit confidence & contamination gates or customize material-to-chute port assignments."
            action={
              <Button size="sm" variant="primary" loading={saving} onClick={saveConfig}>
                <Save className="w-3.5 h-3.5" />
                Save 8-Chute Config
              </Button>
            }
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            <div>
              <label className="block font-medium mb-1">
                Min Auto-Sort Confidence: <span className="font-mono font-bold">{(minConf * 100).toFixed(0)}%</span>
              </label>
              <input
                type="range"
                min={0.5}
                max={0.95}
                step={0.01}
                value={minConf}
                onChange={(e) => setMinConf(Number(e.target.value))}
                className="w-full accent-emerald-600"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">
                Max Accepted Contamination: <span className="font-mono font-bold">{maxContam}%</span>
              </label>
              <input
                type="range"
                min={2}
                max={30}
                step={0.5}
                value={maxContam}
                onChange={(e) => setMaxContam(Number(e.target.value))}
                className="w-full accent-emerald-600"
              />
            </div>
            <div className="flex items-center">
              <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={hazardAutoStop}
                  onChange={(e) => setHazardAutoStop(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600"
                />
                Auto-Stop Conveyor on Critical Hazard
              </label>
            </div>
          </div>

          {/* Interactive 8-Chute Editor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {chutes.map((ch) => (
              <div
                key={ch.id}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 dark:text-white truncate">{ch.label}</span>
                  <StatusTag tone="neutral">Port #{ch.airJetPort}</StatusTag>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">MAPPED CODES (CSV)</label>
                  <input
                    type="text"
                    value={ch.materials.join(', ')}
                    onChange={(e) => updateChuteMaterials(ch.id, e.target.value)}
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 font-mono text-[11px]"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Live Routing Simulation Preview */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
              <Sliders className="w-4 h-4 text-emerald-600" />
              Rule Validation &amp; Routing Simulation Preview
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Test Material</label>
                <select
                  value={simMaterial}
                  onChange={(e) => setSimMaterial(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5"
                >
                  {['PET_01', 'HDPE_02', 'PP_05', 'ALUM_CAN', 'OCC_CARD', 'COMP_MLP', 'BATT_LI', 'UNKNOWN_OOD'].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">
                  Simulated Confidence ({(simConf * 100).toFixed(0)}%)
                </label>
                <input
                  type="range"
                  min={0.4}
                  max={0.99}
                  step={0.01}
                  value={simConf}
                  onChange={(e) => setSimConf(Number(e.target.value))}
                  className="w-full accent-emerald-600 mt-1"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">
                  Simulated Contamination ({simContam}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={35}
                  value={simContam}
                  onChange={(e) => setSimContam(Number(e.target.value))}
                  className="w-full accent-emerald-600 mt-1"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
              <span>{simulationPreview.reason}</span>
              <StatusTag tone={simulationPreview.tone}>ROUTE → {simulationPreview.chute}</StatusTag>
            </div>
          </div>
        </Panel>
      ) : (
        <EmptyState
          title="Sorting configuration not available"
          description="The active facility has not returned a sorting configuration. Retry after confirming that the API is running and a facility is selected."
        />
      )}

      {!isConfigurationPage && <Panel padding="p-0" className="overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-display text-sm font-semibold">
          Recent Sorting Decisions Log
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="py-2.5 px-4">Material</th>
                <th className="py-2.5 px-4 text-right">Conf</th>
                <th className="py-2.5 px-4">Assigned Chute</th>
                <th className="py-2.5 px-4">Stream</th>
                <th className="py-2.5 px-4">Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {decisions.slice(0, 15).map((d) => (
                <tr key={String(d.id)}>
                  <td className="py-2.5 px-4 font-mono font-semibold">{String(d.material_code)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{Math.round(Number(d.confidence) * 100)}%</td>
                  <td className="py-2.5 px-4 font-mono">{String(d.assigned_chute)}</td>
                  <td className="py-2.5 px-4">
                    <StatusTag tone={d.is_rejection_stream ? 'amber' : 'emerald'}>
                      {d.is_rejection_stream ? 'Reject / QC' : 'Recovery'}
                    </StatusTag>
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-500">{String(d.executed_status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>}
    </div>
  );
};

export const ConveyorMonitoringView: React.FC<{ activeFacility?: Facility }> = ({ activeFacility }) => {
  const { pushToast } = useToast();
  const [sessions, setSessions] = useState<Array<Record<string, unknown>>>([]);
  const [devices, setDevices] = useState<Array<Record<string, unknown>>>([]);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [decisions, setDecisions] = useState<Array<Record<string, unknown>>>([]);
  const [notice, setNotice] = useState('');
  const [lastTick, setLastTick] = useState<Record<string, unknown> | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [estopConfirmOpen, setEstopConfirmOpen] = useState(false);

  const load = () => {
    apiRequest<{ simulatorNotice: string; sessions: Array<Record<string, unknown>> }>('/conveyor/sessions')
      .then((r) => {
        setNotice(r.simulatorNotice);
        setSessions(r.sessions);
      })
      .catch(() => {});
    apiRequest<{ devices: Array<Record<string, unknown>>; events: Array<Record<string, unknown>> }>('/integrations/devices')
      .then((r) => {
        setDevices(r.devices);
        setEvents(r.events);
      })
      .catch(() => {});
    apiRequest<{ decisions: Array<Record<string, unknown>> }>('/sorting/decisions')
      .then((r) => setDecisions(r.decisions))
      .catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const primarySession = sessions[0];

  useEffect(() => {
    if (!autoRunning || !primarySession || primarySession.status !== 'running') return;
    const id = setInterval(() => {
      apiRequest<{ decision: Record<string, unknown>; session: Record<string, unknown> }>('/conveyor/tick', {
        method: 'POST',
        body: JSON.stringify({ sessionId: primarySession.id }),
      })
        .then((r) => {
          setLastTick(r.decision);
          load();
        })
        .catch(() => setAutoRunning(false));
    }, 1800);
    return () => clearInterval(id);
  }, [autoRunning, primarySession?.id, primarySession?.status]);

  const controlBelt = async (action: 'start' | 'pause' | 'emergency_stop') => {
    if (!primarySession) {
      if (!activeFacility) return;
      await apiRequest('/conveyor/session', { method: 'POST', body: JSON.stringify({ action: 'create', facilityId: activeFacility.id }) });
      load();
      return;
    }
    await apiRequest('/conveyor/session', {
      method: 'POST',
      body: JSON.stringify({ sessionId: primarySession.id, action }),
    });
    if (action !== 'start') setAutoRunning(false);
    setEstopConfirmOpen(false);
    pushToast({
      tone: action === 'emergency_stop' ? 'critical' : action === 'start' ? 'success' : 'warning',
      title: `Simulator Belt ${action.replace('_', ' ').toUpperCase()}`,
    });
    load();
  };

  const runSingleTick = async () => {
    if (!primarySession) return;
    const r = await apiRequest<{ decision: Record<string, unknown> }>('/conveyor/tick', {
      method: 'POST',
      body: JSON.stringify({ sessionId: primarySession.id }),
    });
    setLastTick(r.decision);
    load();
  };

  const testDevice = async (deviceId: string) => {
    await apiRequest('/integrations/test-device', { method: 'POST', body: JSON.stringify({ deviceId }) });
    pushToast({ tone: 'info', title: 'Simulator adapter ping acknowledged' });
    load();
  };

  const dispatchPlc = async (deviceId: string) => {
    await apiRequest('/integrations/plc-command', {
      method: 'POST',
      body: JSON.stringify({ deviceId, command: 'ACTUATE_EJECTOR_TEST', chuteId: 'chute_pet_clear' }),
    });
    pushToast({ tone: 'info', title: 'Simulated PLC coil command dispatched' });
    load();
  };

  const dispatchRobot = async (deviceId: string) => {
    await apiRequest('/integrations/robotic-pick', {
      method: 'POST',
      body: JSON.stringify({ deviceId, materialCode: 'PET_01', bboxNormalized: [180, 220, 410, 460], targetChute: 'chute_pet_clear' }),
    });
    pushToast({ tone: 'info', title: 'Simulated robotic arm pick coordinates sent' });
    load();
  };

  const chuteUtilization = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of decisions) {
      const ch = String(d.assigned_chute || 'unknown');
      counts.set(ch, (counts.get(ch) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([chute, count]) => ({ chute: chute.replace('chute_', ''), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [decisions]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Conveyor Belt Monitoring &amp; Industrial Integrations
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Visual optical-line telemetry, simulated PLC ejector actuation, and chute utilization tracking.
          </p>
        </div>
        <StatusTag tone="amber">SIMULATOR ENVIRONMENT</StatusTag>
      </div>

      <AlertBanner
        tone="warning"
        title="Hardware Simulation Boundary"
        message={notice || 'SIMULATOR ENVIRONMENT: No physical PLC, robotic arm, or GigE camera is connected.'}
      />

      {primarySession ? (
        <Panel className="space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <StatusTag
                  tone={
                    primarySession.status === 'running'
                      ? 'emerald'
                      : primarySession.status === 'emergency_stop'
                        ? 'rose'
                        : 'amber'
                  }
                >
                  {String(primarySession.status).toUpperCase()}
                </StatusTag>
                <span className="font-mono text-[11px] text-slate-500">
                  Speed: {String(primarySession.belt_speed_mps)} m/s
                </span>
              </div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{String(primarySession.line_name)}</span>
                <Link
                  to={`/conveyor/session/${encodeURIComponent(String(primarySession.id))}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Session Log <ArrowRight className="w-3 h-3" />
                </Link>
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary" onClick={() => controlBelt('start')}>
                <Play className="h-3.5 w-3.5" />
                Start Belt
              </Button>
              <Button size="sm" variant="secondary" onClick={() => controlBelt('pause')}>
                <Pause className="h-3.5 w-3.5" />
                Pause
              </Button>
              <Button size="sm" variant="danger" onClick={() => setEstopConfirmOpen(true)}>
                <ShieldAlert className="h-3.5 w-3.5" />
                E-Stop
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={primarySession.status !== 'running'}
                onClick={runSingleTick}
              >
                <Zap className="h-3.5 w-3.5" />
                Simulate Item
              </Button>
              <Button
                size="sm"
                variant={autoRunning ? 'warning' : 'secondary'}
                disabled={primarySession.status !== 'running'}
                onClick={() => setAutoRunning((v) => !v)}
              >
                <Radio className="h-3.5 w-3.5" />
                {autoRunning ? 'Stop Stream' : 'Auto-Simulate'}
              </Button>
            </div>
          </div>

          {/* Interactive 3D Optical Conveyor & Chute Simulation */}
          <Scene3DSuspense heightClass="h-[340px]" label="Loading 3D Conveyor Simulation...">
            <LazyConveyorLive3D
              beltStatus={
                primarySession.status === 'emergency_stop'
                  ? 'emergency_stop'
                  : primarySession.status === 'running'
                    ? 'running'
                    : 'paused'
              }
              beltSpeedMps={Number(primarySession.belt_speed_mps || 1.85)}
              heightClass="h-[340px]"
            />
          </Scene3DSuspense>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
              <div className="text-slate-500">Items Processed (Simulated)</div>
              <div className="font-mono text-xl font-bold tabular-nums mt-0.5">{String(primarySession.items_processed)}</div>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
              <div className="text-slate-500">Diverted to Reject / QC</div>
              <div className="font-mono text-xl font-bold tabular-nums text-amber-600 mt-0.5">
                {String(primarySession.items_diverted_reject)}
              </div>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
              <div className="text-slate-500">Latest Simulated Decision</div>
              <div className="font-mono text-xs mt-1 font-semibold">
                {lastTick ? `${String(lastTick.material_code)} → ${String(lastTick.assigned_chute)}` : 'Waiting for tick'}
              </div>
            </div>
          </div>
        </Panel>
      ) : (
        <EmptyState
          title="No Conveyor Session Initialized"
          description="Initialize a simulated conveyor line to run optical sorting ticks and PLC tests."
          action={
            <Button variant="primary" onClick={() => controlBelt('start')}>
              Initialize Simulated Conveyor Line
            </Button>
          }
        />
      )}

      {/* Chute Utilization Chart + Devices & Events */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Panel className="lg:col-span-5">
          <SectionHeader title="Chute Utilization" subtitle="Distribution of sorting decisions across physical chutes" />
          {chuteUtilization.length === 0 ? (
            <EmptyState title="No chute telemetry" description="Simulate items above to populate chute distribution." />
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chuteUtilization} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                  <XAxis dataKey="chute" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Sorted Items" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-7 space-y-3">
          <SectionHeader
            title="Industrial Equipment Adapters"
            subtitle="All PLC, robotic arm, and camera adapters run in documented SIMULATOR mode."
            action={<Cpu className="h-4 w-4 text-emerald-600" />}
          />
          {devices.map((dev) => (
            <div
              key={String(dev.id)}
              className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
            >
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">{String(dev.name)}</div>
                <div className="font-mono text-[11px] text-slate-500">
                  {String(dev.protocol)} · {String(dev.endpoint_uri)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => testDevice(String(dev.id))}>
                  Ping Adapter
                </Button>
                {dev.device_type === 'plc_controller' && (
                  <Button size="sm" variant="secondary" onClick={() => dispatchPlc(String(dev.id))}>
                    Sim PLC Cmd
                  </Button>
                )}
                {dev.device_type === 'robotic_arm' && (
                  <Button size="sm" variant="primary" onClick={() => dispatchRobot(String(dev.id))}>
                    Sim Pick API
                  </Button>
                )}
              </div>
            </div>
          ))}

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="text-xs font-semibold mb-2">Simulated Adapter Event Timeline</div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs">
              {events.map((ev) => (
                <div key={String(ev.id)} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 font-mono text-[11px]">
                  <div className="flex justify-between text-slate-500">
                    <span>{String(ev.event_type)}</span>
                    <span>{String(ev.status)}</span>
                  </div>
                  <div className="text-slate-800 dark:text-slate-200 mt-0.5 truncate">{String(ev.payload_json)}</div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <ConfirmDialog
        open={estopConfirmOpen}
        onCancel={() => setEstopConfirmOpen(false)}
        onConfirm={() => controlBelt('emergency_stop')}
        title="Confirm Simulated Emergency Stop"
        description="Triggering E-Stop will halt the simulated conveyor belt, cancel automated ticks, and write an emergency stop event to the immutable audit trail."
        confirmLabel="Execute Emergency Stop"
        tone="danger"
      />
    </div>
  );
};
