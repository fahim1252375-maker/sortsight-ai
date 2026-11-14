import crypto from 'crypto';
import { Router } from 'express';
import { getDb } from '../db/database.ts';
import { authenticate, recordAuditLog, requirePermission } from '../middleware/auth.ts';
import { executeVisionPipeline } from '../services/visionPipeline.ts';

export const detectionRouter = Router();

// Single Image / Camera Frame AI Detection
detectionRouter.post('/detection/analyze', authenticate, requirePermission('detections:write'), async (req, res) => {
  try {
    const {
      facilityId,
      imageBase64DataUrl,
      imageName,
      sourceType,
      batchId,
      conveyorSessionId,
      storeHistory,
      preferredMode,
      trackOffset,
    } = req.body as {
      facilityId?: string;
      imageBase64DataUrl?: string;
      imageName?: string;
      sourceType?: 'upload' | 'camera' | 'video_frame' | 'batch' | 'conveyor_sim' | 'offline_edge';
      batchId?: string;
      conveyorSessionId?: string;
      storeHistory?: boolean;
      preferredMode?: 'cloud_gemini' | 'offline_edge';
      trackOffset?: number;
    };

    if (!facilityId || !imageBase64DataUrl) {
      res.status(400).json({ error: 'facilityId and imageBase64DataUrl are required.' });
      return;
    }

    const db = getDb();
    const result = await executeVisionPipeline(db, {
      organizationId: req.auth!.organizationId,
      facilityId,
      userId: req.auth!.userId,
      imageBase64DataUrl,
      imageName: imageName || 'inspection_frame.png',
      sourceType: sourceType || 'upload',
      batchId,
      conveyorSessionId,
      storeHistory,
      preferredMode,
      trackOffset,
    });

    if (result.hasHazards) {
      db.prepare(
        `INSERT INTO notifications (id, organization_id, channel, severity, title, message)
         VALUES (?, ?, 'in_app', 'critical', ?, ?)`
      ).run(
        `ntf_${crypto.randomUUID().slice(0, 10)}`,
        req.auth!.organizationId,
        `Hazard Detected in ${result.imageName}`,
        `Detection ${result.detectionRecordId} flagged hazardous item(s) requiring immediate isolation.`
      );
    }

    recordAuditLog({
      organizationId: req.auth!.organizationId,
      userId: req.auth!.userId,
      actorEmail: req.auth!.email,
      action: 'detection.analyzed',
      resourceType: 'detection_record',
      resourceId: result.detectionRecordId,
      details: {
        provider: result.inferenceProvider,
        objectCount: result.objects.length,
        hasHazards: result.hasHazards,
      },
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Vision detection failed.' });
  }
});

// Multi-Frame Video / Tracking Analysis
detectionRouter.post('/detection/video-frames', authenticate, requirePermission('detections:write'), async (req, res) => {
  try {
    const { facilityId, frames, preferredMode, storeHistory } = req.body as {
      facilityId?: string;
      frames?: Array<{ imageBase64DataUrl: string; imageName: string; timestampSec: number }>;
      preferredMode?: 'cloud_gemini' | 'offline_edge';
      storeHistory?: boolean;
    };

    if (!facilityId || !Array.isArray(frames) || frames.length === 0) {
      res.status(400).json({ error: 'facilityId and a non-empty frames array are required.' });
      return;
    }

    const db = getDb();
    const capped = frames.slice(0, 6);
    const results = [];
    for (let i = 0; i < capped.length; i++) {
      const frame = capped[i];
      const out = await executeVisionPipeline(db, {
        organizationId: req.auth!.organizationId,
        facilityId,
        userId: req.auth!.userId,
        imageBase64DataUrl: frame.imageBase64DataUrl,
        imageName: frame.imageName || `video_frame_${i + 1}.png`,
        sourceType: 'video_frame',
        storeHistory,
        preferredMode,
        trackOffset: i * 10,
      });
      results.push({ timestampSec: frame.timestampSec, ...out });
    }

    res.status(201).json({ frameCount: results.length, frames: results });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Video frame analysis failed.' });
  }
});

// Batch Image Analysis
detectionRouter.post('/detection/batch', authenticate, requirePermission('detections:write'), async (req, res) => {
  try {
    const { facilityId, images, preferredMode, storeHistory } = req.body as {
      facilityId?: string;
      images?: Array<{ imageBase64DataUrl: string; imageName: string }>;
      preferredMode?: 'cloud_gemini' | 'offline_edge';
      storeHistory?: boolean;
    };

    if (!facilityId || !Array.isArray(images) || images.length === 0) {
      res.status(400).json({ error: 'facilityId and a non-empty images array are required.' });
      return;
    }

    const db = getDb();
    const capped = images.slice(0, 10);
    const items = [];
    for (let i = 0; i < capped.length; i++) {
      const img = capped[i];
      const out = await executeVisionPipeline(db, {
        organizationId: req.auth!.organizationId,
        facilityId,
        userId: req.auth!.userId,
        imageBase64DataUrl: img.imageBase64DataUrl,
        imageName: img.imageName || `batch_item_${i + 1}.png`,
        sourceType: 'batch',
        storeHistory,
        preferredMode,
        trackOffset: i * 20,
      });
      items.push(out);
    }

    const avgReadiness = Math.round(items.reduce((s, r) => s + r.overallReadinessScore, 0) / items.length);
    const avgRecovery = Math.round(items.reduce((s, r) => s + r.overallRecoveryScore, 0) / items.length);
    const totalObjects = items.reduce((s, r) => s + r.objects.length, 0);
    const hazardFrames = items.filter((r) => r.hasHazards).length;

    res.status(201).json({
      processedCount: items.length,
      totalObjects,
      avgReadinessScore: avgReadiness,
      avgRecoveryScore: avgRecovery,
      hazardFrames,
      items,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Batch analysis failed.' });
  }
});

// Paginated Detection History with Search & Filters
detectionRouter.get('/detection/history', authenticate, (req, res) => {
  const db = getDb();
  const facilityId = String(req.query.facilityId || '').trim();
  const search = String(req.query.search || '').trim().toLowerCase();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
  const offset = Math.max(0, Number(req.query.offset || 0));

  let sql = `
    SELECT d.*, f.name as facility_name
    FROM detection_records d
    JOIN facilities f ON f.id = d.facility_id
    WHERE d.organization_id = ?
  `;
  const params: unknown[] = [req.auth!.organizationId];
  if (facilityId) {
    sql += ' AND d.facility_id = ?';
    params.push(facilityId);
  }
  if (search) {
    sql += ' AND (LOWER(d.image_name) LIKE ? OR LOWER(d.inference_provider) LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY d.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const records = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const getObjs = db.prepare('SELECT * FROM detection_objects WHERE detection_record_id = ? AND organization_id = ?');

  const enriched = records.map((r) => ({
    ...r,
    objects: getObjs.all(r.id, req.auth!.organizationId),
  }));

  res.json({ records: enriched, limit, offset });
});

// Single Detection Record Detail (with objects, contamination, hazards, reviews)
detectionRouter.get('/detection/history/:id', authenticate, (req, res) => {
  const db = getDb();
  const record = db
    .prepare(
      `SELECT d.*, f.name as facility_name, f.facility_code, f.city as facility_city, f.country_code as facility_country
       FROM detection_records d
       JOIN facilities f ON f.id = d.facility_id
       WHERE d.id = ? AND d.organization_id = ?`
    )
    .get(req.params.id, req.auth!.organizationId) as Record<string, unknown> | undefined;

  if (!record) {
    res.status(404).json({ error: 'Detection record not found in active organization.' });
    return;
  }

  const objects = db
    .prepare('SELECT * FROM detection_objects WHERE detection_record_id = ? AND organization_id = ? ORDER BY sorting_priority DESC')
    .all(req.params.id, req.auth!.organizationId);
  const contamination = db
    .prepare('SELECT * FROM contamination_records WHERE detection_record_id = ? AND organization_id = ?')
    .all(req.params.id, req.auth!.organizationId);
  const hazards = db
    .prepare('SELECT * FROM hazard_alerts WHERE detection_record_id = ? AND organization_id = ?')
    .all(req.params.id, req.auth!.organizationId);
  const reviews = db
    .prepare('SELECT * FROM human_reviews WHERE detection_record_id = ? AND organization_id = ?')
    .all(req.params.id, req.auth!.organizationId);

  res.json({ record, objects, contamination, hazards, reviews });
});

// Materials Taxonomy
detectionRouter.get('/materials/taxonomy', (_req, res) => {
  const db = getDb();
  const materials = db.prepare('SELECT * FROM material_categories ORDER BY parent_group, code').all();
  res.json({ materials });
});

// Single Material Detail (taxonomy + org policy acceptance rules + recent stats)
detectionRouter.get('/materials/taxonomy/:code', authenticate, (req, res) => {
  const db = getDb();
  const code = String(req.params.code || '').trim().toUpperCase();
  const material = db.prepare('SELECT * FROM material_categories WHERE UPPER(code) = ?').get(code) as Record<string, unknown> | undefined;
  if (!material) {
    res.status(404).json({ error: 'Material taxonomy entry not found.' });
    return;
  }

  const policyRules = db
    .prepare(
      `SELECT r.*, p.title as policy_title, p.country_code, p.region_name, p.policy_origin
       FROM material_acceptance_rules r
       JOIN recycling_policies p ON p.id = r.policy_id
       WHERE r.material_code = ? AND (p.organization_id = ? OR p.organization_id IS NULL)
       ORDER BY p.country_code, p.title`
    )
    .all(material.code, req.auth!.organizationId);

  const stats = db
    .prepare(
      `SELECT COUNT(*) as detection_count,
              ROUND(AVG(calibrated_confidence), 3) as avg_confidence,
              ROUND(AVG(recovery_score), 1) as avg_recovery_score,
              ROUND(AVG(readiness_score), 1) as avg_readiness_score
       FROM detection_objects
       WHERE organization_id = ? AND material_code = ?`
    )
    .get(req.auth!.organizationId, material.code);

  res.json({ material, policyRules, stats });
});

// Recycling Policies & Compatibility Checker
detectionRouter.get('/recycling/policies', authenticate, (req, res) => {
  const db = getDb();
  const country = String(req.query.country || '').trim().toUpperCase();
  let sql = 'SELECT * FROM recycling_policies WHERE (organization_id = ? OR organization_id IS NULL)';
  const params: unknown[] = [req.auth!.organizationId];
  if (country) {
    sql += ' AND country_code = ?';
    params.push(country);
  }
  sql += ' ORDER BY scope_level, country_code, created_at DESC';
  const policies = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const getRules = db.prepare(
    `SELECT r.*, m.name as material_name, m.parent_group, m.resin_or_standard_code
     FROM material_acceptance_rules r
     JOIN material_categories m ON m.code = r.material_code
     WHERE r.policy_id = ?
     ORDER BY m.parent_group, r.material_code`
  );
  res.json({
    policies: policies.map((p) => ({
      ...p,
      localizedInstructions: JSON.parse(String(p.localized_instructions_json || '{}')),
      rules: getRules.all(p.id),
    })),
  });
});

detectionRouter.post('/recycling/policies', authenticate, requirePermission('policies:write'), (req, res) => {
  const { facilityId, scopeLevel, countryCode, regionName, title, policyOrigin, sourceAttribution, effectiveDate, localizedInstructions } =
    req.body as {
      facilityId?: string;
      scopeLevel?: 'country' | 'region' | 'facility';
      countryCode?: string;
      regionName?: string;
      title?: string;
      policyOrigin?: 'admin_sample_policy' | 'facility_custom';
      sourceAttribution?: string;
      effectiveDate?: string;
      localizedInstructions?: Record<string, string>;
    };

  if (!title || !countryCode || !sourceAttribution) {
    res.status(400).json({ error: 'title, countryCode, and sourceAttribution are required.' });
    return;
  }
  const db = getDb();
  const id = `pol_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(
    `INSERT INTO recycling_policies (id, organization_id, facility_id, scope_level, country_code, region_name, title, policy_origin, source_attribution, effective_date, localized_instructions_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.auth!.organizationId,
    facilityId || null,
    scopeLevel || 'facility',
    countryCode.toUpperCase().slice(0, 2),
    regionName || 'Custom Region',
    title.trim(),
    policyOrigin || 'facility_custom',
    sourceAttribution.trim(),
    effectiveDate || new Date().toISOString().slice(0, 10),
    JSON.stringify(localizedInstructions || { en: 'Follow facility material acceptance thresholds.' })
  );

  // Copy baseline acceptance rules from material_categories
  const mats = db.prepare('SELECT code, default_recyclable FROM material_categories').all() as Array<{ code: string; default_recyclable: number }>;
  const insRule = db.prepare(
    'INSERT INTO material_acceptance_rules (id, policy_id, material_code, accepted, max_contamination_pct, requires_separation, target_bin, condition_notes, guidance_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const m of mats) {
    const isHaz = m.code === 'BATT_LI' || m.code === 'HAZ_CHEM';
    insRule.run(
      `rule_${crypto.randomUUID().slice(0, 8)}`,
      id,
      m.code,
      isHaz ? 0 : m.default_recyclable,
      isHaz ? 0 : 8.0,
      isHaz ? 1 : 0,
      isHaz ? 'chute_hazard_firebox' : m.default_recyclable ? 'chute_primary_recovery' : 'chute_reject_residue',
      isHaz ? 'Hazardous isolation required.' : 'Configurable policy rule.',
      isHaz ? 'Halt and quarantine.' : 'Sort per policy threshold.'
    );
  }

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'policy.created',
    resourceType: 'recycling_policy',
    resourceId: id,
    details: { title, countryCode },
  });

  res.status(201).json({ policyId: id });
});

detectionRouter.put('/recycling/rules/:id', authenticate, requirePermission('policies:write'), (req, res) => {
  const { accepted, maxContaminationPct, targetBin, conditionNotes, guidanceText } = req.body as {
    accepted?: boolean;
    maxContaminationPct?: number;
    targetBin?: string;
    conditionNotes?: string;
    guidanceText?: string;
  };
  const db = getDb();
  const rule = db
    .prepare(
      `SELECT r.id FROM material_acceptance_rules r
       JOIN recycling_policies p ON p.id = r.policy_id
       WHERE r.id = ? AND p.organization_id = ?`
    )
    .get(req.params.id, req.auth!.organizationId);

  if (!rule) {
    res.status(404).json({ error: 'Rule not found or unauthorized.' });
    return;
  }

  db.prepare(
    `UPDATE material_acceptance_rules SET
      accepted = COALESCE(?, accepted),
      max_contamination_pct = COALESCE(?, max_contamination_pct),
      target_bin = COALESCE(?, target_bin),
      condition_notes = COALESCE(?, condition_notes),
      guidance_text = COALESCE(?, guidance_text)
     WHERE id = ?`
  ).run(
    typeof accepted === 'boolean' ? (accepted ? 1 : 0) : null,
    typeof maxContaminationPct === 'number' ? maxContaminationPct : null,
    targetBin || null,
    conditionNotes || null,
    guidanceText || null,
    req.params.id
  );

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'policy.rule_updated',
    resourceType: 'material_acceptance_rule',
    resourceId: req.params.id,
  });

  res.json({ ok: true });
});

detectionRouter.post('/recycling/compatibility-check', authenticate, (req, res) => {
  const { policyId, materialCode, contaminationPct, hasFoodResidue, isMultilayer } = req.body as {
    policyId?: string;
    materialCode?: string;
    contaminationPct?: number;
    hasFoodResidue?: boolean;
    isMultilayer?: boolean;
  };
  if (!policyId || !materialCode) {
    res.status(400).json({ error: 'policyId and materialCode are required.' });
    return;
  }
  const db = getDb();
  const policy = db
    .prepare('SELECT id, title, policy_origin, source_attribution FROM recycling_policies WHERE id = ? AND (organization_id = ? OR organization_id IS NULL)')
    .get(policyId, req.auth!.organizationId) as
    | { id: string; title: string; policy_origin: string; source_attribution: string }
    | undefined;
  if (!policy) {
    res.status(404).json({ error: 'Policy not found.' });
    return;
  }
  const rule = db
    .prepare('SELECT * FROM material_acceptance_rules WHERE policy_id = ? AND material_code = ?')
    .get(policyId, materialCode) as
    | { accepted: number; max_contamination_pct: number; target_bin: string; condition_notes: string; guidance_text: string }
    | undefined;

  const contam = Number(contaminationPct || 0);
  const compatible = Boolean(rule && rule.accepted === 1 && contam <= rule.max_contamination_pct && !isMultilayer && !hasFoodResidue);

  res.json({
    compatible,
    status:
      materialCode === 'BATT_LI' || materialCode === 'HAZ_CHEM'
        ? 'hazardous_prohibited'
        : compatible
          ? 'accepted'
          : rule?.accepted === 1
            ? 'conditional_contamination_exceeded'
            : 'rejected',
    policy,
    rule: rule || null,
    explanation: compatible
      ? `Accepted under ${policy.title}. Contamination (${contam}%) is within ${rule?.max_contamination_pct}% limit.`
      : `Not eligible for primary recovery under ${policy.title}. ${isMultilayer ? 'Multi-layer laminate barrier detected. ' : ''}${hasFoodResidue ? 'Food residue exceeds fiber/polymer spec. ' : ''}${rule?.condition_notes || ''}`,
  });
});

detectionRouter.get('/recycling/regional-summary', authenticate, (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.country_code, p.region_name, p.title, p.policy_origin, p.effective_date,
              SUM(CASE WHEN r.accepted = 1 THEN 1 ELSE 0 END) as accepted_materials_count,
              COUNT(r.id) as total_rules_count
       FROM recycling_policies p
       LEFT JOIN material_acceptance_rules r ON r.policy_id = p.id
       WHERE p.organization_id = ? OR p.organization_id IS NULL
       GROUP BY p.id`
    )
    .all(req.auth!.organizationId);
  res.json({ regionalSummary: rows });
});

// Contamination & Hazard Endpoints
detectionRouter.get('/contamination', authenticate, (req, res) => {
  const db = getDb();
  const facilityId = String(req.query.facilityId || '').trim();
  let sql = `
    SELECT c.*, f.name as facility_name, d.image_name
    FROM contamination_records c
    JOIN facilities f ON f.id = c.facility_id
    JOIN detection_records d ON d.id = c.detection_record_id
    WHERE c.organization_id = ?
  `;
  const params: unknown[] = [req.auth!.organizationId];
  if (facilityId) {
    sql += ' AND c.facility_id = ?';
    params.push(facilityId);
  }
  sql += ' ORDER BY c.created_at DESC LIMIT 100';
  res.json({ records: db.prepare(sql).all(...params) });
});

detectionRouter.get('/hazards', authenticate, (req, res) => {
  const db = getDb();
  const status = String(req.query.status || '').trim();
  let sql = `
    SELECT h.*, f.name as facility_name
    FROM hazard_alerts h
    JOIN facilities f ON f.id = h.facility_id
    WHERE h.organization_id = ?
  `;
  const params: unknown[] = [req.auth!.organizationId];
  if (status) {
    sql += ' AND h.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY h.created_at DESC LIMIT 100';
  res.json({
    disclaimer:
      'SortSight AI hazard alerts are generated from visual indicators only. Visual detection does NOT establish chemical safety or inertness. Always follow physical PPE & HazMat protocols.',
    hazards: db.prepare(sql).all(...params),
  });
});

detectionRouter.get('/hazards/:id', authenticate, (req, res) => {
  const db = getDb();
  const hazard = db
    .prepare(
      `SELECT h.*, f.name as facility_name, f.facility_code, f.city as facility_city, f.country_code as facility_country,
              d.image_name, d.image_data_url, d.inference_provider, d.created_at as detected_at
       FROM hazard_alerts h
       JOIN facilities f ON f.id = h.facility_id
       LEFT JOIN detection_records d ON d.id = h.detection_record_id
       WHERE h.id = ? AND h.organization_id = ?`
    )
    .get(req.params.id, req.auth!.organizationId) as Record<string, unknown> | undefined;

  if (!hazard) {
    res.status(404).json({ error: 'Hazard alert not found in active organization.' });
    return;
  }

  const object = hazard.detection_object_id
    ? db
        .prepare('SELECT * FROM detection_objects WHERE id = ? AND organization_id = ?')
        .get(hazard.detection_object_id, req.auth!.organizationId)
    : null;

  res.json({
    disclaimer:
      'SortSight AI hazard alerts are generated from visual indicators only. Visual detection does NOT establish chemical safety or inertness. Always follow physical PPE & HazMat protocols.',
    hazard,
    object,
  });
});

detectionRouter.post('/hazards/:id/status', authenticate, requirePermission('hazards:acknowledge'), (req, res) => {
  const { status } = req.body as { status?: 'acknowledged' | 'isolated' | 'resolved' | 'escalated' };
  if (!status || !['acknowledged', 'isolated', 'resolved', 'escalated'].includes(status)) {
    res.status(400).json({ error: 'Valid status (acknowledged, isolated, resolved, escalated) is required.' });
    return;
  }
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM hazard_alerts WHERE id = ? AND organization_id = ?')
    .get(req.params.id, req.auth!.organizationId);
  if (!existing) {
    res.status(404).json({ error: 'Hazard alert not found in active organization.' });
    return;
  }

  db.prepare("UPDATE hazard_alerts SET status = ?, acknowledged_by = ?, acknowledged_at = datetime('now') WHERE id = ?").run(
    status,
    req.auth!.userId,
    req.params.id
  );

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: `hazard.${status}`,
    resourceType: 'hazard_alert',
    resourceId: req.params.id,
  });

  res.json({ ok: true, status });
});
