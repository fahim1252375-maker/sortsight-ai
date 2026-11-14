import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { Activity, ArrowRight, Bot, Download, FileSpreadsheet, Gauge, Leaf, Scale, Send, Sparkles } from 'lucide-react';
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
import { apiRequest, getStoredToken } from '../lib/api.ts';
import { Facility } from '../types/sortsight.ts';
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

export const AnalyticsCenterView: React.FC<{ activeFacility?: Facility }> = ({ activeFacility }) => {
  const { pushToast } = useToast();
  const [overview, setOverview] = useState<{
    dataProvenanceNotice: string;
    detectionMetrics: { totalScans: number; avgReadiness: number | null; avgRecovery: number | null; avgLatencyMs: number | null };
    composition: Array<{ material_code: string; material_name?: string; item_count: number; avg_recovery_score: number }>;
    snapshots: Array<{ snapshot_date: string; recovery_rate_pct: number; contamination_rate_pct: number; sorting_accuracy_pct: number; throughput_tons: number }>;
    volumeTotals: { intakeKg: number | null; recoveredKg: number | null; contaminatedKg: number | null };
  } | null>(null);
  const [compare, setCompare] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<'7d' | '30d' | '90d' | 'custom'>('30d');
  const [startDate, setStartDate] = useState('2026-11-01');
  const [endDate, setEndDate] = useState('2026-11-30');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (activeFacility) params.set('facilityId', activeFacility.id);
    params.set('timeRange', preset);
    if (preset === 'custom') {
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
    }

    Promise.all([
      apiRequest<typeof overview>(`/analytics/overview?${params.toString()}`).then(setOverview),
      apiRequest<{ facilities: Array<Record<string, unknown>> }>('/analytics/facilities-compare').then((r) => setCompare(r.facilities)),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeFacility?.id, preset, startDate, endDate]);

  const downloadCsv = async () => {
    try {
      const token = getStoredToken();
      const res = await fetch('/api/v1/analytics/export-csv', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sortsight_analytics_export.csv';
      a.click();
      URL.revokeObjectURL(url);
      pushToast({ tone: 'success', title: 'CSV analytics exported', description: 'Saved sortsight_analytics_export.csv' });
    } catch {
      pushToast({ tone: 'critical', title: 'Export failed' });
    }
  };

  const downloadPdf = () => {
    if (!overview) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('SortSight AI — Executive Recycling Analytics Report', 14, 18);
    doc.setFontSize(10);
    doc.text(`Facility Scope: ${activeFacility?.name || 'All Organization Facilities'}`, 14, 26);
    doc.text(`Window: ${preset === 'custom' ? `${startDate} to ${endDate}` : preset.toUpperCase()}`, 14, 32);
    doc.text(`Provenance: ${overview.dataProvenanceNotice.slice(0, 92)}`, 14, 38);
    doc.text(
      `Scans: ${overview.detectionMetrics.totalScans} | Avg Recovery: ${Math.round(overview.detectionMetrics.avgRecovery || 0)}/100 | Intake Mass: ${overview.volumeTotals.intakeKg || 0} kg`,
      14,
      46
    );
    let y = 58;
    overview.composition.slice(0, 14).forEach((c) => {
      doc.text(`${c.material_code}: ${c.item_count} detected items (avg recovery ${c.avg_recovery_score}/100)`, 14, y);
      y += 7;
    });
    doc.save('sortsight_analytics_report.pdf');
    pushToast({ tone: 'success', title: 'PDF report generated', description: 'Saved sortsight_analytics_report.pdf' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="h-6 w-6 text-emerald-600" />
            Analytics &amp; Performance Center
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {overview?.dataProvenanceNotice || 'Interactive recovery, contamination, and sorting accuracy analytics.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Tabs
            items={[
              { id: '7d' as const, label: '7D' },
              { id: '30d' as const, label: '30D' },
              { id: '90d' as const, label: '90D' },
              { id: 'custom' as const, label: 'Custom' },
            ]}
            activeId={preset}
            onChange={setPreset}
          />
          {preset === 'custom' && (
            <>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5"
              />
            </>
          )}
          <Link
            to="/analytics/materials"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium text-slate-700 dark:text-slate-200 hover:border-emerald-500 whitespace-nowrap"
          >
            Material Streams <ArrowRight className="w-3 h-3" />
          </Link>
          <Link
            to="/analytics/recovery"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium text-slate-700 dark:text-slate-200 hover:border-emerald-500 whitespace-nowrap"
          >
            Recovery Trends <ArrowRight className="w-3 h-3" />
          </Link>
          <Button variant="secondary" size="sm" onClick={downloadCsv}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="primary" size="sm" onClick={downloadPdf}>
            <Download className="h-3.5 w-3.5" /> PDF Report
          </Button>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        overview && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                label="Inspected Frames"
                value={overview.detectionMetrics.totalScans}
                subtext="Recorded detection records"
                icon={<Gauge className="w-4 h-4" />}
                tone="teal"
                provenance="LIVE"
              />
              <KpiCard
                label="Avg Recovery Score"
                value={`${Math.round(overview.detectionMetrics.avgRecovery || 0)}/100`}
                subtext="Readiness & sorting yield"
                icon={<Scale className="w-4 h-4" />}
                tone="emerald"
                provenance="LIVE"
              />
              <KpiCard
                label="Batch Intake Mass"
                value={`${Number(overview.volumeTotals.intakeKg || 0).toLocaleString()} kg`}
                subtext={`${Number(overview.volumeTotals.recoveredKg || 0).toLocaleString()} kg recovered`}
                icon={<Activity className="w-4 h-4" />}
                tone="neutral"
                provenance="DEMO"
              />
              <KpiCard
                label="Avg Inference Latency"
                value={`${Math.round(overview.detectionMetrics.avgLatencyMs || 0)} ms`}
                subtext="Server-side pipeline time"
                icon={<Sparkles className="w-4 h-4" />}
                tone="teal"
                provenance="LIVE"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Panel>
                <SectionHeader
                  title="Historical Recovery, Accuracy & Contamination"
                  subtitle="Daily facility trend snapshots across selected date horizon"
                  badge={<StatusTag tone="neutral">DEMO SNAPSHOTS</StatusTag>}
                />
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={overview.snapshots}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                      <XAxis dataKey="snapshot_date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="recovery_rate_pct" name="Recovery %" stroke="#059669" strokeWidth={2} />
                      <Line type="monotone" dataKey="sorting_accuracy_pct" name="Accuracy %" stroke="#0284c7" strokeWidth={2} />
                      <Line type="monotone" dataKey="contamination_rate_pct" name="Contamination %" stroke="#dc2626" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel>
                <SectionHeader
                  title="Detected Waste Stream Composition"
                  subtitle="Object volume grouped by fine-grained taxonomy class"
                  badge={<StatusTag tone="emerald">LIVE + DEMO</StatusTag>}
                />
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overview.composition}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                      <XAxis dataKey="material_code" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="item_count" name="Detected Items" fill="#059669" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>
          </>
        )
      )}

      <Panel>
        <SectionHeader title="Facility Performance Benchmarking" subtitle="Side-by-side comparison across active organization facilities" />
        <DataTable
          rows={compare}
          rowKey={(f) => String(f.id)}
          pageSize={8}
          columns={[
            {
              key: 'name',
              header: 'Facility',
              sortValue: (f) => String(f.name),
              render: (f) => <span className="font-semibold text-slate-900 dark:text-slate-100">{String(f.name)}</span>,
            },
            {
              key: 'location',
              header: 'Location',
              render: (f) => <span className="text-xs text-slate-600 dark:text-slate-400">{String(f.city)}, {String(f.country_code)}</span>,
            },
            {
              key: 'recov',
              header: 'Avg Recovery',
              align: 'right',
              sortValue: (f) => Number(f.avg_recovery_pct || 0),
              render: (f) => <span className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold">{f.avg_recovery_pct != null ? `${f.avg_recovery_pct}%` : '—'}</span>,
            },
            {
              key: 'contam',
              header: 'Avg Contam',
              align: 'right',
              sortValue: (f) => Number(f.avg_contamination_pct || 0),
              render: (f) => <span className="font-mono">{f.avg_contamination_pct != null ? `${f.avg_contamination_pct}%` : '—'}</span>,
            },
            {
              key: 'acc',
              header: 'Sorting Accuracy',
              align: 'right',
              sortValue: (f) => Number(f.avg_accuracy_pct || 0),
              render: (f) => <span className="font-mono">{f.avg_accuracy_pct != null ? `${f.avg_accuracy_pct}%` : '—'}</span>,
            },
            {
              key: 'mass',
              header: 'Recovered Mass',
              align: 'right',
              sortValue: (f) => Number(f.total_recovered_kg || 0),
              render: (f) => <span className="font-mono">{Number(f.total_recovered_kg || 0).toLocaleString()} kg</span>,
            },
          ]}
        />
      </Panel>
    </div>
  );
};

export const EnvironmentImpactView: React.FC<{ activeFacility?: Facility }> = ({ activeFacility }) => {
  const { pushToast } = useToast();
  const [estimates, setEstimates] = useState<Array<Record<string, unknown>>>([]);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [petKg, setPetKg] = useState(1200);
  const [alumKg, setAlumKg] = useState(450);
  const [occKg, setOccKg] = useState(2800);
  const [mult, setMult] = useState(1.0);

  const load = () => {
    setLoading(true);
    apiRequest<{ methodologyNotice: string; estimates: Array<Record<string, unknown>> }>('/environment/estimates')
      .then((r) => {
        setNotice(r.methodologyNotice);
        setEstimates(r.estimates);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const runEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFacility) return;
    setSubmitting(true);
    try {
      await apiRequest('/environment/estimate', {
        method: 'POST',
        body: JSON.stringify({
          facilityId: activeFacility.id,
          periodLabel: `Impact Model (${new Date().toISOString().slice(0, 10)})`,
          materialWeightsKg: { PET_01: petKg, ALUM_CAN: alumKg, OCC_CARD: occKg },
          emissionFactorMultiplier: mult,
        }),
      });
      pushToast({ tone: 'success', title: 'Modeled environmental estimate calculated' });
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Calculation failed', description: err instanceof Error ? err.message : 'Request failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const chartData = estimates
    .slice(0, 6)
    .reverse()
    .map((e) => ({
      period: String(e.period_label).slice(0, 18),
      co2Kg: Number(e.modeled_co2_avoided_kg || 0),
      energyKwh: Number(e.modeled_energy_saved_kwh || 0),
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Leaf className="h-6 w-6 text-emerald-600" />
          Environmental Impact Estimator
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Transparent separation between measured recovered tonnage and modeled CO2e, energy, and landfill volume savings.
        </p>
      </div>

      <AlertBanner
        tone="warning"
        title="Modeled Impact Methodology Disclosure"
        message={notice || 'Environmental estimates apply configurable EPA WARM / EU JRC lifecycle factors to measured weights. Modeled estimates are NOT audited carbon credits.'}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Panel className="lg:col-span-7">
          <form onSubmit={runEstimate} className="space-y-4 text-xs">
            <SectionHeader title="Configure Modeled Recovery Inputs" subtitle={`Target facility: ${activeFacility?.name || 'Select a facility'}`} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium mb-1">PET #1 Recovered (kg)</label>
                <input type="number" min={0} value={petKg} onChange={(e) => setPetKg(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono" />
              </div>
              <div>
                <label className="block font-medium mb-1">Aluminum Recovered (kg)</label>
                <input type="number" min={0} value={alumKg} onChange={(e) => setAlumKg(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono" />
              </div>
              <div>
                <label className="block font-medium mb-1">Dry OCC Fiber (kg)</label>
                <input type="number" min={0} value={occKg} onChange={(e) => setOccKg(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono" />
              </div>
              <div>
                <label className="block font-medium mb-1">Grid Emission Factor Multiplier ({mult}x)</label>
                <input type="range" min={0.6} max={1.4} step={0.05} value={mult} onChange={(e) => setMult(Number(e.target.value))} className="w-full mt-2 accent-emerald-600" />
              </div>
            </div>
            <Button type="submit" variant="primary" size="sm" loading={submitting} disabled={!activeFacility}>
              Calculate Modeled Impact
            </Button>
          </form>
        </Panel>

        <Panel className="lg:col-span-5">
          <SectionHeader title="Modeled Savings Comparison" badge={<StatusTag tone="amber">MODELED</StatusTag>} />
          {chartData.length === 0 ? (
            <EmptyState title="No impact runs yet" description="Run a calculation on the left to plot CO2e and energy displacement." />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="co2Kg" name="CO2e Avoided (kg)" fill="#059669" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="energyKwh" name="Energy Saved (kWh)" fill="#0284c7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : estimates.length === 0 ? (
        <EmptyState title="No environmental impact estimates stored" description="Submit recovered material weights above to generate an estimate." />
      ) : (
        <div className="space-y-3">
          {estimates.map((est) => (
            <Panel key={String(est.id)} className="text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-sm text-slate-900 dark:text-white">{String(est.period_label)}</div>
                <StatusTag tone="amber">MODELED ESTIMATE (Not Audited Carbon Credit)</StatusTag>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
                <div><div className="text-slate-500">Measured Input Mass</div><div className="font-mono text-base font-semibold tabular-nums">{String(est.measured_recovered_kg)} kg</div></div>
                <div><div className="text-slate-500">Modeled CO2e Avoided</div><div className="font-mono text-base font-semibold tabular-nums text-emerald-600">{String(est.modeled_co2_avoided_kg)} kg</div></div>
                <div><div className="text-slate-500">Modeled Energy Saved</div><div className="font-mono text-base font-semibold tabular-nums">{String(est.modeled_energy_saved_kwh)} kWh</div></div>
                <div><div className="text-slate-500">Landfill Volume Diverted</div><div className="font-mono text-base font-semibold tabular-nums">{String(est.modeled_landfill_diverted_m3)} m³</div></div>
              </div>
              <p className="text-slate-500 dark:text-slate-400 mt-3">{String(est.methodology_notes)}</p>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
};

export const AssistantView: React.FC<{ activeFacility?: Facility }> = ({ activeFacility }) => {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; provider?: string; citations?: Array<{ sourceType: string; id: string; title: string }> }>>([]);
  const [loading, setLoading] = useState(false);

  const sendQuery = async (qText: string, taskType: 'general_query' | 'report_summary' | 'anomaly_explanation' = 'general_query') => {
    if (!qText.trim()) return;
    const nextHistory = [...messages, { role: 'user' as const, content: qText }];
    setMessages(nextHistory);
    setQuestion('');
    setLoading(true);
    try {
      const res = await apiRequest<{
        answer: string;
        provider: string;
        citations: Array<{ sourceType: string; id: string; title: string }>;
      }>('/assistant/query', {
        method: 'POST',
        body: JSON.stringify({
          facilityId: activeFacility?.id,
          question: qText,
          taskType,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      setMessages([
        ...nextHistory,
        { role: 'assistant', content: res.answer, provider: res.provider, citations: res.citations },
      ]);
    } catch (err) {
      setMessages([
        ...nextHistory,
        { role: 'assistant', content: err instanceof Error ? err.message : 'Assistant request failed.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    { label: 'Summarize Facility Report', type: 'report_summary' as const, prompt: 'Summarize current facility recovery performance, contamination issues, and active policies.' },
    { label: 'Explain Open Hazards & Anomalies', type: 'anomaly_explanation' as const, prompt: 'Explain open hazard alerts, pending human reviews, and any operational anomalies.' },
    { label: 'OCC Grease Contamination SOP', type: 'general_query' as const, prompt: 'What is our active acceptance threshold and sorting guidance for grease-contaminated corrugated cardboard (OCC_CARD)?' },
    { label: 'Lithium Battery Quarantine Protocol', type: 'general_query' as const, prompt: 'List immediate containment steps when a lithium-ion battery is flagged on Infeed Line A.' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bot className="h-6 w-6 text-emerald-600" />
            AI Recycling Operations Assistant
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Grounded in live organization detections, hazard alerts, contamination records, and facility policies ({activeFacility?.name || 'All Facilities'}).
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {quickPrompts.map((qp) => (
          <Button key={qp.label} variant="secondary" size="sm" onClick={() => sendQuery(qp.prompt, qp.type)} disabled={loading}>
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            {qp.label}
          </Button>
        ))}
      </div>

      <Panel padding="p-0" className="flex flex-col h-[520px] overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <EmptyState
              icon={<Bot className="w-5 h-5" />}
              title="Ask SortSight Operations Assistant"
              description="Query material acceptance thresholds, grease/food contamination remediation, open lithium battery alerts, or shift performance summaries."
            />
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`p-4 rounded-xl text-xs whitespace-pre-wrap leading-relaxed ${
                m.role === 'user'
                  ? 'bg-emerald-700 text-white ml-auto max-w-2xl'
                  : 'bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 mr-auto max-w-3xl border border-slate-200 dark:border-slate-700'
              }`}
            >
              <div>{m.content}</div>
              {m.provider && (
                <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  <StatusTag tone="teal">Provider: {m.provider}</StatusTag>
                  {m.citations?.map((c) => (
                    <StatusTag key={`${c.sourceType}_${c.id}`} tone="neutral">
                      {c.sourceType}: {c.id}
                    </StatusTag>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuery(question);
          }}
          className="border-t border-slate-200 dark:border-slate-800 p-3 flex items-center gap-2 bg-slate-50/70 dark:bg-slate-900"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about facility acceptance, contamination spikes, or hazard containment..."
            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
          />
          <Button type="submit" variant="primary" size="sm" loading={loading}>
            <Send className="h-3.5 w-3.5" />
            {loading ? 'Analyzing...' : 'Ask'}
          </Button>
        </form>
      </Panel>
    </div>
  );
};
