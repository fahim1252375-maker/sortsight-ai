import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Download,
  GitBranch,
  Network,
  Package,
  Play,
  Plus,
  Search,
  Truck,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { LazyDigitalTwin3D, Scene3DSuspense } from '../components/3d/Lazy3DScenes.tsx';
import { apiRequest } from '../lib/api.ts';
import { Facility, ShiftHandoverRecord } from '../types/sortsight.ts';
import {
  AlertBanner,
  Button,
  DataTable,
  EmptyState,
  KpiCard,
  LoadingSkeleton,
  Panel,
  SectionHeader,
  StatusTag,
  Tabs,
} from '../components/ui/DesignSystem.tsx';
import { useToast } from '../components/ui/ToastProvider.tsx';

export const DigitalTwinSimulatorView: React.FC<{
  mode: 'digital_twin' | 'simulator' | 'material_flow';
  activeFacility?: Facility;
}> = ({ mode, activeFacility }) => {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [configs, setConfigs] = useState<Array<{ id: string; name: string; facility_name: string; stages: Array<{ id: string; name: string; capacityTph: number; currentLoadTph: number; contaminationRisk: number; recoveryEff: number }> }>>([]);
  const [scenarios, setScenarios] = useState<Array<Record<string, unknown>>>([]);
  const [flowStreams, setFlowStreams] = useState<Array<{ stream: string; object_count: number; avg_recovery: number; avg_readiness: number }>>([]);
  const [simName, setSimName] = useState('High-Purity Optical Tuning Scenario');
  const [infeedRate, setInfeedRate] = useState(14.5);
  const [beltSpeed, setBeltSpeed] = useState(1.85);
  const [confThreshold, setConfThreshold] = useState(0.72);
  const [airJetBoost, setAirJetBoost] = useState(12);
  const [qcStaff, setQcStaff] = useState(3);
  const [incomingContam, setIncomingContam] = useState(9.5);
  const [running, setRunning] = useState(false);
  const [compareScenarioId, setCompareScenarioId] = useState<string>('');
  const [simResult, setSimResult] = useState<{
    assumptionsText: string;
    projectedRecoveryRatePct: number;
    projectedPurityPct: number;
    projectedRejectRatePct: number;
    projectedThroughputTph: number;
    bottleneckStage: string;
    hotspotStage: string;
    stageFlows: Array<{ stageId: string; stageName: string; loadTph: number; utilizationPct: number; stageRecoveryPct: number; contaminationHotspotScore: number; isBottleneck: boolean }>;
    predictiveNext7Days: Array<{ day: string; predictedRecoveryPct: number; predictedContaminationPct: number }>;
  } | null>(null);

  const load = () => {
    apiRequest<{ configs: typeof configs; scenarios: Array<Record<string, unknown>> }>('/digital-twin')
      .then((r) => {
        setConfigs(r.configs);
        setScenarios(r.scenarios);
        if (r.scenarios.length > 0 && !compareScenarioId) {
          setCompareScenarioId(String(r.scenarios[0].id));
        }
      })
      .catch(() => {});
    const q = activeFacility ? `?facilityId=${encodeURIComponent(activeFacility.id)}` : '';
    apiRequest<{ flowStreams: typeof flowStreams }>(`/digital-twin/flow${q}`)
      .then((r) => setFlowStreams(r.flowStreams))
      .catch(() => {});
  };

  useEffect(() => {
    load();
  }, [activeFacility?.id]);

  const runSimulation = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setRunning(true);
    try {
      const res = await apiRequest<{ results: NonNullable<typeof simResult> }>('/simulations/run', {
        method: 'POST',
        body: JSON.stringify({
          facilityId: activeFacility?.id,
          twinConfigId: configs[0]?.id,
          name: simName,
          parameters: {
            infeedRateTph: infeedRate,
            beltSpeedMps: beltSpeed,
            confidenceThreshold: confThreshold,
            opticalAirJetBoostPct: airJetBoost,
            manualQcStaffCount: qcStaff,
            incomingContaminationPct: incomingContam,
          },
        }),
      });
      setSimResult(res.results);
      if (e) {
        pushToast({ tone: 'success', title: 'Simulation completed', description: `Projected recovery: ${res.results.projectedRecoveryRatePct}%` });
      }
      load();
    } catch (err) {
      if (e) {
        pushToast({ tone: 'critical', title: 'Simulation error', description: err instanceof Error ? err.message : 'Request failed' });
      }
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (configs.length > 0 && !simResult) {
      runSimulation();
    }
  }, [configs.length]);

  const activeTwin = configs[0];
  const baselineScenario = scenarios.find((s) => String(s.id) === compareScenarioId) || scenarios[1] || scenarios[0];
  const baselineResults = (baselineScenario?.results as Record<string, unknown>) || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {mode === 'simulator' ? <GitBranch className="h-6 w-6 text-emerald-600" /> : <Network className="h-6 w-6 text-emerald-600" />}
            {mode === 'simulator'
              ? 'Sorting Optimization Simulator & Predictive Analytics'
              : mode === 'material_flow'
                ? 'Material Flow & Precision Recovery Explorer'
                : 'Recycling Facility Digital Twin & Hotspot Map'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            7-stage MRF throughput modeling, bottleneck isolation, contamination hotspot mapping, and scenario comparison.
          </p>
        </div>
        <StatusTag tone="amber">SIMULATION ENVIRONMENT</StatusTag>
      </div>

      <AlertBanner
        tone="warning"
        title="Simulation Boundary Disclosure"
        message="Digital Twin stage balances and 7-day projections are deterministic engineering simulations separated from measured plant recovery records."
      />

      {/* Simulator Controls */}
      <Panel>
        <form onSubmit={runSimulation} className="space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <input
              type="text"
              value={simName}
              onChange={(e) => setSimName(e.target.value)}
              className="font-display font-semibold text-sm bg-transparent border-b border-slate-300 dark:border-slate-700 pb-1 min-w-[260px] text-slate-900 dark:text-white"
            />
            <Button type="submit" variant="primary" size="sm" loading={running}>
              <Play className="h-3.5 w-3.5" /> Run Scenario Simulation
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-slate-500 mb-1">Infeed ({infeedRate} t/h)</label>
              <input type="range" min={5} max={24} step={0.5} value={infeedRate} onChange={(e) => setInfeedRate(Number(e.target.value))} className="w-full accent-emerald-600" />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Belt Speed ({beltSpeed} m/s)</label>
              <input type="range" min={1.0} max={3.2} step={0.05} value={beltSpeed} onChange={(e) => setBeltSpeed(Number(e.target.value))} className="w-full accent-emerald-600" />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">AI Conf Gate ({Math.round(confThreshold * 100)}%)</label>
              <input type="range" min={0.55} max={0.92} step={0.01} value={confThreshold} onChange={(e) => setConfThreshold(Number(e.target.value))} className="w-full accent-emerald-600" />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Air-Jet Boost (+{airJetBoost}%)</label>
              <input type="range" min={0} max={25} step={1} value={airJetBoost} onChange={(e) => setAirJetBoost(Number(e.target.value))} className="w-full accent-emerald-600" />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">QC Staff ({qcStaff})</label>
              <input type="range" min={1} max={8} step={1} value={qcStaff} onChange={(e) => setQcStaff(Number(e.target.value))} className="w-full accent-emerald-600" />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Contamination ({incomingContam}%)</label>
              <input type="range" min={2} max={25} step={0.5} value={incomingContam} onChange={(e) => setIncomingContam(Number(e.target.value))} className="w-full accent-emerald-600" />
            </div>
          </div>
        </form>
      </Panel>

      {simResult && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard label="Projected Recovery" value={`${simResult.projectedRecoveryRatePct}%`} subtext="Modeled yield" tone="emerald" provenance="SIMULATED" />
            <KpiCard label="Projected Bale Purity" value={`${simResult.projectedPurityPct}%`} subtext={`Reject: ${simResult.projectedRejectRatePct}%`} tone="teal" provenance="SIMULATED" />
            <KpiCard label="Net Throughput" value={`${simResult.projectedThroughputTph} t/h`} subtext="Line capacity output" tone="neutral" provenance="SIMULATED" />
            <KpiCard label="Primary Bottleneck" value={simResult.bottleneckStage} subtext="Highest utilization stage" tone="amber" provenance="SIMULATED" />
            <KpiCard label="Contamination Hotspot" value={simResult.hotspotStage} subtext="Elevated residue risk" tone="rose" provenance="SIMULATED" />
          </div>

          {/* Interactive 3D MRF Digital Twin */}
          <Scene3DSuspense heightClass="h-[400px]" label="Loading 3D Facility Digital Twin...">
            <LazyDigitalTwin3D
              stages={activeTwin?.stages || []}
              onOpenStageDetail={(stageId) => navigate(`/digital-twin/stages/${encodeURIComponent(stageId)}`)}
              heightClass="h-[400px]"
            />
          </Scene3DSuspense>

          {/* 7-Stage Visual MRF Node-Flow Schematic */}
          <Panel>
            <SectionHeader
              title={`${activeTwin?.name || 'MRF 7-Stage Process Pipeline'} — Live Node Flow`}
              subtitle="Click any stage card to open stage mass-balance diagnostics and tuning controls."
              badge={<StatusTag tone="amber">SIMULATED FLOW</StatusTag>}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
              {simResult.stageFlows.map((stg, idx) => (
                <div key={stg.stageId} className="relative flex flex-col">
                  <Link
                    to={`/digital-twin/stages/${encodeURIComponent(stg.stageId)}`}
                    className={`flex-1 rounded-xl border p-3.5 text-xs transition-colors hover:border-emerald-500 ${
                      stg.isBottleneck
                        ? 'border-rose-300 bg-rose-50/70 dark:border-rose-800 dark:bg-rose-950/30'
                        : stg.contaminationHotspotScore > 25
                          ? 'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30'
                          : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="font-mono text-[10px] text-slate-500">STAGE 0{idx + 1}</span>
                      {stg.isBottleneck ? (
                        <StatusTag tone="rose">BOTTLENECK</StatusTag>
                      ) : stg.contaminationHotspotScore > 25 ? (
                        <StatusTag tone="amber">HOTSPOT</StatusTag>
                      ) : (
                        <StatusTag tone="emerald">NOMINAL</StatusTag>
                      )}
                    </div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100 leading-snug mb-2">{stg.stageName}</div>
                    <div className="space-y-1 font-mono text-[11px] tabular-nums">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Load</span>
                        <span className="font-semibold">{stg.loadTph} t/h</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Util</span>
                        <span>{stg.utilizationPct}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Hotspot</span>
                        <span>{stg.contaminationHotspotScore}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mt-2.5">
                      <div
                        className={`h-full ${stg.isBottleneck ? 'bg-rose-600' : stg.contaminationHotspotScore > 25 ? 'bg-amber-500' : 'bg-emerald-600'}`}
                        style={{ width: `${Math.min(100, stg.utilizationPct)}%` }}
                      />
                    </div>
                  </Link>
                  {idx < simResult.stageFlows.length - 1 && (
                    <div className="hidden xl:flex items-center justify-center absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-400">
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Before / After Scenario Comparison */}
            <Panel>
              <SectionHeader
                title="Before / After Scenario Comparison"
                subtitle="Compare active simulation parameters against any previously saved scenario."
                action={
                  scenarios.length > 0 && (
                    <select
                      value={compareScenarioId}
                      onChange={(e) => setCompareScenarioId(e.target.value)}
                      className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1 text-xs max-w-[200px]"
                    >
                      {scenarios.map((s) => (
                        <option key={String(s.id)} value={String(s.id)}>
                          {String(s.name)}
                        </option>
                      ))}
                    </select>
                  )
                }
              />
              {!baselineResults ? (
                <EmptyState title="No baseline scenario yet" description="Run a second simulation to compare deltas side-by-side." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase text-[11px]">
                        <th className="py-2 pr-3">Metric</th>
                        <th className="py-2 pr-3 text-right">Baseline ({String(baselineScenario?.name || '').slice(0, 16)})</th>
                        <th className="py-2 pr-3 text-right">Active Run</th>
                        <th className="py-2 text-right">Delta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                      {[
                        {
                          label: 'Recovery Rate (%)',
                          base: Number(baselineResults.projectedRecoveryRatePct || 0),
                          curr: simResult.projectedRecoveryRatePct,
                          unit: '%',
                        },
                        {
                          label: 'Bale Purity (%)',
                          base: Number(baselineResults.projectedPurityPct || 0),
                          curr: simResult.projectedPurityPct,
                          unit: '%',
                        },
                        {
                          label: 'Throughput (t/h)',
                          base: Number(baselineResults.projectedThroughputTph || 0),
                          curr: simResult.projectedThroughputTph,
                          unit: ' t/h',
                        },
                        {
                          label: 'Reject Rate (%)',
                          base: Number(baselineResults.projectedRejectRatePct || 0),
                          curr: simResult.projectedRejectRatePct,
                          unit: '%',
                        },
                      ].map((row) => {
                        const delta = Number((row.curr - row.base).toFixed(1));
                        return (
                          <tr key={row.label}>
                            <td className="py-2.5 pr-3 font-sans font-medium text-slate-800 dark:text-slate-200">{row.label}</td>
                            <td className="py-2.5 pr-3 text-right text-slate-500">{row.base}{row.unit}</td>
                            <td className="py-2.5 pr-3 text-right font-semibold text-slate-900 dark:text-white">{row.curr}{row.unit}</td>
                            <td className={`py-2.5 text-right font-semibold ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                              {delta > 0 ? `+${delta}` : delta}{row.unit}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            {/* 7-Day Predictive Trajectory */}
            <Panel>
              <SectionHeader title="7-Day Modeled Predictive Trajectory" badge={<StatusTag tone="amber">MODELED</StatusTag>} />
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={simResult.predictiveNext7Days}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="predictedRecoveryPct" name="Modeled Recovery %" stroke="#059669" strokeWidth={2} />
                    <Line type="monotone" dataKey="predictedContaminationPct" name="Modeled Contam %" stroke="#d97706" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
        </>
      )}

      {/* Material Flow Streams & Saved Scenarios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel>
          <SectionHeader title="Measured Chute Flow Distribution" badge={<StatusTag tone="emerald">RECORDED</StatusTag>} />
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowStreams}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="stream" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="object_count" name="Objects Routed" fill="#0284c7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel>
          <SectionHeader title="Saved Simulation Scenarios" subtitle="Audit trail of simulated operating profiles" />
          <DataTable
            rows={scenarios}
            rowKey={(sc) => String(sc.id)}
            pageSize={5}
            columns={[
              {
                key: 'name',
                header: 'Scenario',
                render: (sc) => <span className="font-medium text-xs">{String(sc.name)}</span>,
              },
              {
                key: 'rec',
                header: 'Recovery',
                align: 'right',
                render: (sc) => {
                  const res = (sc.results as Record<string, unknown>) || {};
                  return <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400">{String(res.projectedRecoveryRatePct || '—')}%</span>;
                },
              },
              {
                key: 'pur',
                header: 'Purity',
                align: 'right',
                render: (sc) => {
                  const res = (sc.results as Record<string, unknown>) || {};
                  return <span className="font-mono text-xs">{String(res.projectedPurityPct || '—')}%</span>;
                },
              },
              {
                key: 'bot',
                header: 'Bottleneck',
                render: (sc) => {
                  const res = (sc.results as Record<string, unknown>) || {};
                  return <span className="text-xs text-slate-500">{String(res.bottleneckStage || '—')}</span>;
                },
              },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
};

export const OperationsInventoryBatchesView: React.FC<{
  mode: 'operations' | 'inventory' | 'batches';
  activeFacility?: Facility;
  onRefreshFacilities: () => void;
  initialTab?: 'handovers' | 'tasks' | 'facilities';
}> = ({ mode, activeFacility, onRefreshFacilities, initialTab = 'handovers' }) => {
  const { pushToast } = useToast();
  const [batches, setBatches] = useState<Array<Record<string, unknown>>>([]);
  const [tasks, setTasks] = useState<Array<Record<string, unknown>>>([]);
  const [inventory, setInventory] = useState<Array<Record<string, unknown>>>([]);
  const [handovers, setHandovers] = useState<ShiftHandoverRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [opsTab, setOpsTab] = useState<'handovers' | 'tasks' | 'facilities'>(initialTab);

  useEffect(() => {
    setOpsTab(initialTab);
  }, [initialTab]);
  const [searchQ, setSearchQ] = useState('');

  // Forms
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [facName, setFacName] = useState('');
  const [facCity, setFacCity] = useState('');
  const [facCountry, setFacCountry] = useState('SE');
  const [batchRoute, setBatchRoute] = useState('');
  const [batchKg, setBatchKg] = useState(2500);
  const [invCode, setInvCode] = useState('PET_01');
  const [invBales, setInvBales] = useState(12);
  const [invKg, setInvKg] = useState(5400);

  // Handover Form
  const [shiftLabel, setShiftLabel] = useState('Afternoon Shift B (14:00 – 22:00)');
  const [incomingUserName, setIncomingUserName] = useState('Henrik Vermeer');
  const [summaryNotes, setSummaryNotes] = useState('');
  const [safetyNotes, setSafetyNotes] = useState('');

  const load = () => {
    setLoading(true);
    const facQ = activeFacility ? `?facilityId=${encodeURIComponent(activeFacility.id)}` : '';
    Promise.all([
      apiRequest<{ batches: Array<Record<string, unknown>>; tasks: Array<Record<string, unknown>> }>('/operations/overview').then((r) => {
        setBatches(r.batches);
        setTasks(r.tasks);
      }),
      apiRequest<{ inventory: Array<Record<string, unknown>> }>('/inventory').then((r) => setInventory(r.inventory)),
      apiRequest<{ handovers: ShiftHandoverRecord[] }>(`/operations/handovers${facQ}`).then((r) => setHandovers(r.handovers)),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [activeFacility?.id]);

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFacility) return;
    try {
      await apiRequest('/operations/tasks', {
        method: 'POST',
        body: JSON.stringify({ facilityId: activeFacility.id, title: taskTitle, priority: taskPriority }),
      });
      pushToast({ tone: 'success', title: 'Operator task assigned', description: taskTitle });
      setTaskTitle('');
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Failed to assign task', description: err instanceof Error ? err.message : 'Request failed' });
    }
  };

  const completeTask = async (id: string) => {
    try {
      await apiRequest(`/operations/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) });
      pushToast({ tone: 'success', title: 'Task marked completed' });
      load();
    } catch {
      pushToast({ tone: 'critical', title: 'Could not update task' });
    }
  };

  const createFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/facilities', {
        method: 'POST',
        body: JSON.stringify({ name: facName, city: facCity, countryCode: facCountry, region: 'Operations Region' }),
      });
      pushToast({ tone: 'success', title: 'Facility provisioned', description: `${facName} (${facCity})` });
      setFacName('');
      setFacCity('');
      onRefreshFacilities();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Provisioning failed', description: err instanceof Error ? err.message : 'Admin/Manager role required' });
    }
  };

  const createBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFacility) return;
    try {
      await apiRequest('/operations/batches', {
        method: 'POST',
        body: JSON.stringify({ facilityId: activeFacility.id, sourceRoute: batchRoute, intakeWeightKg: batchKg }),
      });
      pushToast({ tone: 'success', title: 'Collection intake batch logged', description: `${batchRoute} (${batchKg} kg)` });
      setBatchRoute('');
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Batch creation failed', description: err instanceof Error ? err.message : 'Request failed' });
    }
  };

  const upsertInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFacility) return;
    try {
      await apiRequest('/inventory', {
        method: 'POST',
        body: JSON.stringify({ facilityId: activeFacility.id, materialCode: invCode, baleCount: invBales, weightKg: invKg }),
      });
      pushToast({ tone: 'success', title: 'Material stock updated', description: `${invCode}: ${invBales} bales (${invKg} kg)` });
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Inventory update failed', description: err instanceof Error ? err.message : 'Request failed' });
    }
  };

  const submitHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFacility) return;
    try {
      await apiRequest('/operations/handovers', {
        method: 'POST',
        body: JSON.stringify({
          facilityId: activeFacility.id,
          shiftLabel,
          incomingUserName,
          summaryNotes,
          safetyNotes,
        }),
      });
      pushToast({
        tone: 'success',
        title: 'Shift handover submitted',
        description: `Live plant snapshot recorded for ${activeFacility.name}.`,
      });
      setSummaryNotes('');
      setSafetyNotes('');
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Handover failed', description: err instanceof Error ? err.message : 'Request failed' });
    }
  };

  const acknowledgeHandover = async (id: string) => {
    try {
      await apiRequest(`/operations/handovers/${id}/signoff`, { method: 'PATCH', body: JSON.stringify({}) });
      pushToast({ tone: 'success', title: 'Shift handover signed off', description: 'Supervisor acknowledgement recorded in audit log.' });
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Sign-off failed', description: err instanceof Error ? err.message : 'Request failed' });
    }
  };

  const exportHandoverPdf = (h: ShiftHandoverRecord) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('SortSight AI — Operational Shift Handover Report', 14, 18);
    doc.setFontSize(10);
    doc.text(`Facility: ${h.facility_name || h.facility_id}`, 14, 28);
    doc.text(`Shift: ${h.shift_label}`, 14, 34);
    doc.text(`Outgoing Operator: ${h.outgoing_user_name}  |  Incoming: ${h.incoming_user_name}`, 14, 40);
    doc.text(`Status: ${h.status.toUpperCase()}  |  Recorded: ${h.created_at}`, 14, 46);
    doc.text(
      `Snapshot -> Conveyor: ${h.conveyor_status_snapshot.toUpperCase()} | Open Hazards: ${h.open_hazards_count} | Pending Reviews: ${h.pending_reviews_count} | Items Processed: ${h.items_processed_count}`,
      14,
      54
    );
    doc.text('Operational Summary:', 14, 66);
    doc.text(doc.splitTextToSize(h.summary_notes, 180), 14, 72);
    doc.text('Safety & Hazard Notes:', 14, 96);
    doc.text(doc.splitTextToSize(h.safety_notes || 'None reported.', 180), 14, 102);
    if (h.signed_off_by_name) {
      doc.text(`Supervisor Sign-Off: ${h.signed_off_by_name} at ${h.signed_off_at || ''}`, 14, 124);
    }
    doc.save(`shift_handover_${h.id}.pdf`);
    pushToast({ tone: 'info', title: 'PDF Handover Report exported' });
  };

  if (mode === 'inventory') {
    const totalBales = inventory.reduce((s, i) => s + Number(i.bale_count || 0), 0);
    const totalMass = inventory.reduce((s, i) => s + Number(i.weight_kg || 0), 0);
    const filteredInv = inventory.filter((i) => {
      const q = searchQ.trim().toLowerCase();
      return !q || String(i.material_name).toLowerCase().includes(q) || String(i.facility_name).toLowerCase().includes(q);
    });

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Package className="h-6 w-6 text-emerald-600" />
              Material Inventory Management
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Track baled recovered material stock, bay locations, and bale purity across facilities.</p>
          </div>
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Filter material or facility..."
              className="pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard label="Total Bales in Stock" value={totalBales} subtext="Across active facilities" tone="emerald" provenance="LIVE" />
          <KpiCard label="Total Recovered Stock" value={`${totalMass.toLocaleString()} kg`} subtext="Ready for downstream offtake" tone="teal" provenance="LIVE" />
          <KpiCard label="Active Stock Lines" value={inventory.length} subtext="Material-bay allocations" tone="neutral" />
        </div>

        <Panel>
          <form onSubmit={upsertInventory} className="flex flex-wrap items-end gap-3 text-xs">
            <div>
              <label className="block text-slate-500 mb-1">Material</label>
              <select value={invCode} onChange={(e) => setInvCode(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono">
                <option value="PET_01">PET_01</option>
                <option value="HDPE_02">HDPE_02</option>
                <option value="ALUM_CAN">ALUM_CAN</option>
                <option value="OCC_CARD">OCC_CARD</option>
                <option value="GLASS_CLR">GLASS_CLR</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Bales</label>
              <input type="number" value={invBales} onChange={(e) => setInvBales(Number(e.target.value))} className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono" />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Weight (kg)</label>
              <input type="number" value={invKg} onChange={(e) => setInvKg(Number(e.target.value))} className="w-32 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono" />
            </div>
            <Button type="submit" variant="primary" size="sm">Update Stock</Button>
          </form>
        </Panel>

        <Panel>
          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : (
            <DataTable
              rows={filteredInv}
              rowKey={(i) => String(i.id)}
              pageSize={10}
              columns={[
                { key: 'fac', header: 'Facility', sortValue: (i) => String(i.facility_name), render: (i) => <span className="text-xs">{String(i.facility_name)}</span> },
                {
                  key: 'mat',
                  header: 'Material',
                  sortValue: (i) => String(i.material_name),
                  render: (i) => (
                    <Link to={`/inventory/${encodeURIComponent(String(i.id))}`} className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
                      {String(i.material_name)}
                    </Link>
                  ),
                },
                { key: 'bales', header: 'Bales', align: 'right', sortValue: (i) => Number(i.bale_count), render: (i) => <span className="font-mono text-xs">{String(i.bale_count)}</span> },
                { key: 'weight', header: 'Weight (kg)', align: 'right', sortValue: (i) => Number(i.weight_kg), render: (i) => <span className="font-mono text-xs font-semibold">{Number(i.weight_kg).toLocaleString()}</span> },
                { key: 'purity', header: 'Avg Purity', align: 'right', sortValue: (i) => Number(i.avg_purity_pct), render: (i) => <StatusTag tone="emerald">{String(i.avg_purity_pct)}%</StatusTag> },
                { key: 'zone', header: 'Storage Zone', render: (i) => <span className="font-mono text-xs text-slate-500">{String(i.storage_zone)}</span> },
              ]}
            />
          )}
        </Panel>
      </div>
    );
  }

  if (mode === 'batches') {
    const filteredBatches = batches.filter((b) => {
      const q = searchQ.trim().toLowerCase();
      return !q || String(b.batch_code).toLowerCase().includes(q) || String(b.source_route).toLowerCase().includes(q);
    });

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Truck className="h-6 w-6 text-emerald-600" />
              Collection &amp; Processing Batches
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Inbound route intake tonnage, sorting status, and batch recovery yield tracking.</p>
          </div>
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search batch code or route..."
              className="pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
        </div>

        <Panel>
          <form onSubmit={createBatch} className="flex flex-wrap gap-3 text-xs items-center">
            <input type="text" required placeholder="Collection Source Route" value={batchRoute} onChange={(e) => setBatchRoute(e.target.value)} className="flex-1 min-w-[220px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
            <input type="number" required value={batchKg} onChange={(e) => setBatchKg(Number(e.target.value))} className="w-36 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono" />
            <Button type="submit" variant="primary" size="sm">Log Intake Batch</Button>
          </form>
        </Panel>

        <Panel>
          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : (
            <DataTable
              rows={filteredBatches}
              rowKey={(b) => String(b.id)}
              pageSize={10}
              columns={[
                {
                  key: 'code',
                  header: 'Batch Code',
                  render: (b) => (
                    <Link to={`/batches/${encodeURIComponent(String(b.id))}`} className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
                      {String(b.batch_code)}
                    </Link>
                  ),
                },
                { key: 'fac', header: 'Facility', render: (b) => <span className="text-xs">{String(b.facility_name)}</span> },
                { key: 'route', header: 'Source Route', render: (b) => <span className="text-xs">{String(b.source_route)}</span> },
                { key: 'intake', header: 'Intake (kg)', align: 'right', sortValue: (b) => Number(b.intake_weight_kg), render: (b) => <span className="font-mono text-xs">{Number(b.intake_weight_kg).toLocaleString()}</span> },
                { key: 'recov', header: 'Recovered (kg)', align: 'right', sortValue: (b) => Number(b.recovered_weight_kg), render: (b) => <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400">{Number(b.recovered_weight_kg).toLocaleString()}</span> },
                { key: 'status', header: 'Status', render: (b) => <StatusTag tone={b.status === 'completed' ? 'emerald' : 'teal'}>{String(b.status).toUpperCase()}</StatusTag> },
              ]}
            />
          )}
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-emerald-600" />
            {opsTab === 'handovers' ? 'Shift Handover Center' : opsTab === 'tasks' ? 'Operations &amp; Task Management' : 'Facility Provisioning'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {opsTab === 'handovers'
              ? 'Record shift transitions, review safety notes, and capture supervisor sign-offs for the active facility.'
              : opsTab === 'tasks'
                ? 'Assign, prioritize, and track operational work across your active facility.'
                : 'Add a facility to the current organization and keep its operational data tenant-isolated.'}
          </p>
        </div>
        <Tabs
          items={[
            { id: 'handovers' as const, label: 'Shift Handovers', count: handovers.length },
            { id: 'tasks' as const, label: 'Operator Tasks', count: tasks.filter((t) => t.status !== 'completed').length },
            { id: 'facilities' as const, label: 'Provision Facility' },
          ]}
          activeId={opsTab}
          onChange={setOpsTab}
        />
      </div>

      {opsTab === 'handovers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Panel className="lg:col-span-5">
            <SectionHeader
              title="Submit Shift Handover Report"
              subtitle={`Captures live conveyor status, open hazards, and pending QA reviews for ${activeFacility?.name || 'selected facility'}.`}
            />
            <form onSubmit={submitHandover} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Shift Window</label>
                <input
                  type="text"
                  required
                  value={shiftLabel}
                  onChange={(e) => setShiftLabel(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Incoming Shift Supervisor / Operator</label>
                <input
                  type="text"
                  required
                  value={incomingUserName}
                  onChange={(e) => setIncomingUserName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Operational Summary Notes</label>
                <textarea
                  required
                  rows={3}
                  value={summaryNotes}
                  onChange={(e) => setSummaryNotes(e.target.value)}
                  placeholder="Throughput notes, chute adjustments, screen clearings..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Safety &amp; Hazard Escalation Notes</label>
                <textarea
                  rows={2}
                  value={safetyNotes}
                  onChange={(e) => setSafetyNotes(e.target.value)}
                  placeholder="Firebox drum status, E-stop tests, PPE advisories..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                />
              </div>
              <Button type="submit" variant="primary" size="sm" disabled={!activeFacility}>
                <Plus className="h-3.5 w-3.5" /> Submit Shift Handover
              </Button>
            </form>
          </Panel>

          <div className="lg:col-span-7 space-y-3">
            {loading ? (
              <LoadingSkeleton rows={3} />
            ) : handovers.length === 0 ? (
              <EmptyState title="No shift handovers recorded" description="Submit the first shift handover log on the left to establish continuity." />
            ) : (
              handovers.map((h) => (
                <Panel key={h.id} className="space-y-3 text-xs">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <StatusTag tone={h.status === 'acknowledged' ? 'emerald' : 'amber'}>
                          {h.status === 'acknowledged' ? 'ACKNOWLEDGED' : 'AWAITING SIGN-OFF'}
                        </StatusTag>
                        {h.is_demo_data === 1 && <StatusTag tone="neutral">DEMO</StatusTag>}
                        <span className="font-mono text-[11px] text-slate-500">{h.facility_name}</span>
                      </div>
                      <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">{h.shift_label}</h3>
                      <div className="text-slate-500 mt-0.5">
                        Outgoing: <strong className="text-slate-700 dark:text-slate-300">{h.outgoing_user_name}</strong> → Incoming:{' '}
                        <strong className="text-slate-700 dark:text-slate-300">{h.incoming_user_name}</strong>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => exportHandoverPdf(h)}>
                        <Download className="w-3.5 h-3.5" /> PDF
                      </Button>
                      {h.status !== 'acknowledged' && (
                        <Button size="sm" variant="primary" onClick={() => acknowledgeHandover(h.id)}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Supervisor Sign-Off
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 font-mono text-[11px]">
                    <div>Conveyor: <strong className="uppercase">{h.conveyor_status_snapshot}</strong></div>
                    <div className={h.open_hazards_count > 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}>
                      Open Hazards: <strong>{h.open_hazards_count}</strong>
                    </div>
                    <div>Pending QA: <strong>{h.pending_reviews_count}</strong></div>
                    <div>Frames: <strong>{h.items_processed_count}</strong></div>
                  </div>

                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{h.summary_notes}</p>
                  {h.safety_notes && (
                    <div className="p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                      <span>{h.safety_notes}</span>
                    </div>
                  )}
                  {h.signed_off_by_name && (
                    <div className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                      Signed off by {h.signed_off_by_name} at {h.signed_off_at}
                    </div>
                  )}
                </Panel>
              ))
            )}
          </div>
        </div>
      )}

      {opsTab === 'tasks' && (
        <Panel>
          <SectionHeader title="Assign & Track Operator Tasks" />
          <form onSubmit={createTask} className="space-y-4 text-xs">
            <div className="flex flex-wrap gap-2">
              <input type="text" required placeholder="Task Title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} className="flex-1 min-w-[220px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
              <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as typeof taskPriority)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <Button type="submit" variant="primary" size="sm">
                <Plus className="h-3.5 w-3.5" /> Assign Task
              </Button>
            </div>
            <div className="space-y-2">
              {tasks.map((tk) => (
                <div key={String(tk.id)} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">{String(tk.title)}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusTag tone={tk.priority === 'urgent' ? 'rose' : tk.priority === 'high' ? 'amber' : 'neutral'}>
                        {String(tk.priority).toUpperCase()}
                      </StatusTag>
                      <StatusTag tone={tk.status === 'completed' ? 'emerald' : 'teal'}>{String(tk.status).toUpperCase()}</StatusTag>
                      <span className="text-slate-500 font-mono text-[11px]">{String(tk.facility_name)}</span>
                    </div>
                  </div>
                  {tk.status !== 'completed' && (
                    <Button size="sm" variant="secondary" onClick={() => completeTask(String(tk.id))}>
                      Complete
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </form>
        </Panel>
      )}

      {opsTab === 'facilities' && (
        <Panel>
          <SectionHeader title="Provision New Organization Facility" subtitle="Adds an isolated MRF plant under your active organization tenant." />
          <form onSubmit={createFacility} className="space-y-4 text-xs max-w-2xl">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input type="text" required placeholder="Facility Name" value={facName} onChange={(e) => setFacName(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
              <input type="text" required placeholder="City" value={facCity} onChange={(e) => setFacCity(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
              <input type="text" required maxLength={2} placeholder="Country" value={facCountry} onChange={(e) => setFacCountry(e.target.value.toUpperCase())} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono" />
            </div>
            <Button type="submit" variant="primary" size="sm">Provision Facility</Button>
          </form>
        </Panel>
      )}
    </div>
  );
};
