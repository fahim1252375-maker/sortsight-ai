import crypto from 'crypto';
import { Router } from 'express';
import { getDb } from '../db/database.ts';
import { authenticate, recordAuditLog } from '../middleware/auth.ts';
import { queryOperatorAssistant } from '../services/assistantService.ts';

export const analyticsRouter = Router();

analyticsRouter.get('/analytics/overview', authenticate, (req, res) => {
  const db = getDb();
  const orgId = req.auth!.organizationId;
  const facilityId = String(req.query.facilityId || '').trim();
  const timeRange = String(req.query.timeRange || '30d').trim();
  let startDate = String(req.query.startDate || '').trim();
  let endDate = String(req.query.endDate || '').trim();

  // Compute snapshot window filter cleanly from timeRange when custom dates aren't supplied
  if (!startDate && timeRange !== 'custom') {
    const latestSnapRow = db
      .prepare('SELECT MAX(snapshot_date) as maxDate FROM analytics_snapshots WHERE organization_id = ?')
      .get(orgId) as { maxDate: string | null } | undefined;
    const anchorDate = latestSnapRow?.maxDate ? new Date(`${latestSnapRow.maxDate}T00:00:00Z`) : new Date();
    const daysMap: Record<string, number> = { today: 0, '7d': 7, '30d': 30, '90d': 90 };
    const offsetDays = daysMap[timeRange] ?? 30;
    const fromDt = new Date(anchorDate.getTime() - offsetDays * 86400000);
    startDate = fromDt.toISOString().slice(0, 10);
    if (!endDate && latestSnapRow?.maxDate) {
      endDate = latestSnapRow.maxDate;
    }
  }

  // Measured live/recorded detection stats
  let detSql = `
    SELECT COUNT(*) as totalScans,
           ROUND(AVG(overall_readiness_score), 1) as avgReadiness,
           ROUND(AVG(overall_recovery_score), 1) as avgRecovery,
           ROUND(AVG(inference_latency_ms), 0) as avgLatencyMs,
           SUM(CASE WHEN is_demo_data = 0 THEN 1 ELSE 0 END) as liveScanCount,
           SUM(CASE WHEN has_hazards = 1 THEN 1 ELSE 0 END) as hazardScanCount,
           SUM(CASE WHEN needs_human_review = 1 THEN 1 ELSE 0 END) as reviewFlaggedScanCount
    FROM detection_records WHERE organization_id = ?
  `;
  const detParams: unknown[] = [orgId];
  if (facilityId) {
    detSql += ' AND facility_id = ?';
    detParams.push(facilityId);
  }
  const detectionMetrics = db.prepare(detSql).get(...detParams) as Record<string, unknown>;

  // Waste Composition from detection_objects
  let compSql = `
    SELECT o.material_code, COALESCE(m.name, o.material_code) as material_name, COALESCE(m.parent_group, 'Other') as parent_group, COUNT(*) as item_count,
           ROUND(AVG(o.calibrated_confidence) * 100, 1) as avg_confidence_pct,
           ROUND(AVG(o.recovery_score), 1) as avg_recovery_score
    FROM detection_objects o
    JOIN detection_records r ON r.id = o.detection_record_id
    LEFT JOIN material_categories m ON m.code = o.material_code
    WHERE o.organization_id = ?
  `;
  const compParams: unknown[] = [orgId];
  if (facilityId) {
    compSql += ' AND r.facility_id = ?';
    compParams.push(facilityId);
  }
  compSql += ' GROUP BY o.material_code ORDER BY item_count DESC';
  const composition = db.prepare(compSql).all(...compParams);

  // Contamination breakdown
  let contSql = `
    SELECT contamination_type, severity, COUNT(*) as event_count, ROUND(AVG(purity_estimate_pct), 1) as avg_purity_pct
    FROM contamination_records
    WHERE organization_id = ?
  `;
  const contParams: unknown[] = [orgId];
  if (facilityId) {
    contSql += ' AND facility_id = ?';
    contParams.push(facilityId);
  }
  contSql += ' GROUP BY contamination_type, severity';
  const contaminationBreakdown = db.prepare(contSql).all(...contParams);

  // Historical trends (clearly tagged is_demo_data)
  let snapSql = `
    SELECT s.*, f.name as facility_name
    FROM analytics_snapshots s
    JOIN facilities f ON f.id = s.facility_id
    WHERE s.organization_id = ?
  `;
  const snapParams: unknown[] = [orgId];
  if (facilityId) {
    snapSql += ' AND s.facility_id = ?';
    snapParams.push(facilityId);
  }
  if (startDate) {
    snapSql += ' AND s.snapshot_date >= ?';
    snapParams.push(startDate);
  }
  if (endDate) {
    snapSql += ' AND s.snapshot_date <= ?';
    snapParams.push(endDate);
  }
  snapSql += ' ORDER BY s.snapshot_date ASC';
  const snapshots = db.prepare(snapSql).all(...snapParams);

  // Batch volume totals
  let batchSql = 'SELECT SUM(intake_weight_kg) as intakeKg, SUM(recovered_weight_kg) as recoveredKg, SUM(contaminated_weight_kg) as contaminatedKg, COUNT(*) as batchCount FROM processing_batches WHERE organization_id = ?';
  const batchParams: unknown[] = [orgId];
  if (facilityId) {
    batchSql += ' AND facility_id = ?';
    batchParams.push(facilityId);
  }
  const volumeTotals = db.prepare(batchSql).get(...batchParams);

  // Operational real-time counters (Hazards, Human Reviews, Verified Accuracy, Conveyor Sessions)
  const facFilter = facilityId ? ' AND facility_id = ?' : '';
  const facArgs = facilityId ? [orgId, facilityId] : [orgId];

  const hazRow = db
    .prepare(`SELECT COUNT(*) as openCount, SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as criticalCount FROM hazard_alerts WHERE organization_id = ? AND status = 'open'${facFilter}`)
    .get(...facArgs) as { openCount: number; criticalCount: number | null };

  const revRow = db
    .prepare(
      `SELECT SUM(CASE WHEN review_status = 'pending' THEN 1 ELSE 0 END) as pendingCount,
              SUM(CASE WHEN review_status IN ('verified_correct', 'approved', 'corrected', 'added_to_dataset') THEN 1 ELSE 0 END) as verifiedCount,
              SUM(CASE WHEN review_status IN ('verified_correct', 'approved') THEN 1 ELSE 0 END) as approvedCount
       FROM human_reviews WHERE organization_id = ?${facFilter}`
    )
    .get(...facArgs) as { pendingCount: number | null; verifiedCount: number | null; approvedCount: number | null };

  const verifiedCount = Number(revRow?.verifiedCount || 0);
  const approvedCount = Number(revRow?.approvedCount || 0);
  const verifiedAccuracyPct = verifiedCount > 0 ? Number(((approvedCount / verifiedCount) * 100).toFixed(1)) : null;

  const conveyorSessions = db
    .prepare(
      `SELECT c.*, f.name as facility_name
       FROM conveyor_sessions c
       JOIN facilities f ON f.id = c.facility_id
       WHERE c.organization_id = ?${facilityId ? ' AND c.facility_id = ?' : ''}
       ORDER BY c.started_at DESC`
    )
    .all(...facArgs) as Array<Record<string, unknown>>;

  const recentDetections = db
    .prepare(
      `SELECT d.id, d.image_name, d.source_type, d.inference_provider, d.overall_readiness_score, d.overall_recovery_score,
              d.object_count, d.has_hazards, d.needs_human_review, d.is_demo_data, d.created_at, f.name as facility_name
       FROM detection_records d
       JOIN facilities f ON f.id = d.facility_id
       WHERE d.organization_id = ?${facilityId ? ' AND d.facility_id = ?' : ''}
       ORDER BY d.created_at DESC LIMIT 8`
    )
    .all(...facArgs);

  const recentHazards = db
    .prepare(
      `SELECT h.*, f.name as facility_name
       FROM hazard_alerts h
       JOIN facilities f ON f.id = h.facility_id
       WHERE h.organization_id = ?${facilityId ? ' AND h.facility_id = ?' : ''}
       ORDER BY CASE h.status WHEN 'open' THEN 0 ELSE 1 END, h.created_at DESC LIMIT 5`
    )
    .all(...facArgs);

  const recentAuditEvents = db
    .prepare('SELECT id, actor_email, action, resource_type, resource_id, created_at FROM audit_logs WHERE organization_id = ? ORDER BY created_at DESC LIMIT 10')
    .all(orgId);

  const twinConfig = db
    .prepare(
      `SELECT dt.id, dt.name, dt.facility_id, f.name as facility_name, dt.stages_json, dt.updated_at
       FROM digital_twin_configs dt
       JOIN facilities f ON f.id = dt.facility_id
       WHERE dt.organization_id = ?${facilityId ? ' AND dt.facility_id = ?' : ''} LIMIT 1`
    )
    .get(...facArgs) as Record<string, unknown> | undefined;

  const latestScenario = db
    .prepare('SELECT id, name, results_json, created_at FROM simulation_scenarios WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(orgId) as { id: string; name: string; results_json: string; created_at: string } | undefined;

  const envSummary = db
    .prepare(
      `SELECT COUNT(*) as estimateCount,
              COALESCE(SUM(measured_recovered_kg), 0) as totalRecoveredKg,
              COALESCE(SUM(modeled_co2_avoided_kg), 0) as totalCo2AvoidedKg,
              COALESCE(SUM(modeled_energy_saved_kwh), 0) as totalEnergySavedKwh,
              COALESCE(SUM(modeled_landfill_diverted_m3), 0) as totalLandfillDivertedM3
       FROM environmental_estimates WHERE organization_id = ?${facFilter}`
    )
    .get(...facArgs);

  const openHandoversCount = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM shift_handovers WHERE organization_id = ? AND status != 'acknowledged'${facFilter}`)
      .get(...facArgs) as { cnt: number }
  ).cnt;

  res.json({
    dataProvenanceNotice: 'Measured user scans (is_demo_data=0) are tracked separately from seeded DEMO DATA snapshots (is_demo_data=1).',
    filterWindow: { timeRange, startDate, endDate, facilityId: facilityId || null },
    detectionMetrics,
    composition,
    contaminationBreakdown,
    snapshots,
    volumeTotals,
    operationalCounters: {
      openHazardsCount: hazRow?.openCount || 0,
      criticalHazardsCount: hazRow?.criticalCount || 0,
      pendingReviewsCount: Number(revRow?.pendingCount || 0),
      verifiedReviewsCount: verifiedCount,
      verifiedAccuracyPct,
      activeConveyorSessions: conveyorSessions.filter((s) => s.status === 'running').length,
      totalConveyorSessions: conveyorSessions.length,
      totalConveyorItems: conveyorSessions.reduce((acc, s) => acc + Number(s.items_processed || 0), 0),
      totalDivertedReject: conveyorSessions.reduce((acc, s) => acc + Number(s.items_diverted_reject || 0), 0),
      openHandoversCount,
    },
    conveyorSessions,
    recentDetections,
    recentHazards,
    recentAuditEvents,
    digitalTwinSummary: {
      config: twinConfig ? { ...twinConfig, stages: JSON.parse(String(twinConfig.stages_json || '[]')) } : null,
      latestScenario: latestScenario
        ? { id: latestScenario.id, name: latestScenario.name, created_at: latestScenario.created_at, results: JSON.parse(latestScenario.results_json || '{}') }
        : null,
    },
    environmentalSummary: envSummary,
  });
});

// Feature 6: Operational Anomaly Insights (Transparent rule-based baseline comparison)
analyticsRouter.get('/analytics/anomalies', authenticate, (req, res) => {
  const db = getDb();
  const orgId = req.auth!.organizationId;
  const facilityId = String(req.query.facilityId || '').trim();

  const anomalies: Array<{
    id: string;
    severity: 'critical' | 'warning' | 'info';
    category: 'contamination_spike' | 'recovery_drop' | 'hazard_surge' | 'review_backlog' | 'low_confidence_surge';
    title: string;
    facilityId: string | null;
    facilityName: string;
    observedValue: string;
    baselineValue: string;
    explanation: string;
    recommendedAction: string;
    detectedAt: string;
    methodologyNote: string;
  }> = [];

  const facWhere = facilityId ? ' AND f.id = ?' : '';
  const facParams = facilityId ? [orgId, facilityId] : [orgId];
  const facilities = db
    .prepare(`SELECT id, name FROM facilities f WHERE f.organization_id = ?${facWhere}`)
    .all(...facParams) as Array<{ id: string; name: string }>;

  for (const fac of facilities) {
    const snaps = db
      .prepare('SELECT * FROM analytics_snapshots WHERE organization_id = ? AND facility_id = ? ORDER BY snapshot_date DESC LIMIT 7')
      .all(orgId, fac.id) as Array<{
      snapshot_date: string;
      recovery_rate_pct: number;
      contamination_rate_pct: number;
      sorting_accuracy_pct: number;
    }>;

    if (snaps.length >= 2) {
      const latest = snaps[0];
      const prior = snaps.slice(1);
      const avgContam = prior.reduce((s, x) => s + x.contamination_rate_pct, 0) / prior.length;
      const avgRecov = prior.reduce((s, x) => s + x.recovery_rate_pct, 0) / prior.length;

      if (latest.contamination_rate_pct > Math.max(9.0, avgContam * 1.15) || latest.contamination_rate_pct >= 8.2) {
        anomalies.push({
          id: `anom_contam_${fac.id}`,
          severity: latest.contamination_rate_pct >= 10 ? 'critical' : 'warning',
          category: 'contamination_spike',
          title: `Contamination Watch on ${fac.name}`,
          facilityId: fac.id,
          facilityName: fac.name,
          observedValue: `${latest.contamination_rate_pct.toFixed(1)}%`,
          baselineValue: `${avgContam.toFixed(1)}% rolling avg`,
          explanation: `Latest snapshot (${latest.snapshot_date}) recorded ${latest.contamination_rate_pct.toFixed(1)}% contamination against a facility baseline of ${avgContam.toFixed(1)}%.`,
          recommendedAction: 'Inspect incoming route grease/moisture levels and verify OCC star-screen air-knife pressure.',
          detectedAt: latest.snapshot_date,
          methodologyNote: 'Rule-based threshold check comparing latest facility snapshot against trailing baseline (is_demo_data reflects snapshot provenance).',
        });
      }

      if (latest.recovery_rate_pct < avgRecov - 1.5 || latest.recovery_rate_pct < 82) {
        anomalies.push({
          id: `anom_recov_${fac.id}`,
          severity: 'warning',
          category: 'recovery_drop',
          title: `Recovery Yield Deviation at ${fac.name}`,
          facilityId: fac.id,
          facilityName: fac.name,
          observedValue: `${latest.recovery_rate_pct.toFixed(1)}%`,
          baselineValue: `${avgRecov.toFixed(1)}% rolling avg`,
          explanation: `Material recovery rate (${latest.recovery_rate_pct.toFixed(1)}%) sits below target threshold (82%) or trailing baseline.`,
          recommendedAction: 'Run Digital Twin simulation for optical confidence threshold and belt speed balance.',
          detectedAt: latest.snapshot_date,
          methodologyNote: 'Rule-based delta between latest recovery rate and facility trailing mean.',
        });
      }
    }

    const openHaz = db
      .prepare("SELECT COUNT(*) as cnt FROM hazard_alerts WHERE organization_id = ? AND facility_id = ? AND status = 'open'")
      .get(orgId, fac.id) as { cnt: number };

    if (openHaz.cnt > 0) {
      anomalies.push({
        id: `anom_haz_${fac.id}`,
        severity: 'critical',
        category: 'hazard_surge',
        title: `Unresolved Hazardous Item(s) at ${fac.name}`,
        facilityId: fac.id,
        facilityName: fac.name,
        observedValue: `${openHaz.cnt} open alert(s)`,
        baselineValue: '0 open target',
        explanation: `${openHaz.cnt} active hazard alert(s) await operator isolation confirmation and safe-handling sign-off.`,
        recommendedAction: 'Open Hazard Intelligence to verify physical isolation drum placement before resuming compaction.',
        detectedAt: new Date().toISOString().slice(0, 10),
        methodologyNote: 'Live SQLite state check on hazard_alerts where status = open.',
      });
    }

    const pendingRev = db
      .prepare("SELECT COUNT(*) as cnt FROM human_reviews WHERE organization_id = ? AND facility_id = ? AND review_status = 'pending'")
      .get(orgId, fac.id) as { cnt: number };

    if (pendingRev.cnt > 0) {
      anomalies.push({
        id: `anom_rev_${fac.id}`,
        severity: pendingRev.cnt >= 5 ? 'warning' : 'info',
        category: 'review_backlog',
        title: `Human QA Review Queue Active at ${fac.name}`,
        facilityId: fac.id,
        facilityName: fac.name,
        observedValue: `${pendingRev.cnt} pending item(s)`,
        baselineValue: '< 3 queue SLA',
        explanation: `Low-confidence (<0.65) or Unknown OOD detections are queued for manual label verification.`,
        recommendedAction: 'Triage pending items in Human Review Queue to calibrate model ground-truth accuracy.',
        detectedAt: new Date().toISOString().slice(0, 10),
        methodologyNote: 'Live SQLite queue count on human_reviews where review_status = pending.',
      });
    }
  }

  // Low-confidence surge across organization detection objects
  const objStats = db
    .prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN is_low_confidence = 1 OR is_unknown_material = 1 THEN 1 ELSE 0 END) as lowConf
       FROM detection_objects WHERE organization_id = ?`
    )
    .get(orgId) as { total: number; lowConf: number | null };

  if (objStats.total > 0) {
    const share = ((objStats.lowConf || 0) / objStats.total) * 100;
    if (share >= 12) {
      anomalies.push({
        id: 'anom_low_conf_org',
        severity: share >= 25 ? 'warning' : 'info',
        category: 'low_confidence_surge',
        title: 'Elevated Low-Confidence / OOD Object Share',
        facilityId: null,
        facilityName: 'Organization-Wide',
        observedValue: `${share.toFixed(1)}% (${objStats.lowConf}/${objStats.total})`,
        baselineValue: '< 12.0% threshold',
        explanation: `${share.toFixed(1)}% of inspected objects scored below 0.65 confidence or mapped to Unknown OOD.`,
        recommendedAction: 'Inspect optical lighting, camera lens cleanliness, and black-polymer training samples in Dataset Curation.',
        detectedAt: new Date().toISOString().slice(0, 10),
        methodologyNote: 'Direct ratio of detection_objects flagged is_low_confidence or is_unknown_material.',
      });
    }
  }

  res.json({
    methodologyNotice: 'Anomaly insights are produced by deterministic threshold and rolling-baseline rules over recorded facility data—not unverified predictive ML.',
    anomalies,
  });
});

// Feature 3: Saved Dashboard Views
analyticsRouter.get('/analytics/dashboard-views', authenticate, (req, res) => {
  const db = getDb();
  const views = db
    .prepare(
      `SELECT v.*, u.full_name as creator_name
       FROM saved_dashboard_views v
       LEFT JOIN users u ON u.id = v.user_id
       WHERE v.organization_id = ? AND (v.is_shared = 1 OR v.user_id = ?)
       ORDER BY v.is_demo_data ASC, v.updated_at DESC`
    )
    .all(req.auth!.organizationId, req.auth!.userId) as Array<Record<string, unknown>>;

  res.json({
    views: views.map((v) => ({
      ...v,
      config: JSON.parse(String(v.config_json || '{}')),
    })),
  });
});

analyticsRouter.post('/analytics/dashboard-views', authenticate, (req, res) => {
  const { name, description, config, isShared } = req.body as {
    name?: string;
    description?: string;
    config?: Record<string, unknown>;
    isShared?: boolean;
  };
  if (!name || name.trim().length < 2) {
    res.status(400).json({ error: 'View name (at least 2 characters) is required.' });
    return;
  }

  const db = getDb();
  const id = `view_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(
    `INSERT INTO saved_dashboard_views (id, organization_id, user_id, name, description, config_json, is_shared, is_demo_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(
    id,
    req.auth!.organizationId,
    req.auth!.userId,
    name.trim(),
    (description || '').trim(),
    JSON.stringify(config || {}),
    isShared === false ? 0 : 1
  );

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'dashboard_view.saved',
    resourceType: 'saved_dashboard_view',
    resourceId: id,
  });

  const saved = db.prepare('SELECT * FROM saved_dashboard_views WHERE id = ?').get(id) as Record<string, unknown>;
  res.status(201).json({ view: { ...saved, config: JSON.parse(String(saved.config_json || '{}')) } });
});

analyticsRouter.delete('/analytics/dashboard-views/:id', authenticate, (req, res) => {
  const db = getDb();
  const row = db
    .prepare('SELECT id, user_id FROM saved_dashboard_views WHERE id = ? AND organization_id = ?')
    .get(req.params.id, req.auth!.organizationId) as { id: string; user_id: string } | undefined;
  if (!row) {
    res.status(404).json({ error: 'Saved view not found in active organization.' });
    return;
  }
  db.prepare('DELETE FROM saved_dashboard_views WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

analyticsRouter.get('/analytics/facilities-compare', authenticate, (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT f.id, f.name, f.country_code, f.city, f.capacity_tons_per_day,
              ROUND(AVG(s.recovery_rate_pct), 1) as avg_recovery_pct,
              ROUND(AVG(s.contamination_rate_pct), 1) as avg_contamination_pct,
              ROUND(AVG(s.sorting_accuracy_pct), 1) as avg_accuracy_pct,
              COALESCE(SUM(b.recovered_weight_kg), 0) as total_recovered_kg
       FROM facilities f
       LEFT JOIN analytics_snapshots s ON s.facility_id = f.id
       LEFT JOIN processing_batches b ON b.facility_id = f.id
       WHERE f.organization_id = ?
       GROUP BY f.id`
    )
    .all(req.auth!.organizationId);
  res.json({ facilities: rows });
});

analyticsRouter.get('/analytics/export-csv', authenticate, (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT d.id, f.name as facility_name, d.image_name, d.source_type, d.inference_provider,
              d.overall_readiness_score, d.overall_recovery_score, d.object_count, d.has_hazards,
              d.is_demo_data, d.created_at
       FROM detection_records d
       JOIN facilities f ON f.id = d.facility_id
       WHERE d.organization_id = ?
       ORDER BY d.created_at DESC LIMIT 500`
    )
    .all(req.auth!.organizationId) as Array<Record<string, unknown>>;

  const headers = [
    'detection_id', 'facility_name', 'image_name', 'source_type', 'inference_provider',
    'readiness_score', 'recovery_score', 'object_count', 'has_hazards', 'is_demo_data', 'created_at',
  ];
  const csvLines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.id, r.facility_name, r.image_name, r.source_type, r.inference_provider,
        r.overall_readiness_score, r.overall_recovery_score, r.object_count, r.has_hazards, r.is_demo_data, r.created_at,
      ]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    ),
  ];

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'analytics.exported_csv',
    resourceType: 'analytics_report',
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sortsight_analytics_export.csv"');
  res.send(csvLines.join('\n'));
});

// Environmental Impact Estimator (Separates measured weights from modeled assumptions)
analyticsRouter.get('/environment/estimates', authenticate, (req, res) => {
  const db = getDb();
  const estimates = db
    .prepare(
      `SELECT e.*, f.name as facility_name
       FROM environmental_estimates e
       JOIN facilities f ON f.id = e.facility_id
       WHERE e.organization_id = ?
       ORDER BY e.created_at DESC LIMIT 20`
    )
    .all(req.auth!.organizationId);
  const factors = db.prepare('SELECT code, name, co2_saved_kg_per_kg, energy_saved_kwh_per_kg, landfill_diverted_m3_per_kg FROM material_categories').all();
  res.json({
    methodologyNotice: 'Environmental estimates apply configurable lifecycle emission factors (EPA WARM / EU JRC reference baselines) to measured or user-entered recovered weights. Modeled estimates are NOT audited carbon credits.',
    estimates,
    defaultFactors: factors,
  });
});

analyticsRouter.post('/environment/estimate', authenticate, (req, res) => {
  const { facilityId, periodLabel, materialWeightsKg, emissionFactorMultiplier } = req.body as {
    facilityId?: string;
    periodLabel?: string;
    materialWeightsKg?: Record<string, number>;
    emissionFactorMultiplier?: number;
  };
  if (!facilityId || !materialWeightsKg) {
    res.status(400).json({ error: 'facilityId and materialWeightsKg map are required.' });
    return;
  }

  const db = getDb();
  const fac = db.prepare('SELECT id FROM facilities WHERE id = ? AND organization_id = ?').get(facilityId, req.auth!.organizationId);
  if (!fac) {
    res.status(404).json({ error: 'Facility not found in active organization.' });
    return;
  }

  const mats = db.prepare('SELECT code, co2_saved_kg_per_kg, energy_saved_kwh_per_kg, landfill_diverted_m3_per_kg FROM material_categories').all() as Array<{
    code: string;
    co2_saved_kg_per_kg: number;
    energy_saved_kwh_per_kg: number;
    landfill_diverted_m3_per_kg: number;
  }>;
  const matMap = new Map(mats.map((m) => [m.code, m]));
  const mult = Math.max(0.5, Math.min(1.5, Number(emissionFactorMultiplier || 1.0)));

  let totalKg = 0;
  let totalCo2 = 0;
  let totalKwh = 0;
  let totalM3 = 0;

  for (const [code, kgRaw] of Object.entries(materialWeightsKg)) {
    const kg = Math.max(0, Number(kgRaw || 0));
    const factor = matMap.get(code);
    if (factor && kg > 0) {
      totalKg += kg;
      totalCo2 += kg * factor.co2_saved_kg_per_kg * mult;
      totalKwh += kg * factor.energy_saved_kwh_per_kg * mult;
      totalM3 += kg * factor.landfill_diverted_m3_per_kg;
    }
  }

  const id = `env_${crypto.randomUUID().slice(0, 10)}`;
  const methodology = `Modeled estimate using material-specific displacement multipliers (scale=${mult}x) over ${totalKg.toFixed(1)} kg recovered mass. Excludes collection transport emissions.`;

  db.prepare(
    `INSERT INTO environmental_estimates (id, organization_id, facility_id, period_label, measured_recovered_kg, modeled_co2_avoided_kg, modeled_energy_saved_kwh, modeled_landfill_diverted_m3, methodology_notes, assumptions_json, is_modeled_estimate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(
    id,
    req.auth!.organizationId,
    facilityId,
    periodLabel || 'Custom Period Estimate',
    Number(totalKg.toFixed(2)),
    Number(totalCo2.toFixed(2)),
    Number(totalKwh.toFixed(2)),
    Number(totalM3.toFixed(4)),
    methodology,
    JSON.stringify({ materialWeightsKg, emissionFactorMultiplier: mult })
  );

  res.status(201).json({ estimate: db.prepare('SELECT * FROM environmental_estimates WHERE id = ?').get(id) });
});

// AI Operator Assistant
analyticsRouter.post('/assistant/query', authenticate, async (req, res) => {
  const { facilityId, question, taskType, history } = req.body as {
    facilityId?: string;
    question?: string;
    taskType?: 'general_query' | 'report_summary' | 'anomaly_explanation' | 'contamination_advice' | 'sorting_guidance';
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  if (!question || question.trim().length < 2) {
    res.status(400).json({ error: 'question is required.' });
    return;
  }

  const db = getDb();
  const result = await queryOperatorAssistant(db, {
    organizationId: req.auth!.organizationId,
    facilityId,
    question: question.trim(),
    taskType,
    history,
  });

  res.json(result);
});
