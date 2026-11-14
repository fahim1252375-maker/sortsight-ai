-- SortSight AI Enterprise Transformation Migration 002
-- Adds Saved Dashboard Views, Shift Handover & Incident Reports, Search History,
-- and Intelligent Alert Management columns on notifications.

CREATE TABLE IF NOT EXISTS saved_dashboard_views (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL,
  is_shared INTEGER NOT NULL DEFAULT 1,
  is_demo_data INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_saved_views_org ON saved_dashboard_views(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shift_handovers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  shift_label TEXT NOT NULL,
  outgoing_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  outgoing_user_name TEXT NOT NULL,
  incoming_user_name TEXT NOT NULL DEFAULT '',
  summary_notes TEXT NOT NULL,
  safety_notes TEXT NOT NULL DEFAULT '',
  conveyor_status_snapshot TEXT NOT NULL DEFAULT 'paused',
  open_hazards_count INTEGER NOT NULL DEFAULT 0,
  pending_reviews_count INTEGER NOT NULL DEFAULT 0,
  items_processed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'acknowledged')),
  signed_off_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  signed_off_by_name TEXT,
  signed_off_at TEXT,
  is_demo_data INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_handovers_org ON shift_handovers(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS recent_searches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recent_searches_user ON recent_searches(organization_id, user_id, created_at DESC);

ALTER TABLE notifications ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE notifications ADD COLUMN facility_id TEXT REFERENCES facilities(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN assigned_to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN acknowledged_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN acknowledged_at TEXT;
ALTER TABLE notifications ADD COLUMN resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN resolved_at TEXT;
ALTER TABLE notifications ADD COLUMN group_key TEXT;
ALTER TABLE notifications ADD COLUMN occurrence_count INTEGER NOT NULL DEFAULT 1;
