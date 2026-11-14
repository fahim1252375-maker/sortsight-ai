import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, ArrowRight, Building2, Globe, MapPin, Plus, Search } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { Facility, LanguageCode } from '../types/sortsight.ts';
import {
  AlertBanner,
  Button,
  DataTable,
  EmptyState,
  LoadingSkeleton,
  Modal,
  Panel,
  SectionHeader,
  StatusTag,
  Tabs,
} from '../components/ui/DesignSystem.tsx';
import { useToast } from '../components/ui/ToastProvider.tsx';

interface PolicyRule {
  id: string;
  material_code: string;
  material_name: string;
  accepted: number;
  max_contamination_pct: number;
  target_bin: string;
  condition_notes: string;
}

interface PolicyRecord {
  id: string;
  title: string;
  scope_level: string;
  country_code: string;
  region_name: string;
  policy_origin: string;
  source_attribution: string;
  effective_date: string;
  localizedInstructions: Record<string, string>;
  rules: PolicyRule[];
}

export const GlobalRulesView: React.FC<{ activeFacility?: Facility; language: LanguageCode; mode?: 'global' | 'country' }> = ({
  activeFacility,
  language,
  mode = 'global',
}) => {
  const { pushToast } = useToast();
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [viewMode, setViewMode] = useState<'policies' | 'compare'>('policies');
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [countryCode, setCountryCode] = useState('DE');
  const [regionName, setRegionName] = useState('Bavaria Sample Policy');
  const [sourceAttr, setSourceAttr] = useState('Administrator-created sample policy — verify municipal authority');
  const [compareLeftId, setCompareLeftId] = useState('');
  const [compareRightId, setCompareRightId] = useState('');

  const load = () => {
    setLoading(true);
    setLoadError('');
    const q = countryFilter ? `?country=${encodeURIComponent(countryFilter)}` : '';
    apiRequest<{ policies: PolicyRecord[] }>(`/recycling/policies${q}`)
      .then((res) => {
        setPolicies(res.policies);
        if (res.policies.length >= 2) {
          setCompareLeftId((prev) => prev || res.policies[0].id);
          setCompareRightId((prev) => prev || res.policies[1].id);
        } else if (res.policies.length === 1) {
          setCompareLeftId((prev) => prev || res.policies[0].id);
          setCompareRightId((prev) => prev || res.policies[0].id);
        }
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : 'Unable to load recycling policies.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [countryFilter]);

  const createPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/recycling/policies', {
        method: 'POST',
        body: JSON.stringify({
          facilityId: activeFacility?.id,
          scopeLevel: 'region',
          countryCode,
          regionName,
          title,
          policyOrigin: 'admin_sample_policy',
          sourceAttribution: sourceAttr,
        }),
      });
      pushToast({ tone: 'success', title: 'Sample policy created', description: `${title} (${countryCode}) added to engine.` });
      setTitle('');
      setShowCreate(false);
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Failed to create policy', description: err instanceof Error ? err.message : 'Request rejected' });
    }
  };

  const toggleRuleAcceptance = async (rule: PolicyRule) => {
    try {
      await apiRequest(`/recycling/rules/${rule.id}`, {
        method: 'PUT',
        body: JSON.stringify({ accepted: rule.accepted !== 1 }),
      });
      pushToast({
        tone: 'info',
        title: `Rule updated: ${rule.material_code}`,
        description: rule.accepted === 1 ? 'Marked as Rejected in policy' : 'Marked as Accepted in policy',
      });
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Rule update blocked', description: err instanceof Error ? err.message : 'Insufficient permission' });
    }
  };

  const originTag = (origin: string) => {
    if (origin === 'official_regulatory') return <StatusTag tone="emerald">OFFICIAL REGULATION</StatusTag>;
    if (origin === 'facility_custom') return <StatusTag tone="teal">FACILITY CUSTOM</StatusTag>;
    return <StatusTag tone="amber">DEMO / SAMPLE POLICY</StatusTag>;
  };

  const policiesWithRules = useMemo(() => policies.filter((p) => p.rules.length > 0), [policies]);
  const leftPolicy = policies.find((p) => p.id === compareLeftId) || policiesWithRules[0];
  const rightPolicy = policies.find((p) => p.id === compareRightId) || policiesWithRules[1] || policiesWithRules[0];

  const comparisonRows = useMemo(() => {
    if (!leftPolicy || !rightPolicy) return [];
    const rightMap = new Map(rightPolicy.rules.map((r) => [r.material_code, r]));
    const leftMap = new Map(leftPolicy.rules.map((r) => [r.material_code, r]));
    const codes = Array.from(new Set([...leftMap.keys(), ...rightMap.keys()]));
    return codes.map((code) => {
      const l = leftMap.get(code);
      const r = rightMap.get(code);
      const diverges = l && r ? l.accepted !== r.accepted || l.max_contamination_pct !== r.max_contamination_pct : true;
      return { code, name: l?.material_name || r?.material_name || code, left: l, right: r, diverges };
    });
  }, [leftPolicy, rightPolicy]);

  return (
    <div className="space-y-6">
      {loadError && (
        <AlertBanner
          tone="warning"
          title="Recycling policies could not be loaded"
          message={loadError}
          action={<Button size="sm" variant="secondary" onClick={load}>Retry</Button>}
        />
      )}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Globe className="h-6 w-6 text-emerald-600" />
            {mode === 'country' ? 'Country &amp; Regional Recycling Rules' : 'Global Recycling Rules Engine'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {mode === 'country'
              ? 'Review country and regional acceptance profiles, compare local guidance, and verify policy source attribution before operational use.'
              : 'Manage global, regional, and facility material acceptance policies with source attribution, effective dates, and side-by-side comparison.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Tabs
            items={[
              { id: 'policies' as const, label: 'Policy Rulesets', count: policies.length },
              { id: 'compare' as const, label: 'Compare Policies' },
            ]}
            activeId={viewMode}
            onChange={setViewMode}
          />
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
          >
            <option value="">All Countries</option>
            <option value="SE">Sweden (SE)</option>
            <option value="US">United States (US)</option>
            <option value="DE">Germany (DE)</option>
          </select>
          <Button variant="primary" size="sm" onClick={() => setShowCreate((s) => !s)}>
            <Plus className="h-3.5 w-3.5" /> New Sample Policy
          </Button>
        </div>
      </div>

      <AlertBanner
        tone="warning"
        title="Policy Source Attribution Notice"
        message="Demonstration and facility-custom profiles are explicitly labeled DEMO / SAMPLE POLICY or FACILITY CUSTOM. Always verify official municipal or EPR authority rules before compliance sign-off."
      />

      {showCreate && (
        <Panel>
          <form onSubmit={createPolicy} className="space-y-4 text-xs">
            <SectionHeader title="Create Regional / Facility Sample Policy" subtitle="New policies default to admin_sample_policy origin until verified against an official statute." />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <input
                type="text"
                required
                placeholder="Policy Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
              />
              <input
                type="text"
                required
                maxLength={2}
                placeholder="Country Code (e.g. DE)"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono"
              />
              <input
                type="text"
                required
                placeholder="Region Name"
                value={regionName}
                onChange={(e) => setRegionName(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
              />
            </div>
            <input
              type="text"
              required
              placeholder="Source Attribution & Verification Note"
              value={sourceAttr}
              onChange={(e) => setSourceAttr(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" variant="primary" size="sm">Save Sample Policy</Button>
            </div>
          </form>
        </Panel>
      )}

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : viewMode === 'compare' ? (
        <Panel>
          <SectionHeader
            title="Side-by-Side Policy Comparison"
            subtitle="Compare acceptance thresholds, contamination tolerances, and target sorting chutes between two regional or facility rulesets."
            badge={<StatusTag tone="teal"><ArrowLeftRight className="w-3 h-3" /> {comparisonRows.filter((r) => r.diverges).length} differences</StatusTag>}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5 text-xs">
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Baseline Policy (A)</label>
              <select
                value={leftPolicy?.id || ''}
                onChange={(e) => setCompareLeftId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
              >
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.country_code}] {p.title} ({p.rules.length} rules)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Comparison Policy (B)</label>
              <select
                value={rightPolicy?.id || ''}
                onChange={(e) => setCompareRightId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
              >
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.country_code}] {p.title} ({p.rules.length} rules)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {comparisonRows.length === 0 ? (
            <EmptyState title="No rules available to compare" description="Select two policies that contain material acceptance rule tables." />
          ) : (
            <DataTable
              rows={comparisonRows}
              rowKey={(r) => r.code}
              pageSize={12}
              columns={[
                {
                  key: 'material',
                  header: 'Material Class',
                  sortValue: (r) => r.name,
                  render: (r) => (
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{r.name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{r.code}</div>
                    </div>
                  ),
                },
                {
                  key: 'left',
                  header: leftPolicy ? `${leftPolicy.country_code} · Policy A` : 'Policy A',
                  render: (r) =>
                    r.left ? (
                      <div className="space-y-1">
                        <StatusTag tone={r.left.accepted === 1 ? 'emerald' : 'rose'}>
                          {r.left.accepted === 1 ? 'ACCEPTED' : 'REJECTED'} · max {r.left.max_contamination_pct}%
                        </StatusTag>
                        <div className="font-mono text-[11px] text-slate-500">{r.left.target_bin}</div>
                      </div>
                    ) : (
                      <span className="text-slate-400">No rule</span>
                    ),
                },
                {
                  key: 'right',
                  header: rightPolicy ? `${rightPolicy.country_code} · Policy B` : 'Policy B',
                  render: (r) =>
                    r.right ? (
                      <div className="space-y-1">
                        <StatusTag tone={r.right.accepted === 1 ? 'emerald' : 'rose'}>
                          {r.right.accepted === 1 ? 'ACCEPTED' : 'REJECTED'} · max {r.right.max_contamination_pct}%
                        </StatusTag>
                        <div className="font-mono text-[11px] text-slate-500">{r.right.target_bin}</div>
                      </div>
                    ) : (
                      <span className="text-slate-400">No rule</span>
                    ),
                },
                {
                  key: 'delta',
                  header: 'Alignment',
                  render: (r) =>
                    r.diverges ? <StatusTag tone="amber">DIVERGES</StatusTag> : <StatusTag tone="neutral">ALIGNED</StatusTag>,
                },
              ]}
            />
          )}
        </Panel>
      ) : policies.length === 0 ? (
        <EmptyState title="No policies match this filter" description="Clear the country filter or add a new sample policy." />
      ) : (
        <div className="space-y-6">
          {policies.map((pol) => (
            <Panel key={pol.id} padding="p-0" className="overflow-hidden">
              <div className="p-5 border-b border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {originTag(pol.policy_origin)}
                      <StatusTag tone="neutral">{pol.scope_level.toUpperCase()} · {pol.country_code}</StatusTag>
                      <span className="font-mono text-[11px] text-slate-500">Effective: {pol.effective_date}</span>
                    </div>
                    <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">{pol.title}</h2>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Source Attribution:</span> {pol.source_attribution}
                </p>
                {(pol.localizedInstructions[language] || pol.localizedInstructions.en) && (
                  <div className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 text-xs text-slate-700 dark:text-slate-300">
                    <span className="font-semibold">Localized Instructions ({language.toUpperCase()}):</span>{' '}
                    {pol.localizedInstructions[language] || pol.localizedInstructions.en}
                  </div>
                )}
              </div>

              {pol.rules.length > 0 && (
                <div className="p-5">
                  <DataTable
                    rows={pol.rules}
                    rowKey={(r) => r.id}
                    pageSize={8}
                    columns={[
                      {
                        key: 'material',
                        header: 'Material',
                        sortValue: (r) => r.material_name,
                        render: (r) => (
                          <div>
                            <div className="font-medium text-slate-900 dark:text-slate-100">{r.material_name}</div>
                            <div className="font-mono text-[11px] text-slate-500">{r.material_code}</div>
                          </div>
                        ),
                      },
                      {
                        key: 'accepted',
                        header: 'Acceptance',
                        sortValue: (r) => r.accepted,
                        render: (r) => (
                          <button type="button" onClick={() => toggleRuleAcceptance(r)} className="cursor-pointer" title="Click to toggle acceptance">
                            <StatusTag tone={r.accepted === 1 ? 'emerald' : 'rose'}>
                              {r.accepted === 1 ? 'ACCEPTED (Toggle)' : 'REJECTED (Toggle)'}
                            </StatusTag>
                          </button>
                        ),
                      },
                      {
                        key: 'contam',
                        header: 'Max Contam',
                        align: 'right',
                        sortValue: (r) => r.max_contamination_pct,
                        render: (r) => <span className="font-mono text-xs">{r.max_contamination_pct}%</span>,
                      },
                      {
                        key: 'bin',
                        header: 'Target Bin / Chute',
                        sortValue: (r) => r.target_bin,
                        render: (r) => <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{r.target_bin}</span>,
                      },
                      {
                        key: 'notes',
                        header: 'Condition Notes',
                        render: (r) => <span className="text-xs text-slate-600 dark:text-slate-400">{r.condition_notes}</span>,
                      },
                    ]}
                  />
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
};

export const FacilityDirectoryView: React.FC = () => {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [selected, setSelected] = useState<Facility | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (country) params.set('country', country);
    apiRequest<{ facilities: Facility[] }>(`/facilities/directory?${params.toString()}`)
      .then((r) => setFacilities(r.facilities))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q, country]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="h-6 w-6 text-emerald-600" />
            Recycling Facility Directory
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Registered MRF, optical polymer sorting, and regional material recovery facilities on the SortSight AI network.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search facility or city..."
              className="pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <option value="">All Countries</option>
            <option value="SE">Sweden</option>
            <option value="NL">Netherlands</option>
            <option value="US">United States</option>
            <option value="JP">Japan</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : facilities.length === 0 ? (
        <EmptyState title="No matching facilities" description="Adjust your search query or country filter to browse registered facilities." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {facilities.map((f) => (
            <Panel key={f.id} className="hover:border-emerald-400 dark:hover:border-emerald-700 transition-colors">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-mono text-xs text-slate-500">{f.facility_code}</span>
                <div className="flex items-center gap-1.5">
                  <StatusTag tone="neutral">{f.country_code}</StatusTag>
                  <StatusTag tone={f.status === 'active' ? 'emerald' : 'amber'}>{f.status.toUpperCase()}</StatusTag>
                </div>
              </div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">{f.name}</h2>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {f.organization_name} · {f.city}, {f.region}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                <span className="font-mono text-slate-600 dark:text-slate-400">
                  {f.facility_type} · <strong className="tabular-nums text-slate-900 dark:text-white">{f.capacity_tons_per_day} t/day</strong>
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setSelected(f)}>
                    Quick Specs
                  </Button>
                  <Link
                    to={`/facilities/${f.id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium whitespace-nowrap"
                  >
                    Full Page <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name || 'Facility Profile'}
        subtitle={selected ? `${selected.facility_code} · ${selected.city}, ${selected.country_code}` : ''}
      >
        {selected && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <div className="text-slate-500">Organization</div>
                <div className="font-semibold text-slate-900 dark:text-white mt-0.5">{selected.organization_name}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <div className="text-slate-500">Facility Type</div>
                <div className="font-semibold text-slate-900 dark:text-white mt-0.5">{selected.facility_type}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <div className="text-slate-500">Rated Throughput</div>
                <div className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">{selected.capacity_tons_per_day} tons / day</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <div className="text-slate-500">Region &amp; Status</div>
                <div className="font-semibold text-slate-900 dark:text-white mt-0.5">{selected.region} · {selected.status}</div>
              </div>
            </div>
            <AlertBanner
              tone="info"
              message="Seeded facilities marked DEMO belong to the sandbox demonstration network. Tenant-created facilities remain isolated to your active organization."
            />
            <div className="flex justify-end pt-1">
              <Link
                to={`/facilities/${selected.id}`}
                onClick={() => setSelected(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
              >
                Open Facility Detail Page <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
