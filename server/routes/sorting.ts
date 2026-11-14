import crypto from 'crypto';
import { Router } from 'express';
import { getDb } from '../db/database.ts';
import { authenticate, recordAuditLog, requirePermission } from '../middleware/auth.ts';

export const sortingRouter = Router();

sortingRouter.get('/sorting/config', authenticate, (req, res) => {
  const db = getDb();
  const facilityId = String(req.query.facilityId || '').trim();
  let row;
  if (facilityId) {
    row = db
      .prepare('SELECT * FROM sorting_configurations WHERE organization_id = ? AND facility_id = ? ORDER BY updated_at DESC LIMIT 1')
      .get(req.auth!.organizationId, facilityId) as Record<string, unknown> | undefined;
  } else {
    row = db
      .prepare('SELECT * FROM sorting_configurations WHERE organization_id = ? ORDER BY updated_at DESC LIMIT 1')
      .get(req.auth!.organizationId) as Record<string, unknown> | undefined;
  }
  res.json({
    config: row ? { ...row, rules: JSON.parse(String(row.rules_json || '{}')) } : null,
  });
});

sortingRouter.put('/sorting/config', authenticate, requirePermission('sorting:write'), (req, res) => {
  const { id, minConfidenceAutoSort, maxContaminationPct, rules } = req.body as {
    id?: string;
    minConfidenceAutoSort?: number;
    maxContaminationPct?: number;
    rules?: Record<string, unknown>;
  };
  if (!id) {
    res.status(400).json({ error: 'Sorting configuration id is required.' });
    return;
  }
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM sorting_configurations WHERE id = ? AND organization_id = ?')
    .get(id, req.auth!.organizationId);
  if (!existing) {
    res.status(404).json({ error: 'Sorting configuration not found in active organization.' });
    return;
  }

  db.prepare(
    `UPDATE sorting_configurations SET
      min_confidence_auto_sort = COALESCE(?, min_confidence_auto_sort),
      max_contamination_pct = COALESCE(?, max_contamination_pct),
      rules_json = COALESCE(?, rules_json),
      updated_at = datetime('now')
     WHERE id = ? AND organization_id = ?`
  ).run(
    typeof minConfidenceAutoSort === 'number' ? Math.max(0.3, Math.min(0.99, minConfidenceAutoSort)) : null,
    typeof maxContaminationPct === 'number' ? Math.max(0.5, Math.min(50, maxContaminationPct)) : null,
    rules ? JSON.stringify(rules) : null,
    id,
    req.auth!.organizationId
  );

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'sorting.config_updated',
    resourceType: 'sorting_configuration',
    resourceId: id,
    details: { minConfidenceAutoSort, maxContaminationPct },
  });

  res.json({ ok: true });
});

sortingRouter.get('/sorting/decisions', authenticate, (req, res) => {
  const db = getDb();
  const facilityId = String(req.query.facilityId || '').trim();
  let sql = `
    SELECT s.*, f.name as facility_name
    FROM sorting_decisions s
    JOIN facilities f ON f.id = s.facility_id
    WHERE s.organization_id = ?
  `;
  const params: unknown[] = [req.auth!.organizationId];
  if (facilityId) {
    sql += ' AND s.facility_id = ?';
    params.push(facilityId);
  }
  sql += ' ORDER BY s.created_at DESC LIMIT 80';
  res.json({ decisions: db.prepare(sql).all(...params) });
});

sortingRouter.get('/sorting/metrics', authenticate, (req, res) => {
  const db = getDb();
  const totalDecisions = (
    db.prepare('SELECT COUNT(*) as c FROM sorting_decisions WHERE organization_id = ?').get(req.auth!.organizationId) as { c: number }
  ).c;
  const rejectCount = (
    db
      .prepare('SELECT COUNT(*) as c FROM sorting_decisions WHERE organization_id = ? AND is_rejection_stream = 1')
      .get(req.auth!.organizationId) as { c: number }
  ).c;
  const reviewStats = db
    .prepare(
      `SELECT
         SUM(CASE WHEN review_status = 'verified_correct' THEN 1 ELSE 0 END) as verified_correct,
         SUM(CASE WHEN review_status = 'corrected' THEN 1 ELSE 0 END) as corrected,
         COUNT(*) as total_reviewed
       FROM human_reviews WHERE organization_id = ? AND review_status != 'pending'`
    )
    .get(req.auth!.organizationId) as { verified_correct: number | null; corrected: number | null; total_reviewed: number };

  const verified = reviewStats.verified_correct || 0;
  const reviewed = reviewStats.total_reviewed || 0;
  const measuredAccuracyPct = reviewed > 0 ? Number(((verified / reviewed) * 100).toFixed(1)) : null;

  res.json({
    totalDecisions,
    rejectCount,
    rejectionRatePct: totalDecisions > 0 ? Number(((rejectCount / totalDecisions) * 100).toFixed(1)) : 0,
    measuredAccuracyPct,
    reviewedSampleCount: reviewed,
    optimizationAdvice:
      rejectCount > totalDecisions * 0.35
        ? 'Rejection stream exceeds 35% of decisions. Review pre-sort moisture/food contamination intake or widen conditional tolerance.'
        : 'Sorting reject ratio is within nominal operational range.',
  });
});

// Conveyor Belt Monitoring & Simulated Real-Time Decision Engine
sortingRouter.get('/conveyor/sessions', authenticate, (req, res) => {
  const db = getDb();
  const sessions = db
    .prepare(
      `SELECT c.*, f.name as facility_name
       FROM conveyor_sessions c
       JOIN facilities f ON f.id = c.facility_id
       WHERE c.organization_id = ?
       ORDER BY c.started_at DESC`
    )
    .all(req.auth!.organizationId);
  res.json({
    simulatorNotice: 'Conveyor telemetry operates in local SIMULATOR mode unless connected to an on-site PLC gateway.',
    sessions,
  });
});

sortingRouter.get('/conveyor/sessions/:id', authenticate, (req, res) => {
  const db = getDb();
  const session = db
    .prepare(
      `SELECT c.*, f.name as facility_name, f.facility_code
       FROM conveyor_sessions c
       JOIN facilities f ON f.id = c.facility_id
       WHERE c.id = ? AND c.organization_id = ?`
    )
    .get(req.params.id, req.auth!.organizationId);

  if (!session) {
    res.status(404).json({ error: 'Conveyor session not found in active organization.' });
    return;
  }

  const decisions = db
    .prepare('SELECT * FROM sorting_decisions WHERE conveyor_session_id = ? AND organization_id = ? ORDER BY created_at DESC LIMIT 40')
    .all(req.params.id, req.auth!.organizationId);

  res.json({
    simulatorNotice: 'Conveyor telemetry operates in local SIMULATOR mode unless connected to an on-site PLC gateway.',
    session,
    decisions,
  });
});

sortingRouter.post('/conveyor/session', authenticate, requirePermission('conveyor:operate'), (req, res) => {
  const { sessionId, facilityId, action, beltSpeedMps, lineName } = req.body as {
    sessionId?: string;
    facilityId?: string;
    action?: 'start' | 'pause' | 'emergency_stop' | 'create';
    beltSpeedMps?: number;
    lineName?: string;
  };
  const db = getDb();

  if (action === 'create' && facilityId) {
    const newId = `conv_${crypto.randomUUID().slice(0, 8)}`;
    db.prepare(
      `INSERT INTO conveyor_sessions (id, organization_id, facility_id, line_name, belt_speed_mps, status, mode)
       VALUES (?, ?, ?, ?, ?, 'running', 'simulator')`
    ).run(newId, req.auth!.organizationId, facilityId, lineName || 'Simulated Optical Belt', Number(beltSpeedMps || 1.8));
    res.status(201).json({ session: db.prepare('SELECT * FROM conveyor_sessions WHERE id = ?').get(newId) });
    return;
  }

  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required.' });
    return;
  }

  const existing = db
    .prepare('SELECT * FROM conveyor_sessions WHERE id = ? AND organization_id = ?')
    .get(sessionId, req.auth!.organizationId);
  if (!existing) {
    res.status(404).json({ error: 'Conveyor session not found.' });
    return;
  }

  const nextStatus = action === 'start' ? 'running' : action === 'emergency_stop' ? 'emergency_stop' : 'paused';
  db.prepare('UPDATE conveyor_sessions SET status = ?, belt_speed_mps = COALESCE(?, belt_speed_mps) WHERE id = ?').run(
    nextStatus,
    typeof beltSpeedMps === 'number' ? beltSpeedMps : null,
    sessionId
  );

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: `conveyor.${nextStatus}`,
    resourceType: 'conveyor_session',
    resourceId: sessionId,
  });

  res.json({ session: db.prepare('SELECT * FROM conveyor_sessions WHERE id = ?').get(sessionId) });
});

sortingRouter.post('/conveyor/tick', authenticate, requirePermission('conveyor:operate'), (req, res) => {
  const { sessionId } = req.body as { sessionId?: string };
  const db = getDb();
  const session = db
    .prepare('SELECT * FROM conveyor_sessions WHERE id = ? AND organization_id = ?')
    .get(sessionId, req.auth!.organizationId) as
    | { id: string; facility_id: string; status: string; belt_speed_mps: number }
    | undefined;
  if (!session) {
    res.status(404).json({ error: 'Conveyor session not found.' });
    return;
  }
  if (session.status !== 'running') {
    res.status(400).json({ error: `Conveyor is currently '${session.status}'. Start the belt before running simulation ticks.` });
    return;
  }

  const streamPool = [
    { mat: 'PET_01', conf: 0.93, chute: 'chute_pet_clear', reject: 0, reason: 'Clear PET #1 optical match -> Air-Jet Port 1' },
    { mat: 'ALUM_CAN', conf: 0.96, chute: 'chute_eddy_aluminum', reject: 0, reason: 'Non-ferrous aluminum -> Eddy Current Chute 4' },
    { mat: 'OCC_CARD', conf: 0.89, chute: 'chute_fiber_occ', reject: 0, reason: 'Dry OCC fiber -> Star Screen Over-Fraction' },
    { mat: 'HDPE_02', conf: 0.91, chute: 'chute_hdpe_rigid', reject: 0, reason: 'Rigid HDPE #2 -> Air-Jet Port 2' },
    { mat: 'COMP_MLP', conf: 0.84, chute: 'chute_reject_residue', reject: 1, reason: 'Multi-layer foil pouch -> Reject Residue Chute 7' },
    { mat: 'UNKNOWN_OOD', conf: 0.56, chute: 'chute_manual_qc', reject: 1, reason: 'Confidence < 0.72 -> Manual QC Verification Belt' },
  ];
  const pick = streamPool[Math.floor(Math.random() * streamPool.length)];
  const decId = `dec_${crypto.randomUUID().slice(0, 10)}`;

  db.prepare(
    `INSERT INTO sorting_decisions (id, organization_id, facility_id, conveyor_session_id, material_code, confidence, assigned_chute, is_rejection_stream, decision_reason, plc_command_payload_json, executed_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'simulated')`
  ).run(
    decId,
    req.auth!.organizationId,
    session.facility_id,
    session.id,
    pick.mat,
    pick.conf,
    pick.chute,
    pick.reject,
    pick.reason,
    JSON.stringify({ mode: 'SIMULATOR', plcRegister: 'DB104.DBW12', chute: pick.chute, beltSpeedMps: session.belt_speed_mps })
  );

  db.prepare(
    'UPDATE conveyor_sessions SET items_processed = items_processed + 1, items_diverted_reject = items_diverted_reject + ? WHERE id = ?'
  ).run(pick.reject, session.id);

  res.json({
    mode: 'SIMULATOR',
    decision: db.prepare('SELECT * FROM sorting_decisions WHERE id = ?').get(decId),
    session: db.prepare('SELECT * FROM conveyor_sessions WHERE id = ?').get(session.id),
  });
});

// Industrial Integration Adapters (PLC / Robotic Arm / Camera) — Explicitly Simulator Mode
sortingRouter.get('/integrations/devices', authenticate, (req, res) => {
  const db = getDb();
  const devices = db
    .prepare(
      `SELECT d.*, f.name as facility_name
       FROM integration_devices d
       JOIN facilities f ON f.id = d.facility_id
       WHERE d.organization_id = ?`
    )
    .all(req.auth!.organizationId);
  const events = db
    .prepare(
      `SELECT e.*, d.name as device_name
       FROM integration_events e
       JOIN integration_devices d ON d.id = e.device_id
       WHERE e.organization_id = ?
       ORDER BY e.created_at DESC LIMIT 30`
    )
    .all(req.auth!.organizationId);

  res.json({
    hardwareStatusNotice: 'NO PHYSICAL PLC OR ROBOT HARDWARE IS CONNECTED IN THIS SANDBOX. All adapters run in documented SIMULATOR mode.',
    devices,
    events,
  });
});

sortingRouter.post('/integrations/plc-command', authenticate, requirePermission('sorting:write'), (req, res) => {
  const { deviceId, command, chuteId } = req.body as { deviceId?: string; command?: string; chuteId?: string };
  if (!deviceId || !command) {
    res.status(400).json({ error: 'deviceId and command are required.' });
    return;
  }
  const db = getDb();
  const device = db
    .prepare('SELECT * FROM integration_devices WHERE id = ? AND organization_id = ?')
    .get(deviceId, req.auth!.organizationId) as { id: string; connection_mode: string } | undefined;
  if (!device) {
    res.status(404).json({ error: 'Integration device not found.' });
    return;
  }

  const eventId = `iev_${crypto.randomUUID().slice(0, 10)}`;
  const payload = {
    mode: device.connection_mode,
    simulatedHardwareConnected: false,
    command,
    chuteId: chuteId || 'chute_manual_qc',
    modbusCoil: command === 'EMERGENCY_STOP' ? 'COIL_0001_ESTOP' : 'COIL_0042_ACTUATE',
    timestamp: new Date().toISOString(),
  };

  db.prepare(
    'INSERT INTO integration_events (id, device_id, organization_id, event_type, payload_json, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(eventId, device.id, req.auth!.organizationId, 'plc_command_simulated', JSON.stringify(payload), 'simulated_ack');

  db.prepare("UPDATE integration_devices SET last_heartbeat_at = datetime('now') WHERE id = ?").run(device.id);

  res.json({ simulated: true, eventId, payload });
});

sortingRouter.post('/integrations/robotic-pick', authenticate, requirePermission('sorting:write'), (req, res) => {
  const { deviceId, materialCode, bboxNormalized, targetChute } = req.body as {
    deviceId?: string;
    materialCode?: string;
    bboxNormalized?: [number, number, number, number];
    targetChute?: string;
  };
  const db = getDb();
  const device = deviceId
    ? (db.prepare('SELECT id FROM integration_devices WHERE id = ? AND organization_id = ?').get(deviceId, req.auth!.organizationId) as { id: string } | undefined)
    : (db.prepare("SELECT id FROM integration_devices WHERE organization_id = ? AND device_type = 'robotic_arm' LIMIT 1").get(req.auth!.organizationId) as { id: string } | undefined);

  if (!device) {
    res.status(404).json({ error: 'Robotic arm integration adapter not configured for organization.' });
    return;
  }

  const [ymin, xmin, ymax, xmax] = bboxNormalized || [200, 300, 450, 550];
  const pickPointMm = {
    x_mm: Math.round(((xmin + xmax) / 2000) * 1200),
    y_mm: Math.round(((ymin + ymax) / 2000) * 800),
    z_approach_mm: 180,
  };
  const eventId = `iev_${crypto.randomUUID().slice(0, 10)}`;
  const payload = {
    mode: 'simulator',
    materialCode: materialCode || 'PET_01',
    targetChute: targetChute || 'chute_pet_clear',
    pickPointMm,
  };

  db.prepare(
    'INSERT INTO integration_events (id, device_id, organization_id, event_type, payload_json, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(eventId, device.id, req.auth!.organizationId, 'robotic_pick_dispatch_simulated', JSON.stringify(payload), 'simulated_ack');

  res.json({ simulated: true, eventId, payload });
});

sortingRouter.post('/integrations/test-device', authenticate, (req, res) => {
  const { deviceId } = req.body as { deviceId?: string };
  const db = getDb();
  const device = db
    .prepare('SELECT * FROM integration_devices WHERE id = ? AND organization_id = ?')
    .get(deviceId, req.auth!.organizationId) as { id: string; name: string; protocol: string; connection_mode: string } | undefined;
  if (!device) {
    res.status(404).json({ error: 'Device not found.' });
    return;
  }

  const eventId = `iev_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(
    'INSERT INTO integration_events (id, device_id, organization_id, event_type, payload_json, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    eventId,
    device.id,
    req.auth!.organizationId,
    'adapter_heartbeat_simulated',
    JSON.stringify({ mode: device.connection_mode, protocol: device.protocol, note: 'Simulator handshake OK; physical hardware not attached.' }),
    'simulated_ok'
  );
  db.prepare("UPDATE integration_devices SET last_heartbeat_at = datetime('now') WHERE id = ?").run(device.id);

  res.json({
    ok: true,
    simulated: true,
    message: `Simulator adapter check succeeded for ${device.name} (${device.protocol}). Physical equipment is NOT attached in this environment.`,
  });
});
