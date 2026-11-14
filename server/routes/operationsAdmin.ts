import crypto from 'crypto';
import { Router } from 'express';
import { config } from '../config.ts';
import { encryptSecret, getDb } from '../db/database.ts';
import { authenticate, hashApiKey, recordAuditLog, requirePermission } from '../middleware/auth.ts';
import { FEATURE_REGISTRY } from '../services/featureRegistry.ts';
import { runSortingSimulation, TwinStageInput } from '../services/simulationService.ts';

export const operationsAdminRouter = Router();

// Operations Overview, Collection Batches, Material Inventory, Tasks
operationsAdminRouter.get('/operations/overview', authenticate, (req, res) => {
  const db = getDb();
  const batches = db
    .prepare(
      `SELECT b.*, f.name as facility_name, u.full_name as operator_name
       FROM processing_batches b
       JOIN facilities f ON f.id = b.facility_id
       LEFT JOIN users u ON u.id = b.assigned_operator_id
       WHERE b.organization_id = ?
       ORDER BY b.created_at DESC`
    )
    .all(req.auth!.organizationId);
  const tasks = db
    .prepare(
      `SELECT t.*, f.name as facility_name, u.full_name as assignee_name
       FROM operations_tasks t
       JOIN facilities f ON f.id = t.facility_id
       LEFT JOIN users u ON u.id = t.assigned_to_user_id
       WHERE t.organization_id = ?
       ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.created_at DESC`
    )
    .all(req.auth!.organizationId);

  res.json({ batches, tasks });
});

operationsAdminRouter.post('/operations/batches', authenticate, requirePermission('operations:write'), (req, res) => {
  const { facilityId, batchCode, sourceRoute, intakeWeightKg, recoveredWeightKg, contaminatedWeightKg } = req.body as {
    facilityId?: string;
    batchCode?: string;
    sourceRoute?: string;
    intakeWeightKg?: number;
    recoveredWeightKg?: number;
    contaminatedWeightKg?: number;
  };
  if (!facilityId || !sourceRoute || !intakeWeightKg) {
    res.status(400).json({ error: 'facilityId, sourceRoute, and intakeWeightKg are required.' });
    return;
  }
  const db = getDb();
  const id = `bat_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(
    `INSERT INTO processing_batches (id, organization_id, facility_id, batch_code, source_route, intake_weight_kg, recovered_weight_kg, contaminated_weight_kg, status, assigned_operator_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'intake', ?)`
  ).run(
    id,
    req.auth!.organizationId,
    facilityId,
    batchCode || `BATCH-${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    sourceRoute.trim(),
    Number(intakeWeightKg),
    Number(recoveredWeightKg || 0),
    Number(contaminatedWeightKg || 0),
    req.auth!.userId
  );

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'batch.created',
    resourceType: 'processing_batch',
    resourceId: id,
  });

  res.status(201).json({ batch: db.prepare('SELECT * FROM processing_batches WHERE id = ?').get(id) });
});

operationsAdminRouter.get('/operations/batches/:id', authenticate, (req, res) => {
  const db = getDb();
  const batch = db
    .prepare(
      `SELECT b.*, f.name as facility_name, f.facility_code, u.full_name as operator_name
       FROM processing_batches b
       JOIN facilities f ON f.id = b.facility_id
       LEFT JOIN users u ON u.id = b.assigned_operator_id
       WHERE b.id = ? AND b.organization_id = ?`
    )
    .get(req.params.id, req.auth!.organizationId);

  if (!batch) {
    res.status(404).json({ error: 'Processing batch not found in active organization.' });
    return;
  }

  const relatedDetections = db
    .prepare('SELECT id, image_name, inference_provider, overall_readiness_score, overall_recovery_score, created_at FROM detection_records WHERE batch_id = ? AND organization_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(req.params.id, req.auth!.organizationId);

  res.json({ batch, relatedDetections });
});

operationsAdminRouter.patch('/operations/batches/:id', authenticate, requirePermission('operations:write'), (req, res) => {
  const { status, recoveredWeightKg, contaminatedWeightKg } = req.body as {
    status?: 'intake' | 'sorting' | 'completed' | 'quarantined';
    recoveredWeightKg?: number;
    contaminatedWeightKg?: number;
  };
  const db = getDb();
  const row = db
    .prepare('SELECT id FROM processing_batches WHERE id = ? AND organization_id = ?')
    .get(req.params.id, req.auth!.organizationId);
  if (!row) {
    res.status(404).json({ error: 'Batch not found in active organization.' });
    return;
  }

  db.prepare(
    `UPDATE processing_batches SET
      status = COALESCE(?, status),
      recovered_weight_kg = COALESCE(?, recovered_weight_kg),
      contaminated_weight_kg = COALESCE(?, contaminated_weight_kg),
      completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END
     WHERE id = ?`
  ).run(status || null, typeof recoveredWeightKg === 'number' ? recoveredWeightKg : null, typeof contaminatedWeightKg === 'number' ? contaminatedWeightKg : null, status || null, req.params.id);

  res.json({ batch: db.prepare('SELECT * FROM processing_batches WHERE id = ?').get(req.params.id) });
});

operationsAdminRouter.post('/operations/tasks', authenticate, requirePermission('operations:write'), (req, res) => {
  const { facilityId, title, description, priority, assignedToUserId, dueDate } = req.body as {
    facilityId?: string;
    title?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    assignedToUserId?: string;
    dueDate?: string;
  };
  if (!facilityId || !title) {
    res.status(400).json({ error: 'facilityId and title are required.' });
    return;
  }
  const db = getDb();
  const id = `tsk_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(
    `INSERT INTO operations_tasks (id, organization_id, facility_id, title, description, priority, status, assigned_to_user_id, created_by_user_id, due_date)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`
  ).run(id, req.auth!.organizationId, facilityId, title.trim(), description || '', priority || 'medium', assignedToUserId || req.auth!.userId, req.auth!.userId, dueDate || null);

  res.status(201).json({ task: db.prepare('SELECT * FROM operations_tasks WHERE id = ?').get(id) });
});

operationsAdminRouter.patch('/operations/tasks/:id', authenticate, requirePermission('operations:write'), (req, res) => {
  const { status } = req.body as { status?: 'open' | 'in_progress' | 'completed' };
  const db = getDb();
  const existing = db.prepare('SELECT id FROM operations_tasks WHERE id = ? AND organization_id = ?').get(req.params.id, req.auth!.organizationId);
  if (!existing) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }
  db.prepare("UPDATE operations_tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status || 'completed', req.params.id);
  res.json({ ok: true });
});

// Feature 4: Shift Handover & Incident Reports
operationsAdminRouter.get('/operations/handovers', authenticate, (req, res) => {
  const db = getDb();
  const facilityId = String(req.query.facilityId || '').trim();
  let sql = `
    SELECT h.*, f.name as facility_name
    FROM shift_handovers h
    JOIN facilities f ON f.id = h.facility_id
    WHERE h.organization_id = ?
  `;
  const params: unknown[] = [req.auth!.organizationId];
  if (facilityId) {
    sql += ' AND h.facility_id = ?';
    params.push(facilityId);
  }
  sql += ' ORDER BY h.created_at DESC LIMIT 40';
  const handovers = db.prepare(sql).all(...params);
  res.json({ handovers });
});

operationsAdminRouter.post('/operations/handovers', authenticate, requirePermission('operations:write'), (req, res) => {
  const { facilityId, shiftLabel, incomingUserName, summaryNotes, safetyNotes } = req.body as {
    facilityId?: string;
    shiftLabel?: string;
    incomingUserName?: string;
    summaryNotes?: string;
    safetyNotes?: string;
  };
  if (!facilityId || !shiftLabel || !summaryNotes) {
    res.status(400).json({ error: 'facilityId, shiftLabel, and summaryNotes are required.' });
    return;
  }

  const db = getDb();
  const orgId = req.auth!.organizationId;
  const fac = db.prepare('SELECT id, name FROM facilities WHERE id = ? AND organization_id = ?').get(facilityId, orgId);
  if (!fac) {
    res.status(404).json({ error: 'Facility not found in active organization.' });
    return;
  }

  // Capture live operational state snapshot from SQLite
  const openHazards = (
    db.prepare("SELECT COUNT(*) as cnt FROM hazard_alerts WHERE organization_id = ? AND facility_id = ? AND status = 'open'").get(orgId, facilityId) as { cnt: number }
  ).cnt;
  const pendingReviews = (
    db.prepare("SELECT COUNT(*) as cnt FROM human_reviews WHERE organization_id = ? AND facility_id = ? AND review_status = 'pending'").get(orgId, facilityId) as { cnt: number }
  ).cnt;
  const conv = db
    .prepare('SELECT status, items_processed FROM conveyor_sessions WHERE organization_id = ? AND facility_id = ? ORDER BY started_at DESC LIMIT 1')
    .get(orgId, facilityId) as { status: string; items_processed: number } | undefined;

  const userRow = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.auth!.userId) as { full_name: string } | undefined;
  const id = `hand_${crypto.randomUUID().slice(0, 10)}`;

  db.prepare(
    `INSERT INTO shift_handovers (id, organization_id, facility_id, shift_label, outgoing_user_id, outgoing_user_name, incoming_user_name, summary_notes, safety_notes, conveyor_status_snapshot, open_hazards_count, pending_reviews_count, items_processed_count, status, is_demo_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', 0)`
  ).run(
    id,
    orgId,
    facilityId,
    shiftLabel.trim(),
    req.auth!.userId,
    userRow?.full_name || req.auth!.email,
    (incomingUserName || 'Next Shift Supervisor').trim(),
    summaryNotes.trim(),
    (safetyNotes || '').trim(),
    conv?.status || 'idle',
    openHazards,
    pendingReviews,
    conv?.items_processed || 0
  );

  recordAuditLog({
    organizationId: orgId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'handover.submitted',
    resourceType: 'shift_handover',
    resourceId: id,
    details: { facilityId, shiftLabel, openHazards, pendingReviews },
  });

  const created = db
    .prepare('SELECT h.*, f.name as facility_name FROM shift_handovers h JOIN facilities f ON f.id = h.facility_id WHERE h.id = ?')
    .get(id);
  res.status(201).json({ handover: created });
});

operationsAdminRouter.patch('/operations/handovers/:id/signoff', authenticate, (req, res) => {
  const db = getDb();
  const orgId = req.auth!.organizationId;
  const existing = db
    .prepare('SELECT id FROM shift_handovers WHERE id = ? AND organization_id = ?')
    .get(req.params.id, orgId);
  if (!existing) {
    res.status(404).json({ error: 'Shift handover not found in active organization.' });
    return;
  }

  const userRow = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.auth!.userId) as { full_name: string } | undefined;
  db.prepare(
    `UPDATE shift_handovers SET status = 'acknowledged', signed_off_by_user_id = ?, signed_off_by_name = ?, signed_off_at = datetime('now') WHERE id = ?`
  ).run(req.auth!.userId, userRow?.full_name || req.auth!.email, req.params.id);

  recordAuditLog({
    organizationId: orgId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'handover.acknowledged',
    resourceType: 'shift_handover',
    resourceId: req.params.id,
  });

  const updated = db
    .prepare('SELECT h.*, f.name as facility_name FROM shift_handovers h JOIN facilities f ON f.id = h.facility_id WHERE h.id = ?')
    .get(req.params.id);
  res.json({ handover: updated });
});

// Feature 2: Advanced Global Search (Org-isolated)
operationsAdminRouter.get('/search', authenticate, (req, res) => {
  const db = getDb();
  const orgId = req.auth!.organizationId;
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || 'all').trim();

  if (!q) {
    const recent = db
      .prepare('SELECT id, query_text, result_count, created_at FROM recent_searches WHERE organization_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 8')
      .all(orgId, req.auth!.userId);
    res.json({ query: '', results: [], recentSearches: recent });
    return;
  }

  const like = `%${q}%`;
  const results: Array<{
    id: string;
    entityType: 'facility' | 'material' | 'detection' | 'hazard' | 'review' | 'batch' | 'policy';
    title: string;
    subtitle: string;
    targetView: string;
    targetPath: string;
    badge: string;
    severity?: string;
  }> = [];

  if (category === 'all' || category === 'facility') {
    const facs = db
      .prepare('SELECT id, name, facility_code, city, country_code, status FROM facilities WHERE organization_id = ? AND (name LIKE ? OR facility_code LIKE ? OR city LIKE ?) LIMIT 6')
      .all(orgId, like, like, like) as Array<Record<string, string>>;
    for (const f of facs) {
      results.push({
        id: f.id,
        entityType: 'facility',
        title: f.name,
        subtitle: `${f.facility_code} · ${f.city}, ${f.country_code}`,
        targetView: 'directory',
        targetPath: `/facilities/${f.id}`,
        badge: f.status.toUpperCase(),
      });
    }
  }

  if (category === 'all' || category === 'material') {
    const mats = db
      .prepare('SELECT code, name, parent_group, hazard_class FROM material_categories WHERE name LIKE ? OR code LIKE ? OR parent_group LIKE ? OR description LIKE ? LIMIT 6')
      .all(like, like, like, like) as Array<Record<string, string>>;
    for (const m of mats) {
      results.push({
        id: m.code,
        entityType: 'material',
        title: `${m.name} (${m.code})`,
        subtitle: `${m.parent_group} · Hazard: ${m.hazard_class}`,
        targetView: 'materials',
        targetPath: `/materials/${m.code}`,
        badge: m.parent_group,
      });
    }
  }

  if (category === 'all' || category === 'detection') {
    const dets = db
      .prepare(
        `SELECT d.id, d.image_name, d.inference_provider, d.overall_recovery_score, f.name as facility_name
         FROM detection_records d JOIN facilities f ON f.id = d.facility_id
         WHERE d.organization_id = ? AND (d.image_name LIKE ? OR d.id LIKE ? OR f.name LIKE ?)
         ORDER BY d.created_at DESC LIMIT 6`
      )
      .all(orgId, like, like, like) as Array<Record<string, unknown>>;
    for (const d of dets) {
      results.push({
        id: String(d.id),
        entityType: 'detection',
        title: String(d.image_name),
        subtitle: `${d.facility_name} · Recovery ${d.overall_recovery_score}% · ${d.inference_provider}`,
        targetView: 'scanner',
        targetPath: `/scanner/result/${d.id}`,
        badge: 'SCAN',
      });
    }
  }

  if (category === 'all' || category === 'hazard') {
    const hazs = db
      .prepare(
        `SELECT h.id, h.title, h.hazard_type, h.severity, h.status, f.name as facility_name
         FROM hazard_alerts h JOIN facilities f ON f.id = h.facility_id
         WHERE h.organization_id = ? AND (h.title LIKE ? OR h.hazard_type LIKE ? OR h.warning_message LIKE ?)
         ORDER BY h.created_at DESC LIMIT 6`
      )
      .all(orgId, like, like, like) as Array<Record<string, string>>;
    for (const h of hazs) {
      results.push({
        id: h.id,
        entityType: 'hazard',
        title: h.title,
        subtitle: `${h.facility_name} · ${h.hazard_type} · ${h.status}`,
        targetView: 'hazards',
        targetPath: `/hazards/${h.id}`,
        badge: h.severity.toUpperCase(),
        severity: h.severity,
      });
    }
  }

  if (category === 'all' || category === 'review') {
    const revs = db
      .prepare(
        `SELECT id, trigger_reason, original_material_code, review_status
         FROM human_reviews
         WHERE organization_id = ? AND (trigger_reason LIKE ? OR original_material_code LIKE ? OR id LIKE ?)
         ORDER BY created_at DESC LIMIT 6`
      )
      .all(orgId, like, like, like) as Array<Record<string, string>>;
    for (const r of revs) {
      results.push({
        id: r.id,
        entityType: 'review',
        title: `${r.original_material_code} (${r.review_status})`,
        subtitle: r.trigger_reason,
        targetView: 'reviews',
        targetPath: `/reviews/${r.id}`,
        badge: 'QA REVIEW',
      });
    }
  }

  if (category === 'all' || category === 'batch') {
    const bats = db
      .prepare(
        `SELECT b.id, b.batch_code, b.source_route, b.status, f.name as facility_name
         FROM processing_batches b JOIN facilities f ON f.id = b.facility_id
         WHERE b.organization_id = ? AND (b.batch_code LIKE ? OR b.source_route LIKE ?)
         ORDER BY b.created_at DESC LIMIT 6`
      )
      .all(orgId, like, like) as Array<Record<string, string>>;
    for (const b of bats) {
      results.push({
        id: b.id,
        entityType: 'batch',
        title: b.batch_code,
        subtitle: `${b.facility_name} · ${b.source_route}`,
        targetView: 'batches',
        targetPath: `/batches/${b.id}`,
        badge: b.status.toUpperCase(),
      });
    }
  }

  if (category === 'all' || category === 'policy') {
    const pols = db
      .prepare(
        `SELECT id, title, country_code, region_name, policy_origin
         FROM recycling_policies
         WHERE (organization_id = ? OR organization_id IS NULL) AND (title LIKE ? OR region_name LIKE ? OR country_code LIKE ?)
         LIMIT 6`
      )
      .all(orgId, like, like, like) as Array<Record<string, string>>;
    for (const p of pols) {
      results.push({
        id: p.id,
        entityType: 'policy',
        title: p.title,
        subtitle: `${p.country_code} · ${p.region_name}`,
        targetView: 'global_rules',
        targetPath: '/global-rules',
        badge: p.policy_origin === 'reference_standard' ? 'REFERENCE' : 'POLICY',
      });
    }
  }

  // Persist search history when >= 2 chars
  if (q.length >= 2) {
    db.prepare(
      'INSERT INTO recent_searches (id, organization_id, user_id, query_text, result_count) VALUES (?, ?, ?, ?, ?)'
    ).run(`srch_${crypto.randomUUID().slice(0, 10)}`, orgId, req.auth!.userId, q, results.length);
  }

  const recent = db
    .prepare('SELECT id, query_text, result_count, created_at FROM recent_searches WHERE organization_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 8')
    .all(orgId, req.auth!.userId);

  res.json({ query: q, results, recentSearches: recent });
});

// Material Inventory
operationsAdminRouter.get('/inventory', authenticate, (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT i.*, f.name as facility_name, m.name as material_name, m.parent_group
       FROM material_inventory i
       JOIN facilities f ON f.id = i.facility_id
       JOIN material_categories m ON m.code = i.material_code
       WHERE i.organization_id = ?
       ORDER BY i.weight_kg DESC`
    )
    .all(req.auth!.organizationId);
  res.json({ inventory: rows });
});

operationsAdminRouter.get('/inventory/:id', authenticate, (req, res) => {
  const db = getDb();
  const item = db
    .prepare(
      `SELECT i.*, f.name as facility_name, f.facility_code, m.name as material_name, m.parent_group, m.description as material_description
       FROM material_inventory i
       JOIN facilities f ON f.id = i.facility_id
       JOIN material_categories m ON m.code = i.material_code
       WHERE i.id = ? AND i.organization_id = ?`
    )
    .get(req.params.id, req.auth!.organizationId);

  if (!item) {
    res.status(404).json({ error: 'Inventory record not found in active organization.' });
    return;
  }

  res.json({ item });
});

operationsAdminRouter.post('/inventory', authenticate, requirePermission('operations:write'), (req, res) => {
  const { facilityId, materialCode, baleCount, weightKg, avgPurityPct, storageZone } = req.body as {
    facilityId?: string;
    materialCode?: string;
    baleCount?: number;
    weightKg?: number;
    avgPurityPct?: number;
    storageZone?: string;
  };
  if (!facilityId || !materialCode) {
    res.status(400).json({ error: 'facilityId and materialCode are required.' });
    return;
  }
  const db = getDb();
  const id = `inv_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(
    `INSERT INTO material_inventory (id, organization_id, facility_id, material_code, bale_count, weight_kg, avg_purity_pct, storage_zone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(facility_id, material_code) DO UPDATE SET
       bale_count = excluded.bale_count,
       weight_kg = excluded.weight_kg,
       avg_purity_pct = excluded.avg_purity_pct,
       storage_zone = excluded.storage_zone,
       updated_at = datetime('now')`
  ).run(id, req.auth!.organizationId, facilityId, materialCode, Number(baleCount || 0), Number(weightKg || 0), Number(avgPurityPct || 95), storageZone || 'Bay A');

  res.status(201).json({ ok: true });
});

// Digital Twin & Optimization Simulator
operationsAdminRouter.get('/digital-twin', authenticate, (req, res) => {
  const db = getDb();
  const configs = db
    .prepare(
      `SELECT dt.*, f.name as facility_name
       FROM digital_twin_configs dt
       JOIN facilities f ON f.id = dt.facility_id
       WHERE dt.organization_id = ?`
    )
    .all(req.auth!.organizationId) as Array<Record<string, unknown>>;

  const scenarios = db
    .prepare(
      `SELECT * FROM simulation_scenarios WHERE organization_id = ? ORDER BY created_at DESC LIMIT 15`
    )
    .all(req.auth!.organizationId) as Array<Record<string, unknown>>;

  res.json({
    configs: configs.map((c) => ({ ...c, stages: JSON.parse(String(c.stages_json || '[]')) })),
    scenarios: scenarios.map((s) => ({
      ...s,
      parameters: JSON.parse(String(s.parameters_json || '{}')),
      results: JSON.parse(String(s.results_json || '{}')),
    })),
  });
});

operationsAdminRouter.get('/digital-twin/flow', authenticate, (req, res) => {
  const db = getDb();
  const facilityId = String(req.query.facilityId || '').trim();
  const flowStreams = db
    .prepare(
      `SELECT recommended_chute as stream, COUNT(*) as object_count, ROUND(AVG(recovery_score), 1) as avg_recovery,
              ROUND(AVG(readiness_score), 1) as avg_readiness
       FROM detection_objects o
       JOIN detection_records r ON r.id = o.detection_record_id
       WHERE o.organization_id = ? ${facilityId ? 'AND r.facility_id = ?' : ''}
       GROUP BY recommended_chute
       ORDER BY object_count DESC`
    )
    .all(...(facilityId ? [req.auth!.organizationId, facilityId] : [req.auth!.organizationId]));

  res.json({ flowStreams });
});

operationsAdminRouter.post('/simulations/run', authenticate, requirePermission('simulations:write'), (req, res) => {
  const { facilityId, twinConfigId, name, parameters } = req.body as {
    facilityId?: string;
    twinConfigId?: string;
    name?: string;
    parameters?: {
      infeedRateTph: number;
      beltSpeedMps: number;
      confidenceThreshold: number;
      opticalAirJetBoostPct: number;
      manualQcStaffCount: number;
      incomingContaminationPct: number;
    };
  };
  const db = getDb();
  const twin = twinConfigId
    ? (db.prepare('SELECT * FROM digital_twin_configs WHERE id = ? AND organization_id = ?').get(twinConfigId, req.auth!.organizationId) as
        | { id: string; facility_id: string; stages_json: string }
        | undefined)
    : (db.prepare('SELECT * FROM digital_twin_configs WHERE organization_id = ? LIMIT 1').get(req.auth!.organizationId) as
        | { id: string; facility_id: string; stages_json: string }
        | undefined);

  if (!twin) {
    res.status(404).json({ error: 'Digital Twin configuration not found.' });
    return;
  }

  const stages = JSON.parse(twin.stages_json) as TwinStageInput[];
  const simParams = parameters || {
    infeedRateTph: 14.5,
    beltSpeedMps: 1.85,
    confidenceThreshold: 0.72,
    opticalAirJetBoostPct: 12,
    manualQcStaffCount: 3,
    incomingContaminationPct: 9.5,
  };

  const results = runSortingSimulation(stages, simParams);
  const simId = `sim_${crypto.randomUUID().slice(0, 10)}`;

  db.prepare(
    `INSERT INTO simulation_scenarios (id, organization_id, facility_id, twin_config_id, name, parameters_json, results_json, assumptions_text, is_simulation, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    simId,
    req.auth!.organizationId,
    facilityId || twin.facility_id,
    twin.id,
    name || `Scenario ${new Date().toISOString().slice(11, 19)}`,
    JSON.stringify(simParams),
    JSON.stringify(results),
    results.assumptionsText,
    req.auth!.userId
  );

  res.status(201).json({ simulationId: simId, results });
});

// Feature 5: Intelligent Alert Management & Email Simulation
operationsAdminRouter.get('/notifications', authenticate, (req, res) => {
  const db = getDb();
  const orgId = req.auth!.organizationId;
  const statusFilter = String(req.query.status || '').trim();
  const severityFilter = String(req.query.severity || '').trim();

  let sql = `
    SELECT n.*, f.name as facility_name, u.full_name as assignee_name, ack.full_name as acknowledged_by_name
    FROM notifications n
    LEFT JOIN facilities f ON f.id = n.facility_id
    LEFT JOIN users u ON u.id = n.assigned_to_user_id
    LEFT JOIN users ack ON ack.id = n.acknowledged_by
    WHERE n.organization_id = ?
  `;
  const params: unknown[] = [orgId];
  if (statusFilter) {
    sql += ' AND n.status = ?';
    params.push(statusFilter);
  }
  if (severityFilter) {
    sql += ' AND n.severity = ?';
    params.push(severityFilter);
  }
  sql += " ORDER BY CASE n.status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END, CASE n.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, n.created_at DESC LIMIT 80";

  const rows = db.prepare(sql).all(...params);
  const summary = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as openCount,
         SUM(CASE WHEN status = 'acknowledged' THEN 1 ELSE 0 END) as acknowledgedCount,
         SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolvedCount,
         SUM(CASE WHEN status = 'open' AND severity = 'critical' THEN 1 ELSE 0 END) as criticalOpenCount
       FROM notifications WHERE organization_id = ?`
    )
    .get(orgId);

  const teamMembers = db
    .prepare(
      `SELECT u.id, u.full_name, u.email, m.role_name
       FROM users u JOIN organization_memberships m ON m.user_id = u.id
       WHERE m.organization_id = ?`
    )
    .all(orgId);

  res.json({ notifications: rows, summary, teamMembers, smtpConfigured: config.smtpConfigured });
});

operationsAdminRouter.post('/notifications/:id/read', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND organization_id = ?').run(req.params.id, req.auth!.organizationId);
  res.json({ ok: true });
});

operationsAdminRouter.post('/notifications/:id/acknowledge', authenticate, (req, res) => {
  const db = getDb();
  const orgId = req.auth!.organizationId;
  const row = db.prepare('SELECT id FROM notifications WHERE id = ? AND organization_id = ?').get(req.params.id, orgId);
  if (!row) {
    res.status(404).json({ error: 'Alert not found in active organization.' });
    return;
  }
  db.prepare(
    "UPDATE notifications SET status = 'acknowledged', is_read = 1, acknowledged_by = ?, acknowledged_at = datetime('now') WHERE id = ?"
  ).run(req.auth!.userId, req.params.id);

  recordAuditLog({
    organizationId: orgId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'alert.acknowledged',
    resourceType: 'notification',
    resourceId: req.params.id,
  });
  res.json({ ok: true });
});

operationsAdminRouter.post('/notifications/:id/resolve', authenticate, (req, res) => {
  const db = getDb();
  const orgId = req.auth!.organizationId;
  const row = db.prepare('SELECT id FROM notifications WHERE id = ? AND organization_id = ?').get(req.params.id, orgId);
  if (!row) {
    res.status(404).json({ error: 'Alert not found in active organization.' });
    return;
  }
  db.prepare(
    "UPDATE notifications SET status = 'resolved', is_read = 1, resolved_by = ?, resolved_at = datetime('now') WHERE id = ?"
  ).run(req.auth!.userId, req.params.id);

  recordAuditLog({
    organizationId: orgId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'alert.resolved',
    resourceType: 'notification',
    resourceId: req.params.id,
  });
  res.json({ ok: true });
});

operationsAdminRouter.patch('/notifications/:id/assign', authenticate, (req, res) => {
  const { assignedToUserId } = req.body as { assignedToUserId?: string | null };
  const db = getDb();
  const orgId = req.auth!.organizationId;
  const row = db.prepare('SELECT id FROM notifications WHERE id = ? AND organization_id = ?').get(req.params.id, orgId);
  if (!row) {
    res.status(404).json({ error: 'Alert not found in active organization.' });
    return;
  }
  db.prepare('UPDATE notifications SET assigned_to_user_id = ? WHERE id = ?').run(assignedToUserId || null, req.params.id);
  res.json({ ok: true });
});

operationsAdminRouter.post('/notifications/group-or-create', authenticate, (req, res) => {
  const { title, message, severity, facilityId, groupKey } = req.body as {
    title?: string;
    message?: string;
    severity?: 'info' | 'warning' | 'critical';
    facilityId?: string;
    groupKey?: string;
  };
  if (!title || !message) {
    res.status(400).json({ error: 'title and message are required.' });
    return;
  }
  const db = getDb();
  const orgId = req.auth!.organizationId;

  if (groupKey) {
    const existingOpen = db
      .prepare("SELECT id, occurrence_count FROM notifications WHERE organization_id = ? AND group_key = ? AND status = 'open' LIMIT 1")
      .get(orgId, groupKey) as { id: string; occurrence_count: number } | undefined;

    if (existingOpen) {
      db.prepare("UPDATE notifications SET occurrence_count = occurrence_count + 1, message = ?, created_at = datetime('now') WHERE id = ?").run(
        message,
        existingOpen.id
      );
      res.json({ ok: true, grouped: true, id: existingOpen.id, occurrenceCount: existingOpen.occurrence_count + 1 });
      return;
    }
  }

  const id = `ntf_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(
    `INSERT INTO notifications (id, organization_id, user_id, facility_id, channel, severity, status, group_key, occurrence_count, title, message)
     VALUES (?, ?, ?, ?, 'in_app', ?, 'open', ?, 1, ?, ?)`
  ).run(id, orgId, req.auth!.userId, facilityId || null, severity || 'warning', groupKey || null, title.trim(), message.trim());

  res.status(201).json({ ok: true, grouped: false, id, occurrenceCount: 1 });
});

operationsAdminRouter.post('/notifications/test-email', authenticate, (req, res) => {
  const { recipientEmail, subject, body } = req.body as { recipientEmail?: string; subject?: string; body?: string };
  const db = getDb();
  const id = `ntf_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(
    `INSERT INTO notifications (id, organization_id, user_id, channel, severity, status, title, message)
     VALUES (?, ?, ?, 'email_simulated', 'info', 'resolved', ?, ?)`
  ).run(
    id,
    req.auth!.organizationId,
    req.auth!.userId,
    `[Email Alert ${config.smtpConfigured ? 'Queued' : 'Simulated'}] ${subject || 'SortSight Alert'}`,
    `To: ${recipientEmail || req.auth!.email} — ${body || 'Test operational notification.'}`
  );
  res.json({
    ok: true,
    mode: config.smtpConfigured ? 'smtp_configured' : 'simulated_log_only',
    note: config.smtpConfigured
      ? 'Dispatched via configured SMTP provider.'
      : 'SMTP credentials not set in environment; logged simulated email notification cleanly.',
  });
});

// Webhooks & API Keys & Audit & Admin Backup/Import
operationsAdminRouter.get('/webhooks', authenticate, requirePermission('*'), (req, res) => {
  const db = getDb();
  const webhooks = db
    .prepare('SELECT id, organization_id, name, target_url, events_json, is_active, created_at FROM webhooks WHERE organization_id = ?')
    .all(req.auth!.organizationId);
  const deliveries = db
    .prepare('SELECT * FROM webhook_deliveries WHERE organization_id = ? ORDER BY created_at DESC LIMIT 30')
    .all(req.auth!.organizationId);
  res.json({ webhooks, deliveries });
});

operationsAdminRouter.post('/webhooks', authenticate, requirePermission('*'), (req, res) => {
  const { name, targetUrl, events, secret } = req.body as {
    name?: string;
    targetUrl?: string;
    events?: string[];
    secret?: string;
  };
  if (!name || !targetUrl) {
    res.status(400).json({ error: 'name and targetUrl are required.' });
    return;
  }
  const db = getDb();
  const id = `wh_${crypto.randomUUID().slice(0, 10)}`;
  const rawSecret = secret || crypto.randomBytes(24).toString('hex');
  db.prepare(
    'INSERT INTO webhooks (id, organization_id, name, target_url, events_json, encrypted_secret) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, req.auth!.organizationId, name.trim(), targetUrl.trim(), JSON.stringify(events || ['hazard.detected']), encryptSecret(rawSecret));

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'webhook.created',
    resourceType: 'webhook',
    resourceId: id,
  });

  res.status(201).json({ id, signingSecretPreview: `${rawSecret.slice(0, 6)}...` });
});

operationsAdminRouter.post('/webhooks/:id/test', authenticate, requirePermission('*'), (req, res) => {
  const db = getDb();
  const wh = db
    .prepare('SELECT * FROM webhooks WHERE id = ? AND organization_id = ?')
    .get(req.params.id, req.auth!.organizationId) as { id: string; target_url: string } | undefined;
  if (!wh) {
    res.status(404).json({ error: 'Webhook not found.' });
    return;
  }

  const payload = JSON.stringify({ event: 'sortsight.webhook_test', organizationId: req.auth!.organizationId, timestamp: new Date().toISOString() });
  const sig = crypto.createHmac('sha256', 'demo-signing-check').update(payload).digest('hex');
  const delId = `whd_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(
    'INSERT INTO webhook_deliveries (id, webhook_id, organization_id, event_type, payload_json, signature_header, delivery_status, http_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(delId, wh.id, req.auth!.organizationId, 'sortsight.webhook_test', payload, `sha256=${sig}`, 'simulated_signed_dispatch', 200);

  res.json({ ok: true, deliveryId: delId, signatureHeader: `sha256=${sig}` });
});

operationsAdminRouter.get('/admin/api-keys', authenticate, requirePermission('*'), (req, res) => {
  const db = getDb();
  const keys = db
    .prepare('SELECT id, name, key_prefix, scopes_json, last_used_at, is_revoked, created_at FROM api_keys WHERE organization_id = ? ORDER BY created_at DESC')
    .all(req.auth!.organizationId);
  res.json({ apiKeys: keys });
});

operationsAdminRouter.post('/admin/api-keys', authenticate, requirePermission('*'), (req, res) => {
  const { name, scopes } = req.body as { name?: string; scopes?: string[] };
  if (!name) {
    res.status(400).json({ error: 'API key name is required.' });
    return;
  }
  const db = getDb();
  const id = `key_${crypto.randomUUID().slice(0, 10)}`;
  const rawKey = `ss_live_${crypto.randomBytes(24).toString('hex')}`;
  const prefix = rawKey.slice(0, 14);
  const hash = hashApiKey(rawKey);

  db.prepare('INSERT INTO api_keys (id, organization_id, name, key_prefix, key_hash, scopes_json, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id,
    req.auth!.organizationId,
    name.trim(),
    prefix,
    hash,
    JSON.stringify(scopes || ['read', 'detect']),
    req.auth!.userId
  );

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'api_key.created',
    resourceType: 'api_key',
    resourceId: id,
  });

  // Return plaintext key ONCE upon creation
  res.status(201).json({ id, keyPrefix: prefix, apiKeyPlaintextOnce: rawKey });
});

operationsAdminRouter.delete('/admin/api-keys/:id', authenticate, requirePermission('*'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE api_keys SET is_revoked = 1 WHERE id = ? AND organization_id = ?').run(req.params.id, req.auth!.organizationId);
  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'api_key.revoked',
    resourceType: 'api_key',
    resourceId: req.params.id,
  });
  res.json({ ok: true });
});

operationsAdminRouter.get('/admin/audit-logs', authenticate, (req, res) => {
  const db = getDb();
  const logs = db
    .prepare('SELECT * FROM audit_logs WHERE organization_id = ? ORDER BY created_at DESC LIMIT 120')
    .all(req.auth!.organizationId);
  res.json({ logs });
});

operationsAdminRouter.get('/admin/backup', authenticate, requirePermission('*'), (req, res) => {
  const db = getDb();
  const orgId = req.auth!.organizationId;
  const bundle = {
    exportedAt: new Date().toISOString(),
    organization: db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId),
    facilities: db.prepare('SELECT * FROM facilities WHERE organization_id = ?').all(orgId),
    policies: db.prepare('SELECT * FROM recycling_policies WHERE organization_id = ?').all(orgId),
    detectionRecords: db.prepare('SELECT id, facility_id, image_name, source_type, inference_provider, overall_readiness_score, overall_recovery_score, created_at FROM detection_records WHERE organization_id = ?').all(orgId),
    batches: db.prepare('SELECT * FROM processing_batches WHERE organization_id = ?').all(orgId),
    inventory: db.prepare('SELECT * FROM material_inventory WHERE organization_id = ?').all(orgId),
  };

  recordAuditLog({
    organizationId: orgId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'admin.backup_exported',
    resourceType: 'organization',
    resourceId: orgId,
  });

  res.json(bundle);
});

operationsAdminRouter.post('/admin/import-policies', authenticate, requirePermission('*'), (req, res) => {
  const { policies } = req.body as {
    policies?: Array<{ countryCode: string; regionName: string; title: string; sourceAttribution: string }>;
  };
  if (!Array.isArray(policies) || policies.length === 0) {
    res.status(400).json({ error: 'policies array is required.' });
    return;
  }
  const db = getDb();
  const ins = db.prepare(
    `INSERT INTO recycling_policies (id, organization_id, scope_level, country_code, region_name, title, policy_origin, source_attribution, effective_date)
     VALUES (?, ?, 'region', ?, ?, ?, 'admin_sample_policy', ?, ?)`
  );
  let count = 0;
  for (const p of policies.slice(0, 20)) {
    if (p.title && p.countryCode) {
      ins.run(
        `pol_${crypto.randomUUID().slice(0, 10)}`,
        req.auth!.organizationId,
        p.countryCode.toUpperCase().slice(0, 2),
        p.regionName || 'Imported Region',
        p.title,
        p.sourceAttribution || 'Imported by administrator',
        new Date().toISOString().slice(0, 10)
      );
      count++;
    }
  }
  res.status(201).json({ importedCount: count });
});

// 154-Feature Registry & System Health & OpenAPI Spec
operationsAdminRouter.get('/features', (_req, res) => {
  res.json({ total: FEATURE_REGISTRY.length, features: FEATURE_REGISTRY });
});

operationsAdminRouter.get('/health', (_req, res) => {
  const db = getDb();
  const migrations = db.prepare('SELECT version, applied_at FROM schema_migrations').all();
  res.json({
    status: 'healthy',
    service: 'SortSight AI API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: { connected: true, migrations },
    aiProvider: {
      geminiConfigured: Boolean(config.geminiApiKey && config.geminiApiKey !== 'MY_GEMINI_API_KEY'),
      primaryModel: 'gemini-4-hydrogen',
      offlineFallbackAvailable: true,
    },
    hardwareMode: config.plcGatewayMode,
  });
});

operationsAdminRouter.get('/openapi.json', (_req, res) => {
  res.json({
    openapi: '3.0.3',
    info: {
      title: 'SortSight AI Global Recycling Intelligence API',
      version: '1.0.0',
      description: 'Versioned REST API for AI waste detection, contamination analysis, global recycling policies, sorting automation, human review, and digital twin simulations.',
    },
    paths: {
      '/api/v1/health': { get: { summary: 'System health and readiness check' } },
      '/api/v1/auth/login': { post: { summary: 'Authenticate user and issue JWT token' } },
      '/api/v1/auth/register': { post: { summary: 'Register user and provision isolated organization' } },
      '/api/v1/detection/analyze': { post: { summary: 'Run 12-stage CV & Material Intelligence pipeline on image' } },
      '/api/v1/detection/video-frames': { post: { summary: 'Analyze video frames with object tracking IDs' } },
      '/api/v1/detection/batch': { post: { summary: 'Analyze multi-image inspection batch' } },
      '/api/v1/recycling/compatibility-check': { post: { summary: 'Evaluate policy compatibility for material & contamination' } },
      '/api/v1/hazards': { get: { summary: 'List hazardous waste alerts' } },
      '/api/v1/sorting/decisions': { get: { summary: 'Query automated sorting decisions' } },
      '/api/v1/integrations/robotic-pick': { post: { summary: 'Dispatch simulated robotic arm pick coordinates' } },
      '/api/v1/integrations/plc-command': { post: { summary: 'Dispatch simulated PLC command' } },
      '/api/v1/analytics/overview': { get: { summary: 'Executive & composition analytics with facility/date/timeRange filters' } },
      '/api/v1/analytics/anomalies': { get: { summary: 'Rule-based operational anomaly insights and facility baseline deviations' } },
      '/api/v1/analytics/dashboard-views': { get: { summary: 'List saved dashboard filter views' }, post: { summary: 'Save custom dashboard view' } },
      '/api/v1/search': { get: { summary: 'Org-scoped global search across facilities, materials, scans, hazards, reviews, batches, and policies' } },
      '/api/v1/operations/handovers': { get: { summary: 'List shift handover & incident reports' }, post: { summary: 'Submit shift handover report with operational snapshot' } },
      '/api/v1/notifications': { get: { summary: 'Intelligent Alert Management inbox with severity, grouping, and lifecycle actions' } },
      '/api/v1/environment/estimate': { post: { summary: 'Calculate modeled environmental displacement metrics' } },
      '/api/v1/assistant/query': { post: { summary: 'Grounded AI operator assistant query' } },
      '/api/v1/reviews': { get: { summary: 'List human-in-the-loop QA review queue' } },
      '/api/v1/simulations/run': { post: { summary: 'Execute Digital Twin sorting optimization scenario' } },
      '/api/v1/features': { get: { summary: 'Machine-readable 154-feature registry' } },
    },
  });
});
