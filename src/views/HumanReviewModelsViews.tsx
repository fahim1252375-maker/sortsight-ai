import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Cpu, Database, GitMerge, Layers, Plus } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import {
  AlertBanner,
  Button,
  ConfirmDialog,
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

const MATERIAL_OPTIONS = [
  'PET_01', 'HDPE_02', 'PVC_03', 'LDPE_04', 'PP_05', 'PS_06',
  'ALUM_CAN', 'STEEL_FE', 'GLASS_CLR', 'GLASS_COL', 'OCC_CARD',
  'PAPER_MIX', 'TEXTILE', 'ORGANIC', 'COMP_MLP', 'EWASTE_PCB',
  'BATT_LI', 'HAZ_CHEM', 'UNKNOWN_OOD',
];

export const HumanReviewView: React.FC = () => {
  const { pushToast } = useToast();
  const [reviews, setReviews] = useState<Array<Record<string, unknown>>>([]);
  const [errors, setErrors] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [correctionMap, setCorrectionMap] = useState<Record<string, string>>({});
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});

  const load = () => {
    setLoading(true);
    const q = statusFilter ? `?status=${statusFilter}` : '';
    Promise.all([
      apiRequest<{ reviews: Array<Record<string, unknown>> }>(`/reviews${q}`).then((r) => setReviews(r.reviews)),
      apiRequest<{ errorPairs: Array<Record<string, unknown>> }>('/reviews/errors').then((r) => setErrors(r.errorPairs)),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const resolveReview = async (id: string, decision: 'verified_correct' | 'corrected' | 'escalated_expert', origCode: string) => {
    try {
      await apiRequest(`/reviews/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          correctedMaterialCode: correctionMap[id] || origCode,
          reviewerNotes: notesMap[id] || '',
        }),
      });
      pushToast({ tone: 'success', title: `Review ${decision.replace('_', ' ')}`, description: `Item ${id} updated with full audit log.` });
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Review action blocked', description: err instanceof Error ? err.message : 'Request failed' });
    }
  };

  const promoteToDataset = async (id: string) => {
    try {
      await apiRequest(`/reviews/${id}/promote-dataset`, { method: 'POST', body: JSON.stringify({}) });
      pushToast({ tone: 'success', title: 'Promoted to Active-Learning Dataset', description: `Sample ${id} added as verified ground-truth.` });
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Promotion failed', description: err instanceof Error ? err.message : 'Permission required' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            Human-in-the-Loop QA Review Queue
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Verify low-confidence detections (&lt;0.65) and Unknown OOD items, record expert corrections, and feed curated active-learning datasets.
          </p>
        </div>
        <Tabs
          items={[
            { id: 'pending', label: 'Pending' },
            { id: 'verified_correct', label: 'Verified' },
            { id: 'corrected', label: 'Corrected' },
            { id: 'escalated_expert', label: 'Escalated' },
            { id: '', label: 'All' },
          ]}
          activeId={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Queue Items Shown"
          value={reviews.length}
          subtext={statusFilter ? `Filtered: ${statusFilter}` : 'All historical reviews'}
          tone={statusFilter === 'pending' && reviews.length > 0 ? 'amber' : 'emerald'}
          provenance="LIVE"
        />
        <KpiCard
          label="Tracked Misclassification Pairs"
          value={errors.length}
          subtext="Original vs human-corrected classes"
          tone="teal"
          provenance="VERIFIED"
        />
        <KpiCard
          label="Verification SLA Gate"
          value="0.65 Conf"
          subtext="Auto-queues below threshold or OOD"
          tone="neutral"
        />
      </div>

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : reviews.length === 0 ? (
        <EmptyState
          title="No items matching this review status"
          description="All low-confidence and OOD objects for this filter have been triaged."
        />
      ) : (
        <div className="space-y-4">
          {reviews.map((rev) => {
            const id = String(rev.id);
            const origCode = String(rev.original_material_code);
            const confPct = Math.round(Number(rev.original_confidence) * 100);
            const statusStr = String(rev.review_status);
            return (
              <Panel key={id} className="space-y-3 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <StatusTag tone={statusStr === 'pending' ? 'amber' : statusStr === 'escalated_expert' ? 'rose' : 'emerald'}>
                        {statusStr.toUpperCase()}
                      </StatusTag>
                      <span className="font-mono text-slate-500">{String(rev.trigger_reason)}</span>
                    </div>
                    <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      {String(rev.image_name)} · Predicted: <span className="font-mono">{origCode}</span> ({confPct}%)
                    </h2>
                    <div className="text-slate-500 mt-0.5">{String(rev.facility_name)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/reviews/${id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-emerald-500 whitespace-nowrap"
                    >
                      Inspect <ArrowRight className="w-3 h-3" />
                    </Link>
                    <Button size="sm" variant="primary" onClick={() => resolveReview(id, 'verified_correct', origCode)}>
                      Verify Correct
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => resolveReview(id, 'corrected', origCode)}>
                      Save Correction
                    </Button>
                    <Button size="sm" variant="warning" onClick={() => resolveReview(id, 'escalated_expert', origCode)}>
                      Escalate Expert
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => promoteToDataset(id)}>
                      Promote to Dataset
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <label className="block text-slate-500 mb-1">Corrected Material Class</label>
                    <select
                      value={correctionMap[id] ?? String(rev.corrected_material_code || origCode)}
                      onChange={(e) => setCorrectionMap((m) => ({ ...m, [id]: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 font-mono"
                    >
                      {MATERIAL_OPTIONS.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">Reviewer Notes / Feedback</label>
                    <input
                      type="text"
                      value={notesMap[id] ?? String(rev.reviewer_notes || '')}
                      onChange={(e) => setNotesMap((m) => ({ ...m, [id]: e.target.value }))}
                      placeholder="Record visual verification notes..."
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5"
                    />
                  </div>
                </div>
                {rev.reviewer_name ? (
                  <div className="text-[11px] font-mono text-slate-500">
                    Reviewed by {String(rev.reviewer_name)} at {String(rev.reviewed_at || 'N/A')}
                  </div>
                ) : null}
              </Panel>
            );
          })}
        </div>
      )}

      <Panel>
        <SectionHeader
          title="Model Error Tracking"
          subtitle="Aggregated confusion pairs between initial AI classification and human reviewer corrections"
        />
        <DataTable
          rows={errors}
          rowKey={(er) => `${String(er.original_material_code)}_${String(er.corrected_material_code)}`}
          pageSize={8}
          emptyTitle="No misclassification pairs recorded yet"
          emptyDescription="Once reviewers correct classifications, recurring error patterns appear here."
          columns={[
            {
              key: 'orig',
              header: 'Predicted Class',
              render: (er) => <span className="font-mono text-xs">{String(er.original_material_code)}</span>,
            },
            {
              key: 'corr',
              header: 'Corrected Class',
              render: (er) => <StatusTag tone="emerald">{String(er.corrected_material_code)}</StatusTag>,
            },
            {
              key: 'count',
              header: 'Occurrences',
              align: 'right',
              sortValue: (er) => Number(er.occurrence_count || 0),
              render: (er) => <span className="font-mono">{String(er.occurrence_count)}</span>,
            },
            {
              key: 'conf',
              header: 'Avg Orig Confidence',
              align: 'right',
              sortValue: (er) => Number(er.avg_original_confidence || 0),
              render: (er) => <span className="font-mono">{String(er.avg_original_confidence)}</span>,
            },
          ]}
        />
      </Panel>
    </div>
  );
};

export const AnnotationWorkspaceView: React.FC = () => {
  const { pushToast } = useToast();
  const [annotations, setAnnotations] = useState<Array<Record<string, unknown>>>([]);
  const [datasets, setDatasets] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [datasetId, setDatasetId] = useState('');
  const [imageLabel, setImageLabel] = useState('');
  const [materialCode, setMaterialCode] = useState('PET_01');
  const [bboxStr, setBboxStr] = useState('120,140,480,460');

  const load = () => {
    setLoading(true);
    Promise.all([
      apiRequest<{ annotations: Array<Record<string, unknown>> }>('/annotations').then((r) => setAnnotations(r.annotations)),
      apiRequest<{ datasets: Array<Record<string, unknown>> }>('/datasets').then((r) => {
        setDatasets(r.datasets);
        if (r.datasets[0] && !datasetId) setDatasetId(String(r.datasets[0].id));
      }),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const createAnnotation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parts = bboxStr.split(',').map((n) => Number(n.trim()));
      await apiRequest('/annotations', {
        method: 'POST',
        body: JSON.stringify({
          datasetId,
          imageLabel,
          materialCode,
          bbox: parts.length === 4 ? parts : [100, 100, 400, 400],
        }),
      });
      pushToast({ tone: 'success', title: 'Verified annotation saved', description: `${imageLabel} -> ${materialCode}` });
      setImageLabel('');
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Failed to save annotation', description: err instanceof Error ? err.message : 'Request failed' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Layers className="h-6 w-6 text-emerald-600" />
          Annotation Workspace
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Curate verified bounding-box ground-truth labels ([ymin, xmin, ymax, xmax] normalized 0–1000) for active learning and dataset versioning.
        </p>
      </div>

      <Panel>
        <form onSubmit={createAnnotation} className="space-y-4 text-xs">
          <SectionHeader title="Log New Bounding-Box Ground Truth" />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2">
              {datasets.map((d) => (
                <option key={String(d.id)} value={String(d.id)}>
                  {String(d.name)} ({String(d.version_tag)})
                </option>
              ))}
            </select>
            <input
              type="text"
              required
              placeholder="Frame / Image Identifier"
              value={imageLabel}
              onChange={(e) => setImageLabel(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
            />
            <select value={materialCode} onChange={(e) => setMaterialCode(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono">
              {MATERIAL_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="text"
              value={bboxStr}
              onChange={(e) => setBboxStr(e.target.value)}
              placeholder="ymin,xmin,ymax,xmax"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono"
            />
          </div>
          <Button type="submit" variant="primary" size="sm">
            <Plus className="h-3.5 w-3.5" /> Save Verified Annotation
          </Button>
        </form>
      </Panel>

      <Panel>
        <SectionHeader title="Curated Annotations Ledger" badge={<StatusTag tone="emerald">{annotations.length} labels</StatusTag>} />
        {loading ? (
          <LoadingSkeleton rows={4} />
        ) : (
          <DataTable
            rows={annotations}
            rowKey={(a) => String(a.id)}
            pageSize={10}
            columns={[
              {
                key: 'dataset',
                header: 'Dataset',
                render: (a) => <span className="text-xs font-medium">{String(a.dataset_name)}</span>,
              },
              {
                key: 'image',
                header: 'Image Label',
                render: (a) => <span className="text-xs font-mono">{String(a.image_label)}</span>,
              },
              {
                key: 'material',
                header: 'Material Class',
                render: (a) => <StatusTag tone="teal">{String(a.material_code)}</StatusTag>,
              },
              {
                key: 'bbox',
                header: 'BBox [ymin,xmin,ymax,xmax]',
                render: (a) => <span className="font-mono text-xs text-slate-500">{String(a.bbox_json)}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                render: (a) => <StatusTag tone="emerald">{String(a.verification_status).toUpperCase()}</StatusTag>,
              },
            ]}
          />
        )}
      </Panel>
    </div>
  );
};

export const ModelsDatasetsView: React.FC<{ mode: 'models' | 'datasets' }> = ({ mode }) => {
  const { pushToast } = useToast();
  const [models, setModels] = useState<Array<Record<string, unknown>>>([]);
  const [datasets, setDatasets] = useState<Array<Record<string, unknown>>>([]);
  const [drift, setDrift] = useState<Record<string, unknown> | null>(null);
  const [telemetry, setTelemetry] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [jobVersionTag, setJobVersionTag] = useState('v1.3-domain-adapted');
  const [jobMode, setJobMode] = useState<'transfer_learning' | 'domain_adaptation' | 'fine_tuned'>('transfer_learning');
  const [dsName, setDsName] = useState('');
  const [dsTag, setDsTag] = useState('v1.0');
  const [dsLicense, setDsLicense] = useState('CC-BY-4.0');
  const [pendingApproveId, setPendingApproveId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiRequest<{ models: Array<Record<string, unknown>> }>('/models').then((r) => setModels(r.models)),
      apiRequest<{ datasets: Array<Record<string, unknown>> }>('/datasets').then((r) => setDatasets(r.datasets)),
      apiRequest<Record<string, unknown>>('/models/drift').then(setDrift),
      apiRequest<{ telemetry: Array<Record<string, unknown>> }>('/models/telemetry').then((r) => setTelemetry(r.telemetry)),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const registerTrainingJob = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const targetModelId = String(models[1]?.id || models[0]?.id || 'mdl_edge_heuristic');
      await apiRequest('/models/training-jobs', {
        method: 'POST',
        body: JSON.stringify({ modelId: targetModelId, versionTag: jobVersionTag, trainingMode: jobMode }),
      });
      pushToast({ tone: 'success', title: 'Candidate staging version registered', description: `${jobVersionTag} (${jobMode})` });
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Registration failed', description: err instanceof Error ? err.message : 'Admin role required' });
    }
  };

  const confirmApproveVersion = async () => {
    if (!pendingApproveId) return;
    try {
      await apiRequest(`/models/versions/${pendingApproveId}/approve`, { method: 'POST', body: JSON.stringify({}) });
      pushToast({ tone: 'success', title: 'Model version promoted to Production' });
      setPendingApproveId(null);
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Approval failed', description: err instanceof Error ? err.message : 'Admin permission required' });
      setPendingApproveId(null);
    }
  };

  const createDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/datasets', {
        method: 'POST',
        body: JSON.stringify({ name: dsName, versionTag: dsTag, license: dsLicense }),
      });
      pushToast({ tone: 'success', title: 'Dataset version created', description: `${dsName} (${dsTag})` });
      setDsName('');
      load();
    } catch (err) {
      pushToast({ tone: 'critical', title: 'Dataset creation failed', description: err instanceof Error ? err.message : 'Request failed' });
    }
  };

  if (mode === 'datasets') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Database className="h-6 w-6 text-emerald-600" />
            Dataset Management &amp; Provenance
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Tracks public dataset licenses, scene-grouped stratified splits (zero leakage), class imbalance, and operational limitations.
          </p>
        </div>

        <Panel>
          <form onSubmit={createDataset} className="flex flex-wrap gap-3 text-xs items-center">
            <input type="text" required placeholder="Dataset Name" value={dsName} onChange={(e) => setDsName(e.target.value)} className="flex-1 min-w-[200px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
            <input type="text" required placeholder="Version Tag" value={dsTag} onChange={(e) => setDsTag(e.target.value)} className="w-32 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono" />
            <input type="text" required placeholder="License" value={dsLicense} onChange={(e) => setDsLicense(e.target.value)} className="w-40 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
            <Button type="submit" variant="primary" size="sm">Create Dataset Version</Button>
          </form>
        </Panel>

        {loading ? (
          <LoadingSkeleton rows={3} />
        ) : datasets.length === 0 ? (
          <EmptyState title="No datasets registered" description="Create a dataset version above to track training splits and licenses." />
        ) : (
          <div className="space-y-4">
            {datasets.map((ds) => (
              <Panel key={String(ds.id)} className="space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">{String(ds.name)}</h2>
                    <StatusTag tone="emerald">{String(ds.version_tag)}</StatusTag>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusTag tone="neutral">{String(ds.sample_count)} samples</StatusTag>
                    <StatusTag tone="teal">{String(ds.license)}</StatusTag>
                  </div>
                </div>
                <div className="text-slate-600 dark:text-slate-400">
                  Split Strategy: <span className="font-mono">{String(ds.split_strategy)}</span> · Provenance: <span className="font-mono">{String(ds.provenance_url)}</span>
                </div>
                <div className="text-slate-500">Limitations: {String(ds.limitations_notes)}</div>
              </Panel>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Cpu className="h-6 w-6 text-emerald-600" />
          AI Model Management, Calibration &amp; Drift
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Version governance, human approval gates, inference latency telemetry, and drift monitoring. External GPU training executes via documented <code className="font-mono">ml/</code> pipeline.
        </p>
      </div>

      <AlertBanner
        tone="info"
        title="Transparent Evaluation & Hardware Boundary"
        message="Live zero-shot Gemini precision is computed exclusively from verified Human Review outcomes (never fabricated offline metrics). Local edge heuristic benchmarks reflect synthetic test-bench validation."
      />

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              label="Observed Objects (Drift Base)"
              value={String(drift?.sampleSize || 0)}
              subtext="Organization detection objects"
              icon={<Database className="w-4 h-4" />}
              tone="teal"
              provenance="LIVE"
            />
            <KpiCard
              label="Low-Confidence / OOD Share"
              value={`${((Number(drift?.lowConfidenceRate || 0)) * 100).toFixed(1)}%`}
              subtext="Threshold < 0.65 confidence"
              icon={<AlertTriangle className="w-4 h-4" />}
              tone={drift?.driftAlertLevel === 'elevated' ? 'amber' : 'emerald'}
              provenance="LIVE"
            />
            <KpiCard
              label="Active Inference Providers"
              value={telemetry.length}
              subtext={telemetry.map((t) => `${String(t.inference_provider)}: ${String(t.avg_latency_ms)}ms`).join(' · ') || 'No telemetry yet'}
              icon={<Cpu className="w-4 h-4" />}
              tone="neutral"
              provenance="LIVE"
            />
          </div>

          <Panel>
            <form onSubmit={registerTrainingJob} className="flex flex-wrap items-center gap-3 text-xs">
              <GitMerge className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="font-semibold text-slate-900 dark:text-slate-100">Register Candidate Pipeline Version:</span>
              <input type="text" value={jobVersionTag} onChange={(e) => setJobVersionTag(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 font-mono" />
              <select value={jobMode} onChange={(e) => setJobMode(e.target.value as typeof jobMode)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5">
                <option value="transfer_learning">Transfer Learning</option>
                <option value="domain_adaptation">Domain Adaptation</option>
                <option value="fine_tuned">Fine-Tuned Active Learning</option>
              </select>
              <Button type="submit" variant="primary" size="sm">
                Register Staging Version
              </Button>
            </form>
          </Panel>

          <div className="space-y-4">
            {models.map((mdl) => {
              const versions = (mdl.versions as Array<Record<string, unknown>>) || [];
              return (
                <Panel key={String(mdl.id)} padding="p-0" className="overflow-hidden">
                  <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Link
                        to={`/models/${String(mdl.id)}`}
                        className="font-display text-sm font-bold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 inline-flex items-center gap-1.5"
                      >
                        <span>{String(mdl.name)}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                      <div className="text-xs text-slate-500 font-mono">{String(mdl.architecture)} · License: {String(mdl.license)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusTag tone="teal">{String(mdl.provider_type)}</StatusTag>
                      <Link
                        to={`/models/${String(mdl.id)}`}
                        className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap"
                      >
                        View Registry
                      </Link>
                    </div>
                  </div>
                  <div className="p-4">
                    <DataTable
                      rows={versions}
                      rowKey={(v) => String(v.id)}
                      pageSize={6}
                      emptyTitle="Adapter specification only"
                      emptyDescription="This reference architecture adapter requires external trained weights to register active versions."
                      columns={[
                        {
                          key: 'ver',
                          header: 'Version',
                          render: (v) => <span className="font-mono font-semibold">{String(v.version_tag)}</span>,
                        },
                        {
                          key: 'mode',
                          header: 'Mode',
                          render: (v) => <span className="font-mono text-xs">{String(v.training_mode)}</span>,
                        },
                        {
                          key: 'status',
                          header: 'Status',
                          render: (v) => (
                            <StatusTag tone={v.status === 'production' ? 'emerald' : v.status === 'staging' ? 'amber' : 'neutral'}>
                              {String(v.status).toUpperCase()}
                            </StatusTag>
                          ),
                        },
                        {
                          key: 'metrics',
                          header: 'P / R / F1',
                          align: 'right',
                          render: (v) => (
                            <span className="font-mono text-xs">
                              {v.precision_score != null ? `${v.precision_score} / ${v.recall_score} / ${v.f1_score}` : 'Live QA Tracked'}
                            </span>
                          ),
                        },
                        {
                          key: 'ece',
                          header: 'ECE',
                          align: 'right',
                          render: (v) => <span className="font-mono text-xs">{v.calibration_ece != null ? String(v.calibration_ece) : '—'}</span>,
                        },
                        {
                          key: 'notes',
                          header: 'Notes',
                          render: (v) => <span className="text-xs text-slate-600 dark:text-slate-400 max-w-xs block truncate">{String(v.notes)}</span>,
                        },
                        {
                          key: 'gate',
                          header: 'Approval Gate',
                          align: 'right',
                          render: (v) =>
                            v.status !== 'production' ? (
                              <Button size="sm" variant="secondary" onClick={() => setPendingApproveId(String(v.id))}>
                                <Check className="h-3 w-3 text-emerald-600" /> Promote
                              </Button>
                            ) : (
                              <StatusTag tone="emerald">ACTIVE PROD</StatusTag>
                            ),
                        },
                      ]}
                    />
                  </div>
                </Panel>
              );
            })}
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingApproveId)}
        onCancel={() => setPendingApproveId(null)}
        onConfirm={confirmApproveVersion}
        title="Promote Model Version to Production"
        description="Promoting this candidate version will archive the currently active production version for this model family and record an immutable audit entry."
        confirmLabel="Approve & Promote"
        tone="primary"
      />
    </div>
  );
};
