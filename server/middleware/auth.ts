import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.ts';
import { getDb } from '../db/database.ts';

export interface AuthContext {
  userId: string;
  email: string;
  fullName: string;
  organizationId: string;
  roleName: string;
  permissions: string[];
  authMethod: 'jwt' | 'api_key';
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function signAuthToken(payload: {
  userId: string;
  email: string;
  fullName: string;
  organizationId: string;
  roleName: string;
}): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '12h' });
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const db = getDb();
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];

  if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim().length > 0) {
    const hashed = hashApiKey(apiKeyHeader.trim());
    const keyRow = db
      .prepare(
        `SELECT k.id, k.organization_id, k.scopes_json, k.created_by, u.email, u.full_name
         FROM api_keys k
         LEFT JOIN users u ON u.id = k.created_by
         WHERE k.key_hash = ? AND k.is_revoked = 0`
      )
      .get(hashed) as
      | {
          id: string;
          organization_id: string;
          scopes_json: string;
          created_by: string | null;
          email: string | null;
          full_name: string | null;
        }
      | undefined;

    if (!keyRow) {
      res.status(401).json({ error: 'Invalid or revoked API key.' });
      return;
    }

    db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(keyRow.id);
    const scopes = JSON.parse(keyRow.scopes_json || '[]') as string[];

    req.auth = {
      userId: keyRow.created_by || `apikey:${keyRow.id}`,
      email: keyRow.email || `api-key-${keyRow.id}@sortsight.local`,
      fullName: keyRow.full_name || 'API Integration Client',
      organizationId: keyRow.organization_id,
      roleName: 'api_client',
      permissions: scopes.includes('admin') ? ['*'] : ['detections:read', 'detections:write', 'sorting:read', 'sorting:write', 'analytics:read', 'facilities:read', 'policies:read', 'operations:read'],
      authMethod: 'api_key',
    };
    next();
    return;
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Provide Bearer token or x-api-key header.' });
    return;
  }

  const token = authHeader.slice(7).trim();
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      userId: string;
      email: string;
      fullName: string;
      organizationId: string;
      roleName: string;
    };

    const membership = db
      .prepare(
        `SELECT m.role_name, r.permissions_json, u.is_active
         FROM organization_memberships m
         JOIN roles_permissions r ON r.role_name = m.role_name
         JOIN users u ON u.id = m.user_id
         WHERE m.user_id = ? AND m.organization_id = ? AND m.is_active = 1`
      )
      .get(decoded.userId, decoded.organizationId) as
      | { role_name: string; permissions_json: string; is_active: number }
      | undefined;

    if (!membership || membership.is_active !== 1) {
      res.status(403).json({ error: 'Organization membership inactive or unauthorized.' });
      return;
    }

    req.auth = {
      userId: decoded.userId,
      email: decoded.email,
      fullName: decoded.fullName,
      organizationId: decoded.organizationId,
      roleName: membership.role_name,
      permissions: JSON.parse(membership.permissions_json || '[]'),
      authMethod: 'jwt',
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Unauthenticated request.' });
      return;
    }
    const perms = req.auth.permissions;
    if (perms.includes('*') || perms.includes(permission)) {
      next();
      return;
    }
    res.status(403).json({
      error: `Forbidden: role '${req.auth.roleName}' lacks required permission '${permission}'.`,
    });
  };
}

export function recordAuditLog(params: {
  organizationId?: string | null;
  userId?: string | null;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO audit_logs (id, organization_id, user_id, actor_email, action, resource_type, resource_id, details_json, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `aud_${crypto.randomUUID().slice(0, 12)}`,
      params.organizationId ?? null,
      params.userId ?? null,
      params.actorEmail,
      params.action,
      params.resourceType,
      params.resourceId ?? null,
      JSON.stringify(params.details ?? {}),
      params.ipAddress || '127.0.0.1'
    );
  } catch (err) {
    console.error('Audit log insert failed:', err);
  }
}
