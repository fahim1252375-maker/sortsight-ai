import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Download,
  GitCompare,
  Scan,
  Search,
  ShieldAlert,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { LazyMaterialExplorer3D, Scene3DSuspense } from '../components/3d/Lazy3DScenes.tsx';
import { Material3DCode, MATERIAL_3D_SPECS } from '../components/3d/industrialProcedural.ts';
import {
  Button,
  Panel,
  SectionHeader,
  StatusTag,
} from '../components/ui/DesignSystem.tsx';
import { useToast } from '../components/ui/ToastProvider.tsx';
import { apiRequest } from '../lib/api.ts';
import { Facility } from '../types/sortsight.ts';

function BackBar({ to, label }: { to: string; label: string }) {
  return (
    <div className="mb-4">
      <Link
        to={to}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-emerald-500 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>{label}</span>
      </Link>
    </div>
  );
}

function DetailPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          {eyebrow}
        </div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{title}</h1>
        {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

function DetailTableShell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">{children}</div>;
}

function MetricTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Panel padding="p-4">
      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">{label}</div>
      {children}
    </Panel>
  );
}

function DetailSkeleton({ title }: { title: string }) {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-64 rounded-lg bg-slate-200 dark:bg-slate-800" />
      <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A]">
        <div className="text-xs font-mono text-slate-400">Loading {title}...</div>
        <div className="mt-4 h-36 rounded-lg bg-slate-100 dark:bg-slate-900" />
      </div>
    </div>
  );
}

export const ScannerHistoryPage: React.FC<{ activeFacility?: Facility }> = ({ activeFacility }) => {
  const navigate = useNavigate();
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (activeFacility?.id) params.set('facilityId', activeFacility.id);
    if (search.trim()) params.set('search', search.trim());
    params.set('limit', '50');
    apiRequest<{ records: Array<Record<string, unknown>> }>(`/detection/history?${params.toString()}`)
      .then((res) => setRecords(res.records || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [activeFacility?.id, search]);

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const compared = compareIds
    .map((id) => records.find((r) => String(r.id) === id))
    .filter(Boolean) as Array<Record<string, unknown>>;

  return (
    <div className="space-y-6">
      <BackBar to="/scanner" label="Back to Smart Waste Scanner" />
      <DetailPageHeader
        eyebrow="Vision & Intelligence · Audit Archive"
        title="Detection Inspection History & Comparison"
        description="Search past optical inspections, compare recovery/readiness scores side-by-side, and open full bounding-box object breakdowns."
        actions={
          <Link
            to="/scanner"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
          >
            <Scan className="w-3.5 h-3.5" />
            New Inspection
          </Link>
        }
      />

      {compared.length === 2 && (
        <Panel>
          <SectionHeader
            title="Side-by-Side Inspection Comparison"
            subtitle="Comparing two selected detection frames across readiness, recovery, and object counts."
            action={
              <Button size="sm" variant="ghost" onClick={() => setCompareIds([])}>
                Clear Comparison
              </Button>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {compared.map((rec) => {
              const objs = (rec.objects as Array<Record<string, unknown>>) || [];
              return (
                <div
                  key={String(rec.id)}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                      {String(rec.image_name)}
                    </span>
                    <StatusTag tone="emerald">{String(rec.inference_provider)}</StatusTag>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 text-xs">
                    <div>
                      <div className="text-slate-500">Readiness</div>
                      <div className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                        {Number(rec.overall_readiness_score)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Recovery</div>
                      <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {Number(rec.overall_recovery_score)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Objects</div>
                      <div className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                        {objs.length}
                      </div>
                    </div>
                  </div>
                  <Link
                    to={`/scanner/result/${rec.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline pt-1"
                  >
                    Open Full Result <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      <Panel>
        <SectionHeader
          title="Stored Optical Records"
          subtitle="Click any inspection row to open its full detail breakdown, or select up to 2 records to compare."
          action={
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter image or provider..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
              />
            </div>
          }
        />
        {loading ? (
          <div className="py-8 text-center text-xs text-slate-500">Loading inspection archive...</div>
        ) : (
          <DetailTableShell>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 uppercase text-[10px]">
                <tr>
                  <th className="px-3 py-2.5">Compare</th>
                  <th className="px-3 py-2.5">Frame / Sample</th>
                  <th className="px-3 py-2.5">Facility</th>
                  <th className="px-3 py-2.5">Provider</th>
                  <th className="px-3 py-2.5 text-right">Readiness</th>
                  <th className="px-3 py-2.5 text-right">Recovery</th>
                  <th className="px-3 py-2.5 text-right">Objects</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {records.map((rec) => {
                  const id = String(rec.id);
                  const objs = (rec.objects as Array<Record<string, unknown>>) || [];
                  const isChecked = compareIds.includes(id);
                  return (
                    <tr
                      key={id}
                      onClick={() => navigate(`/scanner/result/${id}`)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer"
                    >
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleCompare(id)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                            isChecked
                              ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'border-slate-200 dark:border-slate-700 text-slate-500'
                          }`}
                        >
                          <GitCompare className="w-3 h-3" />
                          {isChecked ? 'Selected' : 'Compare'}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">
                        {String(rec.image_name)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                        {String(rec.facility_name || '')}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusTag tone={String(rec.inference_provider).includes('gemini') ? 'emerald' : 'amber'}>
                          {String(rec.inference_provider)}
                        </StatusTag>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {Number(rec.overall_readiness_score)}%
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {Number(rec.overall_recovery_score)}%
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{objs.length}</td>
                      <td className="px-3 py-2.5 text-right">
                        <Link
                          to={`/scanner/result/${id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold hover:underline whitespace-nowrap"
                        >
                          Inspect <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {records.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      No stored inspections matched your filter. Run a scan in Smart Waste Scanner first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </DetailTableShell>
        )}
      </Panel>
    </div>
  );
};

export const ScannerResultDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{
    record: Record<string, unknown>;
    objects: Array<Record<string, unknown>>;
    contamination: Array<Record<string, unknown>>;
    hazards: Array<Record<string, unknown>>;
    reviews: Array<Record<string, unknown>>;
  } | null>(null);
  const [error, setError] = useState('');
  const [selectedObjId, setSelectedObjId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiRequest<{
      record: Record<string, unknown>;
      objects: Array<Record<string, unknown>>;
      contamination: Array<Record<string, unknown>>;
      hazards: Array<Record<string, unknown>>;
      reviews: Array<Record<string, unknown>>;
    }>(`/detection/history/${encodeURIComponent(id)}`)
      .then((res) => {
        setData(res);
        if (res.objects?.length > 0) setSelectedObjId(String(res.objects[0].id));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load inspection record.'));
  }, [id]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackBar to="/scanner/history" label="Back to Inspection History" />
        <Panel>
          <SectionHeader title="Inspection Record Unavailable" />
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        </Panel>
      </div>
    );
  }
  if (!data) return <DetailSkeleton title={`Inspection ${id}`} />;

  const { record, objects, hazards } = data;
  const imageUrl = String(record.image_data_url || '');

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sortsight-inspection-${record.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <BackBar to="/scanner/history" label="Back to Inspection History" />
      <DetailPageHeader
        eyebrow={`Inspection Record · ${String(record.id)}`}
        title={String(record.image_name || 'Detection Result')}
        description={`${String(record.facility_name)} (${String(record.facility_city)}, ${String(record.facility_country)}) · Provider: ${String(record.inference_provider)} · Latency: ${Number(record.inference_latency_ms || 0)} ms`}
        actions={
          <Button size="sm" variant="secondary" onClick={downloadJson}>
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricTile label="Readiness Score">
          <div className="text-2xl font-display font-bold tabular-nums">{Number(record.overall_readiness_score)}%</div>
        </MetricTile>
        <MetricTile label="Recovery Potential">
          <div className="text-2xl font-display font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {Number(record.overall_recovery_score)}%
          </div>
        </MetricTile>
        <MetricTile label="Detected Items">
          <div className="text-2xl font-display font-bold tabular-nums">{objects.length}</div>
        </MetricTile>
        <MetricTile label="Hazard Alerts">
          <div className={`text-2xl font-display font-bold tabular-nums ${hazards.length > 0 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'}`}>
            {hazards.length}
          </div>
        </MetricTile>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6">
          <Panel>
            <SectionHeader
              title="Annotated Optical Frame"
              subtitle="Bounding boxes plotted in 0–1000 normalized camera coordinates."
            />
            <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-[4/3] flex items-center justify-center">
              {imageUrl ? (
                <img src={imageUrl} alt={String(record.image_name)} className="w-full h-full object-contain" />
              ) : (
                <div className="text-xs text-slate-400">Image payload not retained per privacy policy</div>
              )}
              <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
                {objects.map((o) => {
                  let bbox: [number, number, number, number] = [100, 100, 300, 300];
                  try {
                    bbox = JSON.parse(String(o.bbox_json || '[100,100,300,300]'));
                  } catch {
                    // ignore
                  }
                  const [ymin, xmin, ymax, xmax] = bbox;
                  const active = String(o.id) === selectedObjId;
                  const stroke = Number(o.is_hazardous) === 1 ? '#f43f5e' : active ? '#10b981' : '#38bdf8';
                  return (
                    <g key={String(o.id)}>
                      <rect
                        x={xmin}
                        y={ymin}
                        width={Math.max(10, xmax - xmin)}
                        height={Math.max(10, ymax - ymin)}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={active ? 8 : 5}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
          </Panel>
        </div>

        <div className="lg:col-span-6 space-y-4">
          <Panel>
            <SectionHeader
              title="Detected Material Breakdown"
              subtitle="Click a material code to open its 3D Specimen & Global Rules page."
            />
            <div className="space-y-3">
              {objects.map((o) => {
                const oid = String(o.id);
                const matCode = String(o.material_code);
                const isSelected = oid === selectedObjId;
                return (
                  <div
                    key={oid}
                    onClick={() => setSelectedObjId(oid)}
                    className={`p-3.5 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-sm text-slate-900 dark:text-white">{String(o.label)}</span>
                        <span className="ml-2 font-mono text-[11px] text-slate-500">{String(o.track_id || '')}</span>
                      </div>
                      <StatusTag tone={String(o.recyclable_status) === 'hazardous' ? 'rose' : 'emerald'}>
                        {String(o.recyclable_status)}
                      </StatusTag>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{String(o.explanation || '')}</p>
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-mono text-slate-500 tabular-nums">
                        Conf: {(Number(o.calibrated_confidence || 0) * 100).toFixed(1)}% · Chute: {String(o.recommended_chute)}
                      </span>
                      <Link
                        to={`/materials/${encodeURIComponent(matCode)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
                      >
                        Inspect {matCode} <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {hazards.length > 0 && (
            <Panel>
              <SectionHeader title="Linked Hazard Incidents" />
              <div className="space-y-2">
                {hazards.map((h) => (
                  <Link
                    key={String(h.id)}
                    to={`/hazards/${h.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 hover:border-rose-500"
                  >
                    <div>
                      <div className="text-xs font-semibold text-rose-800 dark:text-rose-200">{String(h.title)}</div>
                      <div className="text-[11px] text-rose-600 dark:text-rose-400">{String(h.warning_message)}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-rose-500 shrink-0" />
                  </Link>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
};

export const MaterialDetailPage: React.FC = () => {
  const { materialId } = useParams<{ materialId: string }>();
  const [data, setData] = useState<{
    material: Record<string, unknown>;
    policyRules: Array<Record<string, unknown>>;
    stats: Record<string, unknown> | null;
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!materialId) return;
    apiRequest<{
      material: Record<string, unknown>;
      policyRules: Array<Record<string, unknown>>;
      stats: Record<string, unknown> | null;
    }>(`/materials/taxonomy/${encodeURIComponent(materialId)}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Material not found.'));
  }, [materialId]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackBar to="/materials" label="Back to Material Intelligence" />
        <Panel>
          <SectionHeader title="Material Not Found" />
          <p className="text-sm text-rose-600">{error}</p>
        </Panel>
      </div>
    );
  }
  if (!data) return <DetailSkeleton title={`Material ${materialId}`} />;

  const m = data.material;
  const code = String(m.code) as Material3DCode;
  const has3DModel = Boolean(MATERIAL_3D_SPECS[code]);

  return (
    <div className="space-y-6">
      <BackBar to="/materials" label="Back to Material Intelligence" />
      <DetailPageHeader
        eyebrow={`${String(m.parent_group)} · ${String(m.resin_or_standard_code || m.code)}`}
        title={`${String(m.name)} (${String(m.code)})`}
        description={String(m.description || '')}
      />

      {has3DModel && (
        <Scene3DSuspense heightClass="h-[340px]" label={`Loading 3D ${code} optical specimen...`}>
          <LazyMaterialExplorer3D selectedCode={code} heightClass="h-[340px]" />
        </Scene3DSuspense>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricTile label="EU LoW Code">
          <div className="font-mono text-lg font-bold text-slate-900 dark:text-white">{String(m.eu_low_code || '20 01 39')}</div>
        </MetricTile>
        <MetricTile label="Hazard Class">
          <div className="text-lg font-bold capitalize">{String(m.hazard_class || 'none')}</div>
        </MetricTile>
        <MetricTile label="Org Detections">
          <div className="font-mono text-lg font-bold tabular-nums">{Number(data.stats?.detection_count || 0)}</div>
        </MetricTile>
        <MetricTile label="Avg Recovery Score">
          <div className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {data.stats?.avg_recovery_score ? `${data.stats.avg_recovery_score}%` : '—'}
          </div>
        </MetricTile>
      </div>

      <Panel>
        <SectionHeader
          title="Regional & Facility Policy Acceptance Rules"
          subtitle="How active policies handle this material fraction."
        />
        <DetailTableShell>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 uppercase text-[10px]">
              <tr>
                <th className="px-3 py-2.5">Policy</th>
                <th className="px-3 py-2.5">Region</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Max Contam.</th>
                <th className="px-3 py-2.5">Target Chute</th>
                <th className="px-3 py-2.5">Guidance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.policyRules.map((r) => (
                <tr key={String(r.id)}>
                  <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">{String(r.policy_title)}</td>
                  <td className="px-3 py-2.5 font-mono">{String(r.country_code)} · {String(r.region_name)}</td>
                  <td className="px-3 py-2.5">
                    <StatusTag tone={Number(r.accepted) === 1 ? 'emerald' : 'rose'}>
                      {Number(r.accepted) === 1 ? 'Accepted' : 'Prohibited'}
                    </StatusTag>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{Number(r.max_contamination_pct)}%</td>
                  <td className="px-3 py-2.5 font-mono text-slate-600 dark:text-slate-300">{String(r.target_bin)}</td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{String(r.guidance_text)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DetailTableShell>
      </Panel>
    </div>
  );
};

export const HazardDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { pushToast } = useToast();
  const [data, setData] = useState<{
    disclaimer: string;
    hazard: Record<string, unknown>;
    object: Record<string, unknown> | null;
  } | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    if (!id) return;
    apiRequest<{ disclaimer: string; hazard: Record<string, unknown>; object: Record<string, unknown> | null }>(
      `/hazards/${encodeURIComponent(id)}`
    )
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Hazard alert not found.'));
  };

  useEffect(load, [id]);

  const updateStatus = async (status: 'acknowledged' | 'isolated' | 'resolved' | 'escalated') => {
    try {
      await apiRequest(`/hazards/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      pushToast({ tone: 'success', title: `Hazard updated to ${status}` });
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: err instanceof Error ? err.message : 'Failed to update hazard' });
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <BackBar to="/hazards" label="Back to Hazard Intelligence" />
        <Panel>
          <SectionHeader title="Hazard Not Found" />
          <p className="text-sm text-rose-600">{error}</p>
        </Panel>
      </div>
    );
  }
  if (!data) return <DetailSkeleton title={`Hazard ${id}`} />;

  const h = data.hazard;
  return (
    <div className="space-y-6">
      <BackBar to="/hazards" label="Back to Hazard Intelligence" />
      <DetailPageHeader
        eyebrow={`Safety Incident · ${String(h.facility_name)}`}
        title={String(h.title)}
        description={data.disclaimer}
        actions={
          <div className="flex flex-wrap gap-2">
            {(['acknowledged', 'isolated', 'resolved'] as const).map((st) => (
              <Button key={st} size="sm" variant="secondary" onClick={() => updateStatus(st)}>
                Mark {st}
              </Button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-4">
          <Panel>
            <SectionHeader title="Incident Assessment & PPE Protocol" />
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                <StatusTag tone="rose">{String(h.severity).toUpperCase()}</StatusTag>
                <StatusTag tone={String(h.status) === 'resolved' ? 'emerald' : 'amber'}>{String(h.status)}</StatusTag>
              </div>
              <p className="text-slate-700 dark:text-slate-300">{String(h.warning_message)}</p>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">Recommended Isolation &amp; Handling</div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  {String(h.recommended_action || 'Divert line to HazMat quarantine bin and inspect with Level-B PPE.')}
                </p>
              </div>
              {Boolean(h.detection_record_id) && (
                <Link
                  to={`/scanner/result/${String(h.detection_record_id)}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Open Source Detection Frame <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </Panel>
        </div>
        <div className="lg:col-span-5">
          <Panel>
            <SectionHeader title="Captured Frame Context" />
            {h.image_data_url ? (
              <img
                src={String(h.image_data_url)}
                alt={String(h.image_name || 'Hazard Frame')}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 object-contain max-h-72 bg-slate-950"
              />
            ) : (
              <div className="py-12 text-center text-xs text-slate-500">Frame preview unavailable</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
};

export const FacilityDetailPage: React.FC<{ isAuthenticated: boolean }> = ({ isAuthenticated }) => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{
    facility: Facility & { organization_name?: string };
    isOwned?: boolean;
    snapshots?: Array<Record<string, unknown>>;
    batches?: Array<Record<string, unknown>>;
    conveyorSessions?: Array<Record<string, unknown>>;
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    const endpoint = isAuthenticated
      ? `/facilities/${encodeURIComponent(id)}`
      : `/facilities/directory/${encodeURIComponent(id)}`;
    apiRequest<any>(endpoint)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Facility not found.'));
  }, [id, isAuthenticated]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackBar to="/directory" label="Back to Facility Directory" />
        <Panel>
          <SectionHeader title="Facility Unavailable" />
          <p className="text-sm text-rose-600">{error}</p>
        </Panel>
      </div>
    );
  }
  if (!data) return <DetailSkeleton title={`Facility ${id}`} />;

  const f = data.facility;
  return (
    <div className="space-y-6">
      <BackBar to="/directory" label="Back to Facility Directory" />
      <DetailPageHeader
        eyebrow={`${f.facility_code} · ${f.country_code}`}
        title={f.name}
        description={`${f.facility_type} · ${f.city}, ${f.region} · Operator: ${f.organization_name || 'SortSight Network'}`}
        actions={<StatusTag tone={f.status === 'active' ? 'emerald' : 'amber'}>{f.status.toUpperCase()}</StatusTag>}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricTile label="Daily Capacity">
          <div className="font-mono text-2xl font-bold tabular-nums">{f.capacity_tons_per_day} TPD</div>
        </MetricTile>
        <MetricTile label="Region">
          <div className="text-lg font-semibold">{f.region}</div>
        </MetricTile>
        <MetricTile label="Active Batches">
          <div className="font-mono text-2xl font-bold tabular-nums">{data.batches?.length ?? '—'}</div>
        </MetricTile>
        <MetricTile label="Optical Lines">
          <div className="font-mono text-2xl font-bold tabular-nums">{data.conveyorSessions?.length ?? '—'}</div>
        </MetricTile>
      </div>

      {data.snapshots && data.snapshots.length > 0 && (
        <Panel>
          <SectionHeader title="Daily Recovery & Contamination Trend" subtitle="Telemetry aggregated per operational day." />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.snapshots}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="snapshot_date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="recovery_rate_pct" name="Recovery %" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="contamination_rate_pct" name="Contamination %" stroke="#f59e0b" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      {data.conveyorSessions && data.conveyorSessions.length > 0 && (
        <Panel>
          <SectionHeader title="Facility Optical Conveyor Lines" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.conveyorSessions.map((s) => (
              <Link
                key={String(s.id)}
                to={`/conveyor/session/${s.id}`}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500 flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{String(s.line_name)}</div>
                  <div className="text-xs font-mono text-slate-500 tabular-nums">
                    {Number(s.belt_speed_mps)} m/s · {Number(s.items_processed)} items
                  </div>
                </div>
                <StatusTag tone={String(s.status) === 'running' ? 'emerald' : 'amber'}>{String(s.status)}</StatusTag>
              </Link>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
};

export const StageDetailPage: React.FC = () => {
  const { stageId } = useParams<{ stageId: string }>();
  const [stage, setStage] = useState<Record<string, unknown> | null>(null);
  const [configName, setConfigName] = useState('Primary MRF Twin');

  useEffect(() => {
    apiRequest<{ configs: Array<{ name: string; stages: Array<Record<string, unknown>> }> }>('/digital-twin')
      .then((res) => {
        const cfg = res.configs?.[0];
        if (cfg) {
          setConfigName(cfg.name);
          const found = cfg.stages.find((s) => String(s.id) === stageId) || cfg.stages[0];
          setStage(found || null);
        }
      })
      .catch(() => {});
  }, [stageId]);

  if (!stage) return <DetailSkeleton title={`Stage ${stageId}`} />;

  const cap = Number(stage.capacityTph || 12);
  const load = Number(stage.currentLoadTph || 9);
  const utilPct = Math.round((load / Math.max(0.1, cap)) * 100);
  const contamRisk = Number(stage.contaminationRisk || 0.08);
  const recEff = Number(stage.recoveryEff || 0.95);

  return (
    <div className="space-y-6">
      <BackBar to="/digital-twin" label="Back to 3D Digital Twin" />
      <DetailPageHeader
        eyebrow={`${configName} · Stage ${String(stage.id)}`}
        title={String(stage.name)}
        description="Stage-level mass balance, utilization headroom, and bottleneck remediation recommendations."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricTile label="Current Load">
          <div className="font-mono text-2xl font-bold tabular-nums">{load.toFixed(1)} TPH</div>
        </MetricTile>
        <MetricTile label="Rated Capacity">
          <div className="font-mono text-2xl font-bold tabular-nums">{cap.toFixed(1)} TPH</div>
        </MetricTile>
        <MetricTile label="Utilization">
          <div className={`font-mono text-2xl font-bold tabular-nums ${utilPct >= 90 ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {utilPct}%
          </div>
        </MetricTile>
        <MetricTile label="Stage Recovery Eff.">
          <div className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {(recEff * 100).toFixed(1)}%
          </div>
        </MetricTile>
      </div>

      <Panel>
        <SectionHeader title="Bottleneck & Contamination Diagnostics" />
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span>Contamination Carryover Risk</span>
            <StatusTag tone={contamRisk >= 0.18 ? 'amber' : 'emerald'}>{(contamRisk * 100).toFixed(0)}%</StatusTag>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {utilPct >= 90
              ? 'Stage operating near throughput ceiling. Reduce upstream infeed rate by 1.5 TPH or widen air-jet pulse window in the Optimization Simulator.'
              : 'Stage utilization is within nominal continuous-duty range with adequate surge buffer.'}
          </p>
          <Link
            to="/simulator"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
          >
            Run What-If Optimization <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </Panel>
    </div>
  );
};

export const ReviewDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { pushToast } = useToast();
  const [review, setReview] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    if (!id) return;
    apiRequest<{ review: Record<string, unknown> }>(`/reviews/${encodeURIComponent(id)}`)
      .then((res) => setReview(res.review))
      .catch((err) => setError(err instanceof Error ? err.message : 'Review not found.'));
  };

  useEffect(load, [id]);

  const resolve = async (decision: 'verified_correct' | 'corrected' | 'escalated_expert') => {
    try {
      await apiRequest(`/reviews/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ decision, reviewerNotes: `Resolved via detail inspection (${decision})` }),
      });
      pushToast({ tone: 'success', title: `Review marked ${decision}` });
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: err instanceof Error ? err.message : 'Action failed' });
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <BackBar to="/reviews" label="Back to Human Review Queue" />
        <Panel>
          <SectionHeader title="Review Unavailable" />
          <p className="text-sm text-rose-600">{error}</p>
        </Panel>
      </div>
    );
  }
  if (!review) return <DetailSkeleton title={`Review ${id}`} />;

  return (
    <div className="space-y-6">
      <BackBar to="/reviews" label="Back to Human Review Queue" />
      <DetailPageHeader
        eyebrow={`QA Review · ${String(review.facility_name)}`}
        title={`${String(review.original_label || review.original_material_code)} (${String(review.review_status)})`}
        description={String(review.trigger_reason)}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => resolve('verified_correct')}>
              Verify Correct
            </Button>
            <Button size="sm" variant="secondary" onClick={() => resolve('escalated_expert')}>
              Escalate
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6">
          <Panel>
            <SectionHeader title="Inspection Frame" />
            {review.image_data_url ? (
              <img
                src={String(review.image_data_url)}
                alt={String(review.image_name || 'Review Frame')}
                className="w-full rounded-lg bg-slate-950 object-contain max-h-80"
              />
            ) : (
              <div className="py-12 text-center text-xs text-slate-500">Frame image unavailable</div>
            )}
          </Panel>
        </div>
        <div className="lg:col-span-6">
          <Panel>
            <SectionHeader title="Model Prediction & Context" />
            <dl className="space-y-2.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-500">Original Material Code</dt>
                <dd className="font-mono font-semibold">{String(review.original_material_code)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Original Confidence</dt>
                <dd className="font-mono tabular-nums">{(Number(review.original_confidence || 0) * 100).toFixed(1)}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Inference Provider</dt>
                <dd className="font-mono">{String(review.inference_provider || '—')}</dd>
              </div>
              <div>
                <dt className="text-slate-500 mb-1">AI Explanation</dt>
                <dd className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  {String(review.explanation || 'Flagged by low-confidence safety gate.')}
                </dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
};

export const ModelDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [model, setModel] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    apiRequest<{ model: Record<string, unknown> }>(`/models/${encodeURIComponent(id)}`)
      .then((res) => setModel(res.model))
      .catch((err) => setError(err instanceof Error ? err.message : 'Model not found.'));
  }, [id]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackBar to="/models" label="Back to Model Management" />
        <Panel>
          <SectionHeader title="Model Unavailable" />
          <p className="text-sm text-rose-600">{error}</p>
        </Panel>
      </div>
    );
  }
  if (!model) return <DetailSkeleton title={`Model ${id}`} />;

  const versions = (model.versions as Array<Record<string, unknown>>) || [];

  return (
    <div className="space-y-6">
      <BackBar to="/models" label="Back to Model Management" />
      <DetailPageHeader
        eyebrow={`AI/ML Registry · ${String(model.provider_type || 'vision')}`}
        title={String(model.name)}
        description={`${String(model.architecture || '')} · License: ${String(model.license || 'Proprietary')}`}
      />

      <Panel>
        <SectionHeader title="Registered Model Versions & Evaluation Gates" />
        <DetailTableShell>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 uppercase text-[10px]">
              <tr>
                <th className="px-3 py-2.5">Version</th>
                <th className="px-3 py-2.5">Mode</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {versions.map((v) => (
                <tr key={String(v.id)}>
                  <td className="px-3 py-2.5 font-mono font-semibold">{String(v.version_tag)}</td>
                  <td className="px-3 py-2.5">{String(v.training_mode)}</td>
                  <td className="px-3 py-2.5">
                    <StatusTag tone={String(v.status) === 'production' ? 'emerald' : 'amber'}>{String(v.status)}</StatusTag>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{String(v.notes || '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DetailTableShell>
      </Panel>
    </div>
  );
};

export const BatchDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ batch: Record<string, unknown>; relatedDetections: Array<Record<string, unknown>> } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    apiRequest<{ batch: Record<string, unknown>; relatedDetections: Array<Record<string, unknown>> }>(
      `/operations/batches/${encodeURIComponent(id)}`
    )
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Batch not found.'));
  }, [id]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackBar to="/batches" label="Back to Collection Batches" />
        <Panel>
          <SectionHeader title="Batch Unavailable" />
          <p className="text-sm text-rose-600">{error}</p>
        </Panel>
      </div>
    );
  }
  if (!data) return <DetailSkeleton title={`Batch ${id}`} />;

  const b = data.batch;
  const intake = Number(b.intake_weight_kg || 0);
  const recovered = Number(b.recovered_weight_kg || 0);
  const yieldPct = intake > 0 ? ((recovered / intake) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      <BackBar to="/batches" label="Back to Collection Batches" />
      <DetailPageHeader
        eyebrow={`${String(b.facility_name)} · ${String(b.facility_code)}`}
        title={`Batch ${String(b.batch_code)}`}
        description={`Source Route: ${String(b.source_route)} · Operator: ${String(b.operator_name || 'Assigned')}`}
        actions={<StatusTag tone="emerald">{String(b.status).toUpperCase()}</StatusTag>}
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricTile label="Intake Weight">
          <div className="font-mono text-2xl font-bold tabular-nums">{intake.toLocaleString()} kg</div>
        </MetricTile>
        <MetricTile label="Recovered">
          <div className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {recovered.toLocaleString()} kg
          </div>
        </MetricTile>
        <MetricTile label="Contaminated">
          <div className="font-mono text-2xl font-bold text-amber-600 tabular-nums">
            {Number(b.contaminated_weight_kg || 0).toLocaleString()} kg
          </div>
        </MetricTile>
        <MetricTile label="Recovery Yield">
          <div className="font-mono text-2xl font-bold tabular-nums">{yieldPct}%</div>
        </MetricTile>
      </div>
    </div>
  );
};

export const ConveyorSessionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ session: Record<string, unknown>; decisions: Array<Record<string, unknown>> } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    apiRequest<{ session: Record<string, unknown>; decisions: Array<Record<string, unknown>> }>(
      `/conveyor/sessions/${encodeURIComponent(id)}`
    )
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Session not found.'));
  }, [id]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackBar to="/conveyor" label="Back to Conveyor Monitoring" />
        <Panel>
          <SectionHeader title="Session Unavailable" />
          <p className="text-sm text-rose-600">{error}</p>
        </Panel>
      </div>
    );
  }
  if (!data) return <DetailSkeleton title={`Conveyor Session ${id}`} />;

  const s = data.session;
  return (
    <div className="space-y-6">
      <BackBar to="/conveyor" label="Back to Conveyor Monitoring" />
      <DetailPageHeader
        eyebrow={`${String(s.facility_name)} · SIMULATOR`}
        title={String(s.line_name)}
        description={`Belt Speed: ${Number(s.belt_speed_mps)} m/s · Items Processed: ${Number(s.items_processed)}`}
        actions={<StatusTag tone={String(s.status) === 'running' ? 'emerald' : 'amber'}>{String(s.status)}</StatusTag>}
      />
      <Panel>
        <SectionHeader title="Session Sorting Decisions" />
        <DetailTableShell>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 uppercase text-[10px]">
              <tr>
                <th className="px-3 py-2.5">Material</th>
                <th className="px-3 py-2.5 text-right">Confidence</th>
                <th className="px-3 py-2.5">Assigned Chute</th>
                <th className="px-3 py-2.5">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.decisions.map((d) => (
                <tr key={String(d.id)}>
                  <td className="px-3 py-2.5 font-mono font-semibold">{String(d.material_code)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{(Number(d.confidence || 0) * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2.5 font-mono text-emerald-600 dark:text-emerald-400">{String(d.assigned_chute)}</td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{String(d.decision_reason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DetailTableShell>
      </Panel>
    </div>
  );
};

export const InventoryDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    apiRequest<{ item: Record<string, unknown> }>(`/inventory/${encodeURIComponent(id)}`)
      .then((res) => setItem(res.item))
      .catch((err) => setError(err instanceof Error ? err.message : 'Inventory record not found.'));
  }, [id]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackBar to="/inventory" label="Back to Material Inventory" />
        <Panel>
          <SectionHeader title="Inventory Unavailable" />
          <p className="text-sm text-rose-600">{error}</p>
        </Panel>
      </div>
    );
  }
  if (!item) return <DetailSkeleton title={`Inventory ${id}`} />;

  return (
    <div className="space-y-6">
      <BackBar to="/inventory" label="Back to Material Inventory" />
      <DetailPageHeader
        eyebrow={`${String(item.facility_name)} · ${String(item.storage_zone)}`}
        title={`${String(item.material_name)} (${String(item.material_code)})`}
        description={String(item.material_description || '')}
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricTile label="Bale Count">
          <div className="font-mono text-2xl font-bold tabular-nums">{Number(item.bale_count)}</div>
        </MetricTile>
        <MetricTile label="Total Weight">
          <div className="font-mono text-2xl font-bold tabular-nums">{Number(item.weight_kg).toLocaleString()} kg</div>
        </MetricTile>
        <MetricTile label="Avg Purity">
          <div className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {Number(item.avg_purity_pct)}%
          </div>
        </MetricTile>
        <MetricTile label="Storage Zone">
          <div className="text-lg font-semibold">{String(item.storage_zone)}</div>
        </MetricTile>
      </div>
    </div>
  );
};

export const AnalyticsSubPage: React.FC<{ focus: 'materials' | 'recovery'; activeFacility?: Facility }> = ({
  focus,
  activeFacility,
}) => {
  const [overview, setOverview] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    const q = activeFacility?.id ? `?facilityId=${encodeURIComponent(activeFacility.id)}` : '';
    apiRequest<Record<string, any>>(`/analytics/overview${q}`)
      .then(setOverview)
      .catch(() => setOverview({ composition: [], snapshots: [] }));
  }, [activeFacility?.id]);

  const materials = useMemo(() => (overview?.composition as Array<Record<string, unknown>>) || [], [overview]);
  const series = useMemo(() => (overview?.snapshots as Array<Record<string, unknown>>) || [], [overview]);

  return (
    <div className="space-y-6">
      <BackBar to="/analytics" label="Back to Analytics Center" />
      <DetailPageHeader
        eyebrow="Analytics Center · Deep Dive"
        title={focus === 'materials' ? 'Material Stream Composition Analytics' : 'Recovery Efficiency & Reject Trends'}
        description={
          focus === 'materials'
            ? 'Detected mass share, calibrated confidence, and purity across all polymer, fiber, metal, and glass streams.'
            : 'Historical recovery rate versus contamination carryover across active MRF facilities.'
        }
      />

      {focus === 'materials' ? (
        <Panel>
          <SectionHeader title="Detected Object Volume by Material Code" />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={materials}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="material_code" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="item_count" name="Detected Items" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      ) : (
        <Panel>
          <SectionHeader title="Daily Recovery vs Contamination Rate" />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="snapshot_date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="recovery_rate_pct" name="Recovery %" stroke="#10b981" strokeWidth={2.5} />
                <Line type="monotone" dataKey="contamination_rate_pct" name="Contamination %" stroke="#f59e0b" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}
    </div>
  );
};
