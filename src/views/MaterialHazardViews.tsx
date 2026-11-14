import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  Filter,
  ShieldAlert,
} from 'lucide-react';
import { LazyMaterialExplorer3D, Scene3DSuspense } from '../components/3d/Lazy3DScenes.tsx';
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

interface MaterialCategory {
  code: string;
  name: string;
  parent_group: string;
  resin_or_standard_code: string;
  eu_low_code: string;
  hazard_class: string;
  default_recyclable: number;
  description: string;
  co2_saved_kg_per_kg?: number;
  energy_saved_kwh_per_kg?: number;
  landfill_diverted_m3_per_kg?: number;
}

interface PolicySummary {
  id: string;
  title: string;
  country_code: string;
  policy_origin: string;
}

export const MaterialIntelligenceView: React.FC = () => {
  const { pushToast } = useToast();
  const [materials, setMaterials] = useState<MaterialCategory[]>([]);
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [groupFilter, setGroupFilter] = useState('All');
  const [searchText, setSearchText] = useState('');
  const [compareA, setCompareA] = useState('PET_01');
  const [compareB, setCompareB] = useState('ALUM_CAN');

  // Compatibility Checker state
  const [selectedPolicyId, setSelectedPolicyId] = useState('');
  const [selectedMatCode, setSelectedMatCode] = useState('PET_01');
  const [contamPct, setContamPct] = useState(4);
  const [hasFoodResidue, setHasFoodResidue] = useState(false);
  const [isMultilayer, setIsMultilayer] = useState(false);
  const [compatResult, setCompatResult] = useState<{ compatible: boolean; status: string; explanation: string } | null>(null);

  useEffect(() => {
    apiRequest<{ materials: MaterialCategory[] }>('/materials/taxonomy')
      .then((res) => setMaterials(res.materials))
      .catch(() => {});
    apiRequest<{ policies: PolicySummary[] }>('/recycling/policies')
      .then((res) => {
        setPolicies(res.policies);
        if (res.policies[0]) setSelectedPolicyId(res.policies[0].id);
      })
      .catch(() => {});
  }, []);

  const runCompatCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPolicyId) return;
    try {
      const res = await apiRequest<{ compatible: boolean; status: string; explanation: string }>(
        '/recycling/compatibility-check',
        {
          method: 'POST',
          body: JSON.stringify({
            policyId: selectedPolicyId,
            materialCode: selectedMatCode,
            contaminationPct: contamPct,
            hasFoodResidue,
            isMultilayer,
          }),
        }
      );
      setCompatResult(res);
      pushToast({ tone: res.compatible ? 'success' : 'warning', title: `Policy Status: ${res.status}` });
    } catch (err) {
      pushToast({ tone: 'critical', title: err instanceof Error ? err.message : 'Check failed' });
    }
  };

  const groups = ['All', ...Array.from(new Set(materials.map((m) => m.parent_group)))];
  const filtered = materials.filter((m) => {
    const matchesGroup = groupFilter === 'All' || m.parent_group === groupFilter;
    const q = searchText.trim().toLowerCase();
    const matchesQ =
      !q ||
      m.code.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.eu_low_code.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q);
    return matchesGroup && matchesQ;
  });

  const matA = materials.find((m) => m.code === compareA);
  const matB = materials.find((m) => m.code === compareB);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Material Intelligence &amp; Compatibility Center
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Global material taxonomy mapped to ISO 14021 / RIC and EU List of Wastes codes, paired with an interactive 3D optical specimen inspector.
        </p>
      </div>

      {/* Interactive 3D Material Specimen Inspector */}
      <Scene3DSuspense heightClass="h-[340px]" label="Loading 3D Material Specimen Inspector...">
        <LazyMaterialExplorer3D heightClass="h-[340px]" />
      </Scene3DSuspense>

      {/* Material Category Side-by-Side Comparison */}
      <Panel>
        <SectionHeader
          title="Material Category Comparison"
          subtitle="Compare recovery potential, hazard profile, and modeled environmental displacement factors across two material classes."
          badge={<StatusTag tone="teal">TAXONOMY COMPARE</StatusTag>}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { val: compareA, set: setCompareA, item: matA, label: 'Material Stream A' },
            { val: compareB, set: setCompareB, item: matB, label: 'Material Stream B' },
          ].map((slot) => (
            <div key={slot.label} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{slot.label}</span>
                <select
                  value={slot.val}
                  onChange={(e) => slot.set(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1 text-xs font-medium"
                >
                  {materials.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.name} ({m.code})
                    </option>
                  ))}
                </select>
              </div>
              {slot.item && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-white">{slot.item.name}</span>
                    <StatusTag tone={slot.item.default_recyclable ? 'emerald' : slot.item.hazard_class === 'critical' ? 'rose' : 'amber'}>
                      {slot.item.default_recyclable ? 'RECYCLABLE' : 'RESTRICTED'}
                    </StatusTag>
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono text-[11px] tabular-nums pt-1">
                    <div>ISO/RIC: {slot.item.resin_or_standard_code}</div>
                    <div>EU LoW: {slot.item.eu_low_code}</div>
                    <div>CO2 Factor: {slot.item.co2_saved_kg_per_kg ?? '—'} kg/kg</div>
                    <div>Energy Factor: {slot.item.energy_saved_kwh_per_kg ?? '—'} kWh/kg</div>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">{slot.item.description}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>

      {/* Interactive Compatibility Checker */}
      <Panel>
        <form onSubmit={runCompatCheck} className="space-y-4">
          <SectionHeader
            title="Facility Acceptance & Compatibility Checker"
            subtitle="Evaluate whether a detected material meets a specific facility or regional policy threshold."
            action={<ArrowLeftRight className="w-4 h-4 text-emerald-600" />}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Facility / Regional Policy</label>
              <select
                value={selectedPolicyId}
                onChange={(e) => setSelectedPolicyId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
              >
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.country_code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Material Class</label>
              <select
                value={selectedMatCode}
                onChange={(e) => setSelectedMatCode(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
              >
                {materials.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Visible Contamination (<span className="font-mono tabular-nums">{contamPct}%</span>)
              </label>
              <input
                type="range"
                min={0}
                max={50}
                value={contamPct}
                onChange={(e) => setContamPct(Number(e.target.value))}
                className="w-full mt-2 accent-emerald-600"
              />
            </div>
            <div className="flex flex-col justify-end gap-1.5">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={hasFoodResidue} onChange={(e) => setHasFoodResidue(e.target.checked)} />
                Food / Oil Residue
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isMultilayer} onChange={(e) => setIsMultilayer(e.target.checked)} />
                Multi-Layer Laminate
              </label>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Button type="submit" variant="primary" size="md">
              Evaluate Compatibility
            </Button>
            {compatResult && (
              <div
                className={`text-xs font-medium flex items-center gap-2 px-3 py-2 rounded-lg border ${
                  compatResult.compatible
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                }`}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{compatResult.explanation}</span>
              </div>
            )}
          </div>
        </form>
      </Panel>

      {/* Taxonomy Explorer */}
      <Panel padding="p-0" className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <span className="font-display text-sm font-semibold">Global Material Taxonomy Explorer</span>
            <p className="text-[11px] text-slate-500 mt-0.5">{filtered.length} of {materials.length} standardized classifications</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Filter code, EU LoW, description..."
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs"
            />
            <div className="flex flex-wrap gap-1">
              {groups.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroupFilter(g)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    groupFilter === g
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="py-2.5 px-4">Code</th>
                <th className="py-2.5 px-4">Material</th>
                <th className="py-2.5 px-4">ISO / RIC</th>
                <th className="py-2.5 px-4">EU LoW</th>
                <th className="py-2.5 px-4">Hazard</th>
                <th className="py-2.5 px-4">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((m) => (
                <tr key={m.code} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 font-mono font-semibold">
                    <Link
                      to={`/materials/${encodeURIComponent(m.code)}`}
                      className="text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                    >
                      {m.code}
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </td>
                  <td className="py-2.5 px-4 font-medium">{m.name}</td>
                  <td className="py-2.5 px-4 font-mono">{m.resin_or_standard_code}</td>
                  <td className="py-2.5 px-4 font-mono">{m.eu_low_code}</td>
                  <td className="py-2.5 px-4">
                    <StatusTag tone={m.hazard_class === 'critical' ? 'rose' : m.hazard_class === 'moderate' ? 'amber' : 'neutral'}>
                      {m.hazard_class}
                    </StatusTag>
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">{m.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};

export const ContaminationAnalysisView: React.FC<{ activeFacility?: Facility }> = ({ activeFacility }) => {
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([]);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'moderate' | 'low'>('all');

  useEffect(() => {
    const q = activeFacility ? `?facilityId=${encodeURIComponent(activeFacility.id)}` : '';
    apiRequest<{ records: Array<Record<string, unknown>> }>(`/contamination${q}`)
      .then((res) => setRecords(res.records))
      .catch(() => {});
  }, [activeFacility?.id]);

  const filtered = useMemo(() => {
    if (severityFilter === 'all') return records;
    if (severityFilter === 'high') return records.filter((r) => r.severity === 'high' || r.severity === 'critical');
    return records.filter((r) => r.severity === severityFilter);
  }, [records, severityFilter]);

  const avgPurity = records.length
    ? (records.reduce((s, r) => s + Number(r.purity_estimate_pct || 0), 0) / records.length).toFixed(1)
    : '—';
  const foodEvents = records.filter((r) => Number(r.food_residue_detected) === 1).length;
  const crossEvents = records.filter((r) => Number(r.cross_material_detected) === 1).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Contamination Analysis</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Tracks visible food residue, oil saturation, cross-material entanglement, and multi-layer packaging purity impact.
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
          {(['all', 'high', 'moderate', 'low'] as const).map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              className={`px-2.5 py-1 rounded-md font-medium capitalize cursor-pointer ${
                severityFilter === sev
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              {sev === 'high' ? 'High / Critical' : sev}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiCard label="Logged Contamination Events" value={records.length} tone="amber" provenance="LIVE" />
        <KpiCard label="Average Estimated Purity" value={`${avgPurity}%`} tone="teal" provenance="LIVE" />
        <KpiCard label="Food / Oil Residue Flags" value={foodEvents} tone="amber" provenance="LIVE" />
        <KpiCard label="Cross-Material Entanglements" value={crossEvents} tone="neutral" provenance="LIVE" />
      </div>

      <Panel padding="p-0" className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Filter className="w-5 h-5" />}
              title="No matching contamination records"
              description="Adjust severity filter or inspect new conveyor frames in Smart Waste Scanner."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="py-3 px-4">Facility / Frame</th>
                  <th className="py-3 px-4">Contamination Type</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4 text-right">Est. Purity</th>
                  <th className="py-3 px-4">Remediation Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((r) => (
                  <tr key={String(r.id)} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">{String(r.image_name)}</div>
                      <div className="text-[11px] text-slate-500">{String(r.facility_name)}</div>
                    </td>
                    <td className="py-3 px-4 font-medium">{String(r.contamination_type)}</td>
                    <td className="py-3 px-4">
                      <StatusTag tone={r.severity === 'high' || r.severity === 'critical' ? 'rose' : 'amber'}>
                        {String(r.severity).toUpperCase()}
                      </StatusTag>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{String(r.purity_estimate_pct)}%</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{String(r.remediation_action)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
};

export const HazardIntelligenceView: React.FC = () => {
  const { pushToast } = useToast();
  const [hazards, setHazards] = useState<Array<Record<string, unknown>>>([]);
  const [disclaimer, setDisclaimer] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmResolveId, setConfirmResolveId] = useState<string | null>(null);

  const load = () => {
    const q = statusFilter ? `?status=${statusFilter}` : '';
    apiRequest<{ disclaimer: string; hazards: Array<Record<string, unknown>> }>(`/hazards${q}`)
      .then((res) => {
        setDisclaimer(res.disclaimer);
        setHazards(res.hazards);
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const updateHazard = async (id: string, status: 'acknowledged' | 'isolated' | 'resolved' | 'escalated') => {
    setError(null);
    try {
      await apiRequest(`/hazards/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      pushToast({ tone: status === 'resolved' ? 'success' : 'info', title: `Hazard marked as ${status}` });
      setConfirmResolveId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update hazard status.');
    }
  };

  const visibleHazards = hazards.filter((h) => !typeFilter || String(h.hazard_type) === typeFilter);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-rose-600" />
            Hazard Intelligence Center
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Lithium-ion battery fire prevention, chemical containers, medical waste, e-waste, and sharps isolation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by hazard type"
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <option value="">All Hazard Classes</option>
            <option value="lithium_battery">Lithium Battery</option>
            <option value="chemical_container">Chemical Container</option>
            <option value="ewaste">E-Waste</option>
            <option value="sharp_object">Sharp Object</option>
            <option value="medical_waste">Medical Waste</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by hazard status"
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="isolated">Isolated</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      <AlertBanner
        tone="warning"
        title="Mandatory Physical Verification Notice"
        message={
          disclaimer ||
          'Visual AI inspection is NOT chemical verification or a guarantee of safety. Always inspect suspected batteries, chemical containers, sharps, and medical items using certified PPE.'
        }
      />

      {error && <AlertBanner tone="critical" message={error} />}

      {visibleHazards.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="w-5 h-5" />}
          title="No hazards match current filter"
          description="Clear status or class filters to view full organization hazard incident history."
        />
      ) : (
        <div className="space-y-4">
          {visibleHazards.map((h) => (
            <Panel key={String(h.id)} className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <StatusTag tone="rose">{String(h.hazard_type).toUpperCase()}</StatusTag>
                    <StatusTag tone={h.severity === 'critical' ? 'rose' : 'amber'}>
                      {String(h.severity).toUpperCase()}
                    </StatusTag>
                    <StatusTag tone={h.status === 'open' ? 'rose' : h.status === 'resolved' ? 'emerald' : 'amber'}>
                      {String(h.status).toUpperCase()}
                    </StatusTag>
                    {Number(h.is_demo_data) === 1 && <StatusTag tone="neutral">DEMO DATA</StatusTag>}
                  </div>
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    <Link
                      to={`/hazards/${encodeURIComponent(String(h.id))}`}
                      className="hover:text-emerald-600 dark:hover:text-emerald-400 inline-flex items-center gap-1.5"
                    >
                      {String(h.title)}
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </Link>
                  </h2>
                  <div className="text-xs text-slate-500 mt-0.5">{String(h.facility_name)}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['acknowledged', 'isolated', 'escalated'] as const).map((st) => (
                    <Button
                      key={st}
                      size="sm"
                      variant="secondary"
                      onClick={() => updateHazard(String(h.id), st)}
                      className="capitalize"
                    >
                      {st}
                    </Button>
                  ))}
                  <Button size="sm" variant="primary" onClick={() => setConfirmResolveId(String(h.id))}>
                    Mark Resolved
                  </Button>
                </div>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{String(h.warning_message)}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-lg border border-slate-100 dark:border-slate-800">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white">Isolation Protocol:</span>{' '}
                  {String(h.isolation_recommendation)}
                </div>
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white">Safe Handling Guidance:</span>{' '}
                  {String(h.safe_handling_guidance)}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmResolveId)}
        onCancel={() => setConfirmResolveId(null)}
        onConfirm={() => confirmResolveId && updateHazard(confirmResolveId, 'resolved')}
        title="Confirm Physical Hazard Clearance"
        description="Confirm that the suspected hazardous object has been physically removed from the line and secured inside certified containment."
        confirmLabel="Confirm & Resolve Alert"
        tone="primary"
      />
    </div>
  );
};
