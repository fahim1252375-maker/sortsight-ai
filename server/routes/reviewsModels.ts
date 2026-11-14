import crypto from 'crypto';
import { Router } from 'express';
import { getDb } from '../db/database.ts';
import { authenticate, recordAuditLog, requirePermission } from '../middleware/auth.ts';

export const reviewsModelsRouter = Router();

// Human-in-the-Loop Review Queue
reviewsModelsRouter.get('/reviews', authenticate, (req, res) => {
  const db = getDb();
  const status = String(req.query.status || '').trim();
  let sql = `
    SELECT hr.*, f.name as facility_name, d.image_name, d.image_data_url,
           o.label as original_label, o.bbox_json, o.explanation, u.full_name as reviewer_name
    FROM human_reviews hr
    JOIN facilities f ON f.id = hr.facility_id
    JOIN detection_records d ON d.id = hr.detection_record_id
    LEFT JOIN detection_objects o ON o.id = hr.detection_object_id
    LEFT JOIN users u ON u.id = hr.reviewer_user_id
    WHERE hr.organization_id = ?
  `;
  const params: unknown[] = [req.auth!.organizationId];
  if (status) {
    sql += ' AND hr.review_status = ?';
    params.push(status);
  }
  sql += ' ORDER BY CASE WHEN hr.review_status = \'pending\' THEN 0 ELSE 1 END, hr.created_at DESC LIMIT 100';
  res.json({ reviews: db.prepare(sql).all(...params) });
});

reviewsModelsRouter.post('/reviews/:id/resolve', authenticate, requirePermission('reviews:write'), (req, res) => {
  const { decision, correctedMaterialCode, correctedRecyclableStatus, reviewerNotes } = req.body as {
    decision?: 'verified_correct' | 'corrected' | 'escalated_expert';
    correctedMaterialCode?: string;
    correctedRecyclableStatus?: string;
    reviewerNotes?: string;
  };
  if (!decision || !['verified_correct', 'corrected', 'escalated_expert'].includes(decision)) {
    res.status(400).json({ error: 'Valid decision (verified_correct, corrected, escalated_expert) is required.' });
    return;
  }

  const db = getDb();
  const rev = db
    .prepare('SELECT * FROM human_reviews WHERE id = ? AND organization_id = ?')
    .get(req.params.id, req.auth!.organizationId) as
    | { id: string; original_material_code: string; detection_object_id: string | null }
    | undefined;

  if (!rev) {
    res.status(404).json({ error: 'Review item not found in active organization.' });
    return;
  }

  db.prepare(
    `UPDATE human_reviews SET
      review_status = ?,
      corrected_material_code = ?,
      corrected_recyclable_status = ?,
      reviewer_user_id = ?,
      reviewer_notes = ?,
      reviewed_at = datetime('now')
     WHERE id = ?`
  ).run(
    decision,
    correctedMaterialCode || rev.original_material_code,
    correctedRecyclableStatus || null,
    req.auth!.userId,
    reviewerNotes || '',
    rev.id
  );

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: `review.${decision}`,
    resourceType: 'human_review',
    resourceId: rev.id,
    details: { original: rev.original_material_code, corrected: correctedMaterialCode },
  });

  res.json({ ok: true, review: db.prepare('SELECT * FROM human_reviews WHERE id = ?').get(rev.id) });
});

reviewsModelsRouter.post('/reviews/:id/promote-dataset', authenticate, requirePermission('annotations:write'), (req, res) => {
  const { datasetId } = req.body as { datasetId?: string };
  const db = getDb();
  const rev = db
    .prepare(
      `SELECT hr.*, d.image_name, o.bbox_json
       FROM human_reviews hr
       JOIN detection_records d ON d.id = hr.detection_record_id
       LEFT JOIN detection_objects o ON o.id = hr.detection_object_id
       WHERE hr.id = ? AND hr.organization_id = ?`
    )
    .get(req.params.id, req.auth!.organizationId) as
    | { id: string; detection_record_id: string; image_name: string; bbox_json: string | null; corrected_material_code: string | null; original_material_code: string }
    | undefined;

  if (!rev) {
    res.status(404).json({ error: 'Review item not found.' });
    return;
  }

  const targetDs = datasetId || 'ds_gothenburg_corrected';
  const ds = db.prepare('SELECT id FROM datasets WHERE id = ? AND organization_id = ?').get(targetDs, req.auth!.organizationId);
  if (!ds) {
    res.status(404).json({ error: 'Target dataset not found in active organization.' });
    return;
  }

  const annId = `ann_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(
    `INSERT INTO dataset_annotations (id, dataset_id, organization_id, detection_record_id, image_label, bbox_json, material_code, annotator_user_id, verification_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'verified')`
  ).run(
    annId,
    targetDs,
    req.auth!.organizationId,
    rev.detection_record_id,
    rev.image_name,
    rev.bbox_json || '[100,100,400,400]',
    rev.corrected_material_code || rev.original_material_code,
    req.auth!.userId
  );

  db.prepare("UPDATE human_reviews SET review_status = 'added_to_dataset' WHERE id = ?").run(rev.id);
  db.prepare('UPDATE datasets SET sample_count = sample_count + 1 WHERE id = ?').run(targetDs);

  res.status(201).json({ annotationId: annId, datasetId: targetDs });
});

reviewsModelsRouter.get('/reviews/errors', authenticate, (req, res) => {
  const db = getDb();
  const pairs = db
    .prepare(
      `SELECT original_material_code, COALESCE(corrected_material_code, original_material_code) as corrected_material_code,
              COUNT(*) as occurrence_count,
              ROUND(AVG(original_confidence), 3) as avg_original_confidence
       FROM human_reviews
       WHERE organization_id = ? AND review_status IN ('corrected', 'added_to_dataset')
       GROUP BY original_material_code, corrected_material_code
       ORDER BY occurrence_count DESC`
    )
    .all(req.auth!.organizationId);
  res.json({ errorPairs: pairs });
});

reviewsModelsRouter.get('/reviews/:id', authenticate, (req, res) => {
  const db = getDb();
  const review = db
    .prepare(
      `SELECT hr.*, f.name as facility_name, d.image_name, d.image_data_url, d.inference_provider,
              o.label as original_label, o.bbox_json, o.explanation, o.visual_cues_json, o.recyclability_reason,
              u.full_name as reviewer_name
       FROM human_reviews hr
       JOIN facilities f ON f.id = hr.facility_id
       JOIN detection_records d ON d.id = hr.detection_record_id
       LEFT JOIN detection_objects o ON o.id = hr.detection_object_id
       LEFT JOIN users u ON u.id = hr.reviewer_user_id
       WHERE hr.id = ? AND hr.organization_id = ?`
    )
    .get(req.params.id, req.auth!.organizationId);

  if (!review) {
    res.status(404).json({ error: 'Review item not found in active organization.' });
    return;
  }

  res.json({ review });
});

// Annotation Workspace
reviewsModelsRouter.get('/annotations', authenticate, (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.*, d.name as dataset_name, u.full_name as annotator_name
       FROM dataset_annotations a
       JOIN datasets d ON d.id = a.dataset_id
       LEFT JOIN users u ON u.id = a.annotator_user_id
       WHERE a.organization_id = ?
       ORDER BY a.created_at DESC LIMIT 100`
    )
    .all(req.auth!.organizationId);
  res.json({ annotations: rows });
});

reviewsModelsRouter.post('/annotations', authenticate, requirePermission('annotations:write'), (req, res) => {
  const { datasetId, imageLabel, bbox, materialCode, contaminationFlags } = req.body as {
    datasetId?: string;
    imageLabel?: string;
    bbox?: [number, number, number, number];
    materialCode?: string;
    contaminationFlags?: string[];
  };
  if (!datasetId || !imageLabel || !materialCode) {
    res.status(400).json({ error: 'datasetId, imageLabel, and materialCode are required.' });
    return;
  }
  const db = getDb();
  const ds = db.prepare('SELECT id FROM datasets WHERE id = ? AND organization_id = ?').get(datasetId, req.auth!.organizationId);
  if (!ds) {
    res.status(404).json({ error: 'Dataset not found in active organization.' });
    return;
  }
  const id = `ann_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(
    `INSERT INTO dataset_annotations (id, dataset_id, organization_id, image_label, bbox_json, material_code, contamination_flags_json, annotator_user_id, verification_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'verified')`
  ).run(
    id,
    datasetId,
    req.auth!.organizationId,
    imageLabel.trim(),
    JSON.stringify(bbox || [150, 150, 550, 550]),
    materialCode,
    JSON.stringify(contaminationFlags || []),
    req.auth!.userId
  );
  db.prepare('UPDATE datasets SET sample_count = sample_count + 1 WHERE id = ?').run(datasetId);

  res.status(201).json({ annotation: db.prepare('SELECT * FROM dataset_annotations WHERE id = ?').get(id) });
});

// Datasets & Versioning
reviewsModelsRouter.get('/datasets', authenticate, (req, res) => {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM datasets WHERE organization_id = ? OR organization_id IS NULL ORDER BY created_at DESC')
    .all(req.auth!.organizationId);
  res.json({ datasets: rows });
});

reviewsModelsRouter.post('/datasets', authenticate, requirePermission('annotations:write'), (req, res) => {
  const { name, versionTag, license, provenanceUrl, splitStrategy, limitationsNotes } = req.body as {
    name?: string;
    versionTag?: string;
    license?: string;
    provenanceUrl?: string;
    splitStrategy?: string;
    limitationsNotes?: string;
  };
  if (!name || !versionTag || !license) {
    res.status(400).json({ error: 'name, versionTag, and license are required.' });
    return;
  }
  const db = getDb();
  const id = `ds_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(
    `INSERT INTO datasets (id, organization_id, name, version_tag, license, provenance_url, split_strategy, limitations_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.auth!.organizationId,
    name.trim(),
    versionTag.trim(),
    license.trim(),
    provenanceUrl || 'internal://custom-dataset',
    splitStrategy || '70/15/15 stratified',
    limitationsNotes || 'Organization curated dataset.'
  );
  res.status(201).json({ dataset: db.prepare('SELECT * FROM datasets WHERE id = ?').get(id) });
});

// AI Model Management, Training Pipeline Metadata, Evaluation, Calibration & Drift
reviewsModelsRouter.get('/models', authenticate, (req, res) => {
  const db = getDb();
  const models = db
    .prepare('SELECT * FROM ai_models WHERE organization_id = ? OR organization_id IS NULL')
    .all(req.auth!.organizationId) as Array<Record<string, unknown>>;
  const getVersions = db.prepare('SELECT * FROM model_versions WHERE model_id = ? ORDER BY created_at DESC');

  res.json({
    models: models.map((m) => ({
      ...m,
      versions: (getVersions.all(m.id) as Array<Record<string, unknown>>).map((v) => ({
        ...v,
        confusionMatrix: JSON.parse(String(v.confusion_matrix_json || '{}')),
        classMetrics: JSON.parse(String(v.class_metrics_json || '[]')),
      })),
    })),
  });
});

reviewsModelsRouter.post('/models/training-jobs', authenticate, requirePermission('*'), (req, res) => {
  const { modelId, versionTag, datasetId, trainingMode, notes } = req.body as {
    modelId?: string;
    versionTag?: string;
    datasetId?: string;
    trainingMode?: 'transfer_learning' | 'domain_adaptation' | 'fine_tuned';
    notes?: string;
  };
  if (!modelId || !versionTag) {
    res.status(400).json({ error: 'modelId and versionTag are required.' });
    return;
  }
  const db = getDb();
  const verId = `mver_${crypto.randomUUID().slice(0, 10)}`;
  // Honest: creates a candidate staging/evaluated metadata job awaiting external PyTorch training & human approval (never claims fabricated GPU training)
  db.prepare(
    `INSERT INTO model_versions (id, model_id, version_tag, dataset_id, training_mode, status, edge_compatible, notes)
     VALUES (?, ?, ?, ?, ?, 'staging', 1, ?)`
  ).run(
    verId,
    modelId,
    versionTag.trim(),
    datasetId || 'ds_gothenburg_corrected',
    trainingMode || 'transfer_learning',
    notes || 'Registered candidate training/adaptation job; execute ml/train_eval_reference.py and run approval gate before production.'
  );

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'model.training_job_registered',
    resourceType: 'model_version',
    resourceId: verId,
    details: { modelId, versionTag, trainingMode },
  });

  res.status(201).json({ version: db.prepare('SELECT * FROM model_versions WHERE id = ?').get(verId) });
});

reviewsModelsRouter.post('/models/versions/:id/approve', authenticate, requirePermission('*'), (req, res) => {
  const db = getDb();
  const ver = db.prepare('SELECT * FROM model_versions WHERE id = ?').get(req.params.id) as { id: string; model_id: string } | undefined;
  if (!ver) {
    res.status(404).json({ error: 'Model version not found.' });
    return;
  }

  db.prepare("UPDATE model_versions SET status = 'archived' WHERE model_id = ? AND status = 'production'").run(ver.model_id);
  db.prepare("UPDATE model_versions SET status = 'production', approved_by = ?, approved_at = datetime('now') WHERE id = ?").run(
    req.auth!.userId,
    ver.id
  );

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'model.version_approved',
    resourceType: 'model_version',
    resourceId: ver.id,
  });

  res.json({ ok: true, version: db.prepare('SELECT * FROM model_versions WHERE id = ?').get(ver.id) });
});

reviewsModelsRouter.get('/models/drift', authenticate, (req, res) => {
  const db = getDb();
  const dist = db
    .prepare(
      `SELECT material_code, COUNT(*) as count, ROUND(AVG(calibrated_confidence), 3) as avg_conf,
              SUM(is_low_confidence) as low_conf_count
       FROM detection_objects
       WHERE organization_id = ?
       GROUP BY material_code
       ORDER BY count DESC`
    )
    .all(req.auth!.organizationId) as Array<{ material_code: string; count: number; avg_conf: number; low_conf_count: number }>;

  const total = dist.reduce((s, r) => s + r.count, 0);
  const lowConfTotal = dist.reduce((s, r) => s + r.low_conf_count, 0);
  const lowConfRatio = total > 0 ? Number((lowConfTotal / total).toFixed(3)) : 0;

  res.json({
    sampleSize: total,
    lowConfidenceRate: lowConfRatio,
    driftAlertLevel: lowConfRatio > 0.25 ? 'elevated' : 'nominal',
    materialDistribution: dist,
  });
});

reviewsModelsRouter.get('/models/telemetry', authenticate, (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT inference_provider, COUNT(*) as call_count, ROUND(AVG(inference_latency_ms), 1) as avg_latency_ms,
              MIN(inference_latency_ms) as min_latency_ms, MAX(inference_latency_ms) as max_latency_ms
       FROM detection_records
       WHERE organization_id = ?
       GROUP BY inference_provider`
    )
    .all(req.auth!.organizationId);
  res.json({ telemetry: rows });
});

reviewsModelsRouter.get('/models/:id', authenticate, (req, res) => {
  const db = getDb();
  const model = db
    .prepare('SELECT * FROM ai_models WHERE id = ? AND (organization_id = ? OR organization_id IS NULL)')
    .get(req.params.id, req.auth!.organizationId) as Record<string, unknown> | undefined;

  if (!model) {
    res.status(404).json({ error: 'AI model not found.' });
    return;
  }

  const versions = (
    db.prepare('SELECT * FROM model_versions WHERE model_id = ? ORDER BY created_at DESC').all(model.id) as Array<Record<string, unknown>>
  ).map((v) => ({
    ...v,
    confusionMatrix: JSON.parse(String(v.confusion_matrix_json || '{}')),
    classMetrics: JSON.parse(String(v.class_metrics_json || '[]')),
  }));

  res.json({ model: { ...model, versions } });
});
