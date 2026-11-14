import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { getDb } from '../db/database.ts';
import { authenticate, recordAuditLog, requirePermission, signAuthToken } from '../middleware/auth.ts';

export const authRouter = Router();

// Public: List available demo personas (never exposes hashes or secrets)
authRouter.get('/auth/demo-accounts', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.email, u.full_name, m.role_name, o.name as organization_name, f.name as facility_name
       FROM users u
       JOIN organization_memberships m ON m.user_id = u.id
       JOIN organizations o ON o.id = m.organization_id
       LEFT JOIN facilities f ON f.id = m.assigned_facility_id
       WHERE u.is_demo_data = 1
       ORDER BY u.id`
    )
    .all();
  res.json({ demoModeNote: 'Demo accounts share password SortSightDemo2026! for sandbox evaluation.', accounts: rows });
});

authRouter.post('/auth/login', (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }
  const db = getDb();
  const user = db
    .prepare('SELECT id, email, password_hash, full_name, preferred_language, avatar_initials, is_active FROM users WHERE LOWER(email) = LOWER(?)')
    .get(email.trim()) as
    | { id: string; email: string; password_hash: string; full_name: string; preferred_language: string; avatar_initials: string; is_active: number }
    | undefined;

  if (!user || user.is_active !== 1 || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const membership = db
    .prepare(
      `SELECT m.organization_id, m.role_name, m.assigned_facility_id, o.name as org_name, r.permissions_json
       FROM organization_memberships m
       JOIN organizations o ON o.id = m.organization_id
       JOIN roles_permissions r ON r.role_name = m.role_name
       WHERE m.user_id = ? AND m.is_active = 1
       LIMIT 1`
    )
    .get(user.id) as
    | { organization_id: string; role_name: string; assigned_facility_id: string | null; org_name: string; permissions_json: string }
    | undefined;

  if (!membership) {
    res.status(403).json({ error: 'No active organization membership found for user.' });
    return;
  }

  const token = signAuthToken({
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    organizationId: membership.organization_id,
    roleName: membership.role_name,
  });

  recordAuditLog({
    organizationId: membership.organization_id,
    userId: user.id,
    actorEmail: user.email,
    action: 'auth.login',
    resourceType: 'user',
    resourceId: user.id,
    ipAddress: req.ip,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      preferredLanguage: user.preferred_language,
      avatarInitials: user.avatar_initials,
      organizationId: membership.organization_id,
      organizationName: membership.org_name,
      roleName: membership.role_name,
      assignedFacilityId: membership.assigned_facility_id,
      permissions: JSON.parse(membership.permissions_json || '[]'),
    },
  });
});

authRouter.post('/auth/register', (req, res) => {
  const { email, password, fullName, organizationName, countryCode, region } = req.body as {
    email?: string;
    password?: string;
    fullName?: string;
    organizationName?: string;
    countryCode?: string;
    region?: string;
  };

  if (!email || !password || !fullName || password.length < 8) {
    res.status(400).json({ error: 'Valid email, fullName, and password (min 8 chars) are required.' });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const userId = `usr_${crypto.randomUUID().slice(0, 10)}`;
  const orgId = `org_${crypto.randomUUID().slice(0, 10)}`;
  const facId = `fac_${crypto.randomUUID().slice(0, 10)}`;
  const orgTitle = (organizationName || `${fullName.split(' ')[0]}'s Recovery Org`).trim();
  const slug = `${orgTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomBytes(2).toString('hex')}`;
  const initials = fullName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const hash = bcrypt.hashSync(password, 10);

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO users (id, email, password_hash, full_name, avatar_initials) VALUES (?, ?, ?, ?, ?)').run(
      userId,
      email.trim().toLowerCase(),
      hash,
      fullName.trim(),
      initials || 'SS'
    );
    db.prepare('INSERT INTO organizations (id, name, slug, country_code, region) VALUES (?, ?, ?, ?, ?)').run(
      orgId,
      orgTitle,
      slug,
      (countryCode || 'US').toUpperCase().slice(0, 2),
      region || 'Global'
    );
    db.prepare(
      `INSERT INTO facilities (id, organization_id, name, facility_code, country_code, region, city, capacity_tons_per_day)
       VALUES (?, ?, ?, ?, ?, ?, ?, 100)`
    ).run(facId, orgId, `${orgTitle} Primary MRF`, `MRF-${crypto.randomBytes(2).toString('hex').toUpperCase()}`, (countryCode || 'US').toUpperCase().slice(0, 2), region || 'Global', 'Primary Hub');

    db.prepare(
      'INSERT INTO organization_memberships (id, organization_id, user_id, role_name, assigned_facility_id) VALUES (?, ?, ?, ?, ?)'
    ).run(`mem_${crypto.randomUUID().slice(0, 10)}`, orgId, userId, 'admin', facId);

    // Seed starter digital twin & sorting rule for new org
    db.prepare(
      'INSERT INTO sorting_configurations (id, organization_id, facility_id, name, rules_json) VALUES (?, ?, ?, ?, ?)'
    ).run(`sort_${crypto.randomUUID().slice(0, 8)}`, orgId, facId, 'Default Facility Sorting Policy', JSON.stringify({ hazardAutoStop: true, lowConfidenceRoute: 'chute_manual_qc', chutes: [] }));

    db.prepare(
      'INSERT INTO digital_twin_configs (id, organization_id, facility_id, name, stages_json) VALUES (?, ?, ?, ?, ?)'
    ).run(
      `twin_${crypto.randomUUID().slice(0, 8)}`,
      orgId,
      facId,
      'Starter 5-Stage MRF Twin',
      JSON.stringify([
        { id: 'stg_infeed', name: 'Infeed & Metering', capacityTph: 15, currentLoadTph: 10, contaminationRisk: 0.15, recoveryEff: 0.98 },
        { id: 'stg_presort', name: 'Pre-Sort Hazard Pull', capacityTph: 15, currentLoadTph: 9.8, contaminationRisk: 0.2, recoveryEff: 0.94 },
        { id: 'stg_optical', name: 'Optical Polymer Sorter', capacityTph: 12, currentLoadTph: 8.5, contaminationRisk: 0.08, recoveryEff: 0.95 },
        { id: 'stg_metals', name: 'Magnet & Eddy Current', capacityTph: 8, currentLoadTph: 3.0, contaminationRisk: 0.04, recoveryEff: 0.97 },
        { id: 'stg_baler', name: 'Automated Baler', capacityTph: 12, currentLoadTph: 8.0, contaminationRisk: 0.03, recoveryEff: 0.99 },
      ])
    );
  });
  tx();

  const token = signAuthToken({
    userId,
    email: email.trim().toLowerCase(),
    fullName: fullName.trim(),
    organizationId: orgId,
    roleName: 'admin',
  });

  recordAuditLog({
    organizationId: orgId,
    userId,
    actorEmail: email.trim().toLowerCase(),
    action: 'auth.register_organization',
    resourceType: 'organization',
    resourceId: orgId,
  });

  res.status(201).json({
    token,
    user: {
      id: userId,
      email: email.trim().toLowerCase(),
      fullName: fullName.trim(),
      preferredLanguage: 'en',
      avatarInitials: initials || 'SS',
      organizationId: orgId,
      organizationName: orgTitle,
      roleName: 'admin',
      assignedFacilityId: facId,
      permissions: ['*'],
    },
  });
});

authRouter.get('/auth/me', authenticate, (req, res) => {
  const db = getDb();
  const user = db
    .prepare('SELECT id, email, full_name, preferred_language, avatar_initials, created_at FROM users WHERE id = ?')
    .get(req.auth!.userId) as Record<string, unknown> | undefined;
  const org = db
    .prepare('SELECT id, name, slug, country_code, region, industry_type, privacy_retention_days, store_detection_images FROM organizations WHERE id = ?')
    .get(req.auth!.organizationId) as Record<string, unknown> | undefined;

  res.json({
    user: user ? { ...user, roleName: req.auth!.roleName, permissions: req.auth!.permissions } : null,
    organization: org || null,
  });
});

authRouter.put('/users/me/preferences', authenticate, (req, res) => {
  const { fullName, preferredLanguage } = req.body as { fullName?: string; preferredLanguage?: string };
  const db = getDb();
  const allowedLangs = ['en', 'sv', 'de', 'es', 'ja'];
  const lang = preferredLanguage && allowedLangs.includes(preferredLanguage) ? preferredLanguage : undefined;

  if (fullName && fullName.trim().length > 1) {
    db.prepare("UPDATE users SET full_name = ?, updated_at = datetime('now') WHERE id = ?").run(fullName.trim(), req.auth!.userId);
  }
  if (lang) {
    db.prepare("UPDATE users SET preferred_language = ?, updated_at = datetime('now') WHERE id = ?").run(lang, req.auth!.userId);
  }

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'user.preferences_updated',
    resourceType: 'user',
    resourceId: req.auth!.userId,
    details: { preferredLanguage: lang },
  });

  res.json({ ok: true, preferredLanguage: lang });
});

// Organization Management & Team RBAC
authRouter.get('/organizations/current', authenticate, (req, res) => {
  const db = getDb();
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(req.auth!.organizationId);
  res.json({ organization: org });
});

authRouter.put('/organizations/current', authenticate, requirePermission('*'), (req, res) => {
  const { name, countryCode, region, industryType, privacyRetentionDays, storeDetectionImages } = req.body as {
    name?: string;
    countryCode?: string;
    region?: string;
    industryType?: string;
    privacyRetentionDays?: number;
    storeDetectionImages?: boolean;
  };
  const db = getDb();
  db.prepare(
    `UPDATE organizations SET
      name = COALESCE(?, name),
      country_code = COALESCE(?, country_code),
      region = COALESCE(?, region),
      industry_type = COALESCE(?, industry_type),
      privacy_retention_days = COALESCE(?, privacy_retention_days),
      store_detection_images = COALESCE(?, store_detection_images),
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name || null,
    countryCode || null,
    region || null,
    industryType || null,
    typeof privacyRetentionDays === 'number' ? Math.max(7, Math.min(3650, privacyRetentionDays)) : null,
    typeof storeDetectionImages === 'boolean' ? (storeDetectionImages ? 1 : 0) : null,
    req.auth!.organizationId
  );

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'organization.settings_updated',
    resourceType: 'organization',
    resourceId: req.auth!.organizationId,
  });

  res.json({ organization: db.prepare('SELECT * FROM organizations WHERE id = ?').get(req.auth!.organizationId) });
});

authRouter.post('/organizations', authenticate, (req, res) => {
  const { name, countryCode, region, industryType } = req.body as {
    name?: string;
    countryCode?: string;
    region?: string;
    industryType?: string;
  };
  if (!name || name.trim().length < 2) {
    res.status(400).json({ error: 'Organization name is required.' });
    return;
  }
  const db = getDb();
  const orgId = `org_${crypto.randomUUID().slice(0, 10)}`;
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomBytes(2).toString('hex')}`;
  db.prepare('INSERT INTO organizations (id, name, slug, country_code, region, industry_type) VALUES (?, ?, ?, ?, ?, ?)').run(
    orgId,
    name.trim(),
    slug,
    countryCode || 'US',
    region || 'Global',
    industryType || 'MRF Operator'
  );
  db.prepare('INSERT INTO organization_memberships (id, organization_id, user_id, role_name) VALUES (?, ?, ?, ?)').run(
    `mem_${crypto.randomUUID().slice(0, 10)}`,
    orgId,
    req.auth!.userId,
    'admin'
  );
  res.status(201).json({ organization: db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId) });
});

authRouter.get('/organizations/members', authenticate, (req, res) => {
  const db = getDb();
  const members = db
    .prepare(
      `SELECT m.id as membership_id, m.role_name, m.assigned_facility_id, m.is_active, m.created_at,
              u.id as user_id, u.email, u.full_name, u.avatar_initials, f.name as facility_name
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN facilities f ON f.id = m.assigned_facility_id
       WHERE m.organization_id = ?
       ORDER BY m.created_at ASC`
    )
    .all(req.auth!.organizationId);
  const roles = db.prepare('SELECT role_name, description FROM roles_permissions').all();
  res.json({ members, roles });
});

authRouter.post('/organizations/members', authenticate, requirePermission('*'), (req, res) => {
  const { email, fullName, roleName, assignedFacilityId, temporaryPassword } = req.body as {
    email?: string;
    fullName?: string;
    roleName?: string;
    assignedFacilityId?: string;
    temporaryPassword?: string;
  };
  if (!email || !fullName || !roleName) {
    res.status(400).json({ error: 'email, fullName, and roleName are required.' });
    return;
  }
  const db = getDb();
  const roleExists = db.prepare('SELECT role_name FROM roles_permissions WHERE role_name = ?').get(roleName);
  if (!roleExists) {
    res.status(400).json({ error: 'Invalid role_name specified.' });
    return;
  }
  let user = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim()) as { id: string } | undefined;
  if (!user) {
    const newId = `usr_${crypto.randomUUID().slice(0, 10)}`;
    const hash = bcrypt.hashSync(temporaryPassword || crypto.randomBytes(12).toString('hex'), 10);
    const initials = fullName.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);
    db.prepare('INSERT INTO users (id, email, password_hash, full_name, avatar_initials) VALUES (?, ?, ?, ?, ?)').run(
      newId,
      email.trim().toLowerCase(),
      hash,
      fullName.trim(),
      initials || 'OP'
    );
    user = { id: newId };
  }
  const memId = `mem_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(
    'INSERT OR REPLACE INTO organization_memberships (id, organization_id, user_id, role_name, assigned_facility_id, is_active) VALUES (?, ?, ?, ?, ?, 1)'
  ).run(memId, req.auth!.organizationId, user.id, roleName, assignedFacilityId || null);

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'team.member_added',
    resourceType: 'membership',
    resourceId: memId,
    details: { targetEmail: email, roleName },
  });

  res.status(201).json({ ok: true, membershipId: memId });
});

authRouter.put('/organizations/members/:id', authenticate, requirePermission('*'), (req, res) => {
  const { roleName, assignedFacilityId, isActive } = req.body as {
    roleName?: string;
    assignedFacilityId?: string | null;
    isActive?: boolean;
  };
  const db = getDb();
  const row = db
    .prepare('SELECT id FROM organization_memberships WHERE id = ? AND organization_id = ?')
    .get(req.params.id, req.auth!.organizationId);
  if (!row) {
    res.status(404).json({ error: 'Membership not found in active organization.' });
    return;
  }
  db.prepare(
    `UPDATE organization_memberships SET
      role_name = COALESCE(?, role_name),
      assigned_facility_id = COALESCE(?, assigned_facility_id),
      is_active = COALESCE(?, is_active)
     WHERE id = ? AND organization_id = ?`
  ).run(
    roleName || null,
    assignedFacilityId === undefined ? null : assignedFacilityId,
    typeof isActive === 'boolean' ? (isActive ? 1 : 0) : null,
    req.params.id,
    req.auth!.organizationId
  );

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'team.role_updated',
    resourceType: 'membership',
    resourceId: req.params.id,
    details: { roleName, isActive },
  });

  res.json({ ok: true });
});

// Facilities (Tenant-Scoped CRUD + Public Global Directory)
authRouter.get('/facilities', authenticate, (req, res) => {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM facilities WHERE organization_id = ? ORDER BY created_at ASC')
    .all(req.auth!.organizationId);
  res.json({ facilities: rows });
});

authRouter.post('/facilities', authenticate, requirePermission('facilities:write'), (req, res) => {
  const { name, facilityCode, facilityType, countryCode, region, city, capacityTonsPerDay } = req.body as {
    name?: string;
    facilityCode?: string;
    facilityType?: string;
    countryCode?: string;
    region?: string;
    city?: string;
    capacityTonsPerDay?: number;
  };
  if (!name || !countryCode || !city) {
    res.status(400).json({ error: 'name, countryCode, and city are required.' });
    return;
  }
  const db = getDb();
  const id = `fac_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(
    `INSERT INTO facilities (id, organization_id, name, facility_code, facility_type, country_code, region, city, capacity_tons_per_day)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.auth!.organizationId,
    name.trim(),
    facilityCode || `MRF-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    facilityType || 'Material Recovery Facility',
    countryCode.toUpperCase().slice(0, 2),
    region || 'Global',
    city.trim(),
    Number(capacityTonsPerDay || 120)
  );

  recordAuditLog({
    organizationId: req.auth!.organizationId,
    userId: req.auth!.userId,
    actorEmail: req.auth!.email,
    action: 'facility.created',
    resourceType: 'facility',
    resourceId: id,
    details: { name, countryCode, city },
  });

  res.status(201).json({ facility: db.prepare('SELECT * FROM facilities WHERE id = ?').get(id) });
});

authRouter.get('/facilities/directory', (req, res) => {
  const db = getDb();
  const q = String(req.query.q || '').trim().toLowerCase();
  const country = String(req.query.country || '').trim().toUpperCase();
  let sql = `
    SELECT f.id, f.name, f.facility_code, f.facility_type, f.country_code, f.region, f.city, f.capacity_tons_per_day, f.status, f.is_demo_data,
           o.name as organization_name
    FROM facilities f
    JOIN organizations o ON o.id = f.organization_id
    WHERE f.is_public_directory = 1
  `;
  const params: unknown[] = [];
  if (country) {
    sql += ' AND f.country_code = ?';
    params.push(country);
  }
  if (q) {
    sql += ' AND (LOWER(f.name) LIKE ? OR LOWER(f.city) LIKE ? OR LOWER(f.region) LIKE ? OR LOWER(f.facility_type) LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY f.country_code, f.name';
  const facilities = db.prepare(sql).all(...params);
  res.json({ facilities });
});

authRouter.get('/facilities/directory/:id', (req, res) => {
  const db = getDb();
  const facility = db
    .prepare(
      `SELECT f.id, f.name, f.facility_code, f.facility_type, f.country_code, f.region, f.city, f.capacity_tons_per_day, f.status, f.is_demo_data,
              o.name as organization_name
       FROM facilities f
       JOIN organizations o ON o.id = f.organization_id
       WHERE f.id = ? AND f.is_public_directory = 1`
    )
    .get(req.params.id);
  if (!facility) {
    res.status(404).json({ error: 'Public facility not found.' });
    return;
  }
  res.json({ facility });
});

authRouter.get('/facilities/:id', authenticate, (req, res) => {
  const db = getDb();
  const facility = db
    .prepare(
      `SELECT f.*, o.name as organization_name
       FROM facilities f
       JOIN organizations o ON o.id = f.organization_id
       WHERE f.id = ? AND (f.organization_id = ? OR f.is_public_directory = 1)`
    )
    .get(req.params.id, req.auth!.organizationId) as Record<string, unknown> | undefined;

  if (!facility) {
    res.status(404).json({ error: 'Facility not found.' });
    return;
  }

  const isOwned = facility.organization_id === req.auth!.organizationId;
  const snapshots = isOwned
    ? db
        .prepare('SELECT * FROM analytics_snapshots WHERE organization_id = ? AND facility_id = ? ORDER BY snapshot_date ASC')
        .all(req.auth!.organizationId, req.params.id)
    : [];
  const batches = isOwned
    ? db
        .prepare('SELECT * FROM processing_batches WHERE organization_id = ? AND facility_id = ? ORDER BY created_at DESC LIMIT 10')
        .all(req.auth!.organizationId, req.params.id)
    : [];
  const conveyorSessions = isOwned
    ? db
        .prepare('SELECT * FROM conveyor_sessions WHERE organization_id = ? AND facility_id = ? ORDER BY started_at DESC LIMIT 6')
        .all(req.auth!.organizationId, req.params.id)
    : [];
  const openHazards = isOwned
    ? db
        .prepare("SELECT * FROM hazard_alerts WHERE organization_id = ? AND facility_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 6")
        .all(req.auth!.organizationId, req.params.id)
    : [];

  res.json({ facility, isOwned, snapshots, batches, conveyorSessions, openHazards });
});
